import { config } from "../../../config.js";
import { chunk, unwrap } from "../../../lib/db.js";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { mlGetWithRetry } from "./client.js";

const PAGE_SIZE = 100;
const LISTING_DETAIL_BATCH_SIZE = 20;

type MercadoLivreItem = {
  id: string;
  title: string;
  category_id?: string | null;
  status: string;
  condition?: string | null;
  price?: number | null;
  available_quantity?: number | null;
  permalink?: string | null;
  catalog_listing?: boolean | null;
  listing_type_id?: string | null;
  attributes?: Array<{ id?: string | null; value_name?: string | null; value_id?: string | null }> | null;
  shipping?: { logistic_type?: string | null } | null;
};

function normalizeListingType(value: string | null | undefined) {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "gold_special":
    case "premium":
      return "premium";
    case "gold_pro":
    case "classic":
      return "classic";
    default:
      return value.trim().toLowerCase();
  }
}

// O filtro status=all nao existe na API do Mercado Livre -- confirmado em
// producao (conta real, platinum, 24k transacoes): status=all devolvia 0,
// status=active devolvia 83, e sem filtro nenhum devolvia 124 (todos os
// status). Sem filtro de status a API ja retorna itens em qualquer status,
// que e a intencao original de "status=all" (portado errado do app antigo,
// que tinha o mesmo bug).
async function fetchSellerListingIds(accessToken: string, sellerId: string) {
  const itemIds: string[] = [];
  let offset = 0;

  while (true) {
    const search = await mlGetWithRetry<{ results?: string[] }>(
      config.MERCADO_LIVRE_API_BASE_URL,
      accessToken,
      `/users/${sellerId}/items/search?limit=${PAGE_SIZE}&offset=${offset}`
    );
    const results = (search.results ?? []).map(String);
    if (results.length === 0) break;
    itemIds.push(...results);
    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return itemIds;
}

async function fetchListing(accessToken: string, itemId: string) {
  return mlGetWithRetry<MercadoLivreItem>(config.MERCADO_LIVRE_API_BASE_URL, accessToken, `/items/${itemId}`);
}

async function fetchCategoryName(accessToken: string, categoryId: string) {
  try {
    const category = await mlGetWithRetry<{ name?: string | null }>(
      config.MERCADO_LIVRE_API_BASE_URL,
      accessToken,
      `/categories/${encodeURIComponent(categoryId)}`
    );
    return category.name?.trim() || null;
  } catch {
    return null;
  }
}

// Checa quais itens estao em campanhas de Product Ads ativas, via a API v2
// de anunciante. Se o seller nao tiver advertiser_id ou a chamada falhar
// (conta sem Ads ativo, rate limit, etc.), degrada graciosamente para
// has_ads=false em vez de derrubar a sync inteira -- Ads e informativo, nao
// bloqueante.
async function fetchActiveAdsItemIds(accessToken: string, advertiserId: string, siteId: string) {
  const activeIds = new Set<string>();
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const response = await mlGetWithRetry<{ results?: Array<{ item_id?: string }> }>(
        config.MERCADO_LIVRE_API_BASE_URL,
        accessToken,
        `/advertising/${siteId}/advertisers/${advertiserId}/product_ads/ads/search?statuses=active&limit=${limit}&offset=${offset}`
      );
      const results = response.results ?? [];
      if (results.length === 0) break;
      for (const ad of results) {
        if (ad.item_id) activeIds.add(ad.item_id.trim().toUpperCase());
      }
      if (results.length < limit) break;
      offset += limit;
    }
  } catch (error) {
    console.warn("[ml-listings-sync] falha ao buscar Product Ads ativos", {
      advertiserId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return activeIds;
}

async function fetchActivePromotionItemIds(accessToken: string, itemIds: string[]) {
  const active = new Set<string>();
  const batches = chunk(itemIds, 10);

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (itemId) => {
        try {
          const response = await mlGetWithRetry<
            { status?: string } | Array<{ status?: string }>
          >(config.MERCADO_LIVRE_API_BASE_URL, accessToken, `/seller-promotions/items/${itemId}?app_version=v2`);
          const promotions = Array.isArray(response) ? response : [response];
          if (promotions.some((promo) => promo.status === "started")) {
            active.add(itemId);
          }
        } catch {
          // 404 = item sem nenhuma promocao vinculada, tratado como "sem promo".
        }
      })
    );
  }

  return active;
}

