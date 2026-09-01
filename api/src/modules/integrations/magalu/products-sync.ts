import { config } from "../../../config.js";
import { chunk, unwrap } from "../../../lib/db.js";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { magaluGetWithRetry } from "./client.js";

const PAGE_SIZE = 100;
const DETAIL_BATCH_SIZE = 10;

type MagaluSku = {
  sku: string;
  title: string;
  status: string;
  condition?: string | null;
  fulfillment: boolean;
  url_marketplace?: Array<{ channel: string; url: string }> | null;
};

type MagaluPriceEntry = { price?: number | null; list_price?: number | null; normalizer?: number };
type MagaluStockEntry = { quantity: number; type: "AVAILABLE" | "RESERVED" };

// Status da Magalu (PUBLISHED/UNPUBLISHED/BLOCKED/UNDER_REVIEW/DELETING/
// DELETED) nao bate com o vocabulario que ja usamos pro ML (active/paused/
// closed/under_review) -- normaliza pro mesmo conjunto, senao o filtro de
// Status do Mapa de Vendas (compartilhado entre os dois canais) nao funciona
// pra Magalu.
const STATUS_MAP: Record<string, string> = {
  PUBLISHED: "active",
  UNPUBLISHED: "paused",
  BLOCKED: "closed",
  UNDER_REVIEW: "under_review",
  DELETING: "closed",
  DELETED: "closed"
};

async function fetchAllSkus(accessToken: string) {
  const results: MagaluSku[] = [];
  let offset = 0;

  while (true) {
    const page = await magaluGetWithRetry<{ results?: MagaluSku[] }>(
      config.MAGALU_API_BASE_URL,
      accessToken,
      `/seller/v1/portfolios/skus?_limit=${PAGE_SIZE}&_offset=${offset}`
    );
    const items = page.results ?? [];
    if (items.length === 0) break;
    results.push(...items);
    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

// Preco e estoque nao vem na listagem de SKUs -- sao endpoints por SKU
// individual, sem opcao de busca em lote (confirmado na doc oficial). Uma
// chamada a mais por SKU pra cada um dos dois, em lotes de 10 em paralelo
// (mesmo padrao ja usado pra checar promocao ativa no modulo do ML).
async function fetchPrice(accessToken: string, sku: string) {
  try {
    const response = await magaluGetWithRetry<{ results?: MagaluPriceEntry[] }>(
      config.MAGALU_API_BASE_URL,
      accessToken,
      `/seller/v1/portfolios/prices/${encodeURIComponent(sku)}`
    );
    return response.results?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchAvailableStock(accessToken: string, sku: string) {
  try {
    const response = await magaluGetWithRetry<{ results?: MagaluStockEntry[] }>(
      config.MAGALU_API_BASE_URL,
      accessToken,
      `/seller/v1/portfolios/stocks/${encodeURIComponent(sku)}`
    );
    const entries = response.results ?? [];
    return entries.filter((entry) => entry.type === "AVAILABLE").reduce((sum, entry) => sum + (entry.quantity ?? 0), 0);
  } catch {
    return 0;
  }
}

function pickMarketplaceUrl(sku: MagaluSku) {
  const entries = sku.url_marketplace ?? [];
  return entries.find((entry) => entry.channel?.toLowerCase().includes("magalu"))?.url ?? entries[0]?.url ?? null;
}

export type MagaluAccountForSync = {
  id: string;
  company_id: string;
};

// Busca todos os SKUs do seller na API da Magalu (com preco + estoque) e faz
// upsert em `listings`, channel='magalu'. Mesma divisao de responsabilidade
// do modulo do ML: NAO escreve em listing_daily_snapshot -- isso e do job de
// agregacao, que ja e channel-agnostico (le listings/orders por company_id).
export async function syncSkusForAccount(account: MagaluAccountForSync, accessToken: string) {
  const skus = await fetchAllSkus(accessToken);
  if (skus.length === 0) {
    return { listingsUpserted: 0 };
  }

  const priceBySku = new Map<string, MagaluPriceEntry | null>();
  const stockBySku = new Map<string, number>();

  for (const batch of chunk(skus, DETAIL_BATCH_SIZE)) {
    await Promise.all(
      batch.map(async (sku) => {
        const [price, stock] = await Promise.all([fetchPrice(accessToken, sku.sku), fetchAvailableStock(accessToken, sku.sku)]);
        priceBySku.set(sku.sku, price);
        stockBySku.set(sku.sku, stock);
      })
    );
  }

  const rows = skus.map((sku) => {
    const priceEntry = priceBySku.get(sku.sku);
    const normalizer = priceEntry?.normalizer ?? 100;
    // list_price = preco cheio; price = preco de venda atual (com desconto
    // aplicado, se houver) -- mesmo papel que price/effective_price ja
    // cumprem pro ML.
    const listPrice = priceEntry?.list_price != null ? priceEntry.list_price / normalizer : null;
    const currentPrice = priceEntry?.price != null ? priceEntry.price / normalizer : (listPrice ?? 0);

    return {
      company_id: account.company_id,
      magalu_account_id: account.id,
      ml_account_id: null,
      channel: "magalu" as const,
      external_id: sku.sku,
      title: sku.title,
      status: STATUS_MAP[sku.status] ?? "active",
      condition: sku.condition ?? null,
      price: listPrice ?? currentPrice,
      effective_price: currentPrice,
      available_quantity: stockBySku.get(sku.sku) ?? 0,
      permalink: pickMarketplaceUrl(sku),
      is_catalog: false,
      has_ads: false,
      has_promotion: listPrice !== null && currentPrice < listPrice,
      is_full: sku.fulfillment ?? false,
      // Reaproveita o mesmo mecanismo de exibicao de SKU que ja existe no
      // Mapa de Vendas pro ML (le attributes.SELLER_SKU) -- pra Magalu o
      // "sku" JA E o identificador principal (nao existe um MLB separado),
      // entao mostrar ele aqui e o suficiente sem precisar de mudanca no
      // frontend.
      attributes: { SELLER_SKU: sku.sku }
    };
  });

  const result = await supabaseAdmin.from("listings").upsert(rows, { onConflict: "company_id,external_id" });
  if (result.error) {
    throw new Error(`Falha ao atualizar listings (Magalu): ${result.error.message}`);
  }

  return { listingsUpserted: rows.length };
}

export type MagaluAccountRecord = {
  id: string;
  company_id: string;
  seller_id: string;
  nickname: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
};

export async function getConnectedMagaluAccountsForCompany(companyId: string) {
  return unwrap(
    await supabaseAdmin
      .from("magalu_accounts")
      .select("id, company_id, seller_id, nickname, access_token, refresh_token, token_expires_at, status")
      .eq("company_id", companyId)
      .eq("status", "connected")
  );
}