export async function fetchAdvertiserProfile(accessToken: string) {
  try {
    const response = await mlGetWithRetry<{ id: number; site_id: string }>(
      config.MERCADO_LIVRE_API_BASE_URL,
      accessToken,
      "/advertising/product_ads/advertisers/me"
    );
    return { advertiserId: String(response.id), siteId: response.site_id };
  } catch {
    // Nem todo seller tem conta de publicidade ativa -- falha esperada.
    return null;
  }
}

export async function fetchSellerProfile(accessToken: string) {
  const me = await mlGetWithRetry<{ id: number; nickname?: string }>(
    config.MERCADO_LIVRE_API_BASE_URL,
    accessToken,
    "/users/me"
  );
  return { sellerId: String(me.id), nickname: me.nickname ?? `seller-${me.id}` };
}

export type MlAccountForSync = {
  id: string;
  company_id: string;
  seller_id: string;
  advertiser_id: string | null;
};

// Busca todos os anuncios da conta na API do ML e faz upsert em `listings`.
// NAO escreve mais em listing_daily_snapshot -- essa e responsabilidade
// exclusiva do job de agregacao (fase 2), que le listings/orders/order_items
// e calcula o snapshot do dia.
export async function syncListingsForAccount(account: MlAccountForSync, accessToken: string) {
  const itemIds = await fetchSellerListingIds(accessToken, account.seller_id);
  if (itemIds.length === 0) {
    return { listingsUpserted: 0 };
  }

  const listings: MercadoLivreItem[] = [];
  for (const batch of chunk(itemIds, LISTING_DETAIL_BATCH_SIZE)) {
    const batchListings = await Promise.all(
      batch.map((itemId) =>
        fetchListing(accessToken, itemId).catch((error) => {
          console.error(`[ml-listings-sync] falha ao buscar item ${itemId}:`, error instanceof Error ? error.message : error);
          return null;
        })
      )
    );
    listings.push(...batchListings.filter((item): item is MercadoLivreItem => item !== null));
  }

  const siteId = itemIds[0]?.slice(0, 3) ?? "MLB";
  const [activeAdsItemIds, activePromotionItemIds] = await Promise.all([
    account.advertiser_id
      ? fetchActiveAdsItemIds(accessToken, account.advertiser_id, siteId)
      : Promise.resolve(new Set<string>()),
    fetchActivePromotionItemIds(accessToken, listings.map((item) => item.id))
  ]);

  const categoryNameById = new Map<string, string>();
  const missingCategoryIds = Array.from(
    new Set(listings.map((item) => item.category_id).filter((id): id is string => Boolean(id)))
  );
  for (const categoryId of missingCategoryIds) {
    const name = await fetchCategoryName(accessToken, categoryId);
    if (name) categoryNameById.set(categoryId, name);
  }

  const rows = listings.map((item) => ({
    company_id: account.company_id,
    ml_account_id: account.id,
    external_id: item.id,
    title: item.title,
    category_id: item.category_id ?? null,
    category_name: item.category_id ? categoryNameById.get(item.category_id) ?? null : null,
    status: item.status,
    condition: item.condition ?? null,
    price: item.price ?? 0,
    available_quantity: item.available_quantity ?? 0,
    permalink: item.permalink ?? null,
    listing_type: normalizeListingType(item.listing_type_id),
    logistic_type: item.shipping?.logistic_type ?? null,
    is_catalog: item.catalog_listing ?? false,
    has_ads: activeAdsItemIds.has(item.id.toUpperCase()),
    has_promotion: activePromotionItemIds.has(item.id),
    attributes: Object.fromEntries(
      (item.attributes ?? [])
        .filter((attribute) => attribute.id)
        .map((attribute) => [String(attribute.id), attribute.value_name ?? attribute.value_id ?? null])
    )
  }));

  const result = await supabaseAdmin.from("listings").upsert(rows, { onConflict: "company_id,external_id" });
  if (result.error) {
    throw new Error(`Falha ao atualizar listings: ${result.error.message}`);
  }

  return { listingsUpserted: rows.length };
}

export async function getConnectedAccountsForCompany(companyId: string) {
  return unwrap(
    await supabaseAdmin
      .from("ml_accounts")
      .select("id, company_id, seller_id, nickname, access_token, refresh_token, token_expires_at, advertiser_id, status")
      .eq("company_id", companyId)
      .eq("status", "connected")
  );
}
