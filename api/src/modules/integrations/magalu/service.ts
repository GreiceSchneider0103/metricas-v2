import { config } from "../../../config.js";
import { unwrap } from "../../../lib/db.js";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { magaluGetWithRetry } from "./client.js";
import {
  buildAuthorizationUrl,
  decodeOAuthState,
  exchangeAuthorizationCode,
  isDefinitiveAuthError,
  isMagaluConfigured,
  refreshAccessToken,
  tokenExpiresAt,
  type OAuthTokenResponse
} from "./oauth.js";
import { getConnectedMagaluAccountsForCompany, syncSkusForAccount, type MagaluAccountForSync, type MagaluAccountRecord } from "./products-sync.js";

export function getAuthorizationUrl(companyId: string, userId: string) {
  return { authorizationUrl: buildAuthorizationUrl(companyId, userId) };
}

async function fetchSellerProfile(accessToken: string) {
  const response = await magaluGetWithRetry<{ seller: { id: string; name?: string } }>(
    config.MAGALU_API_BASE_URL,
    accessToken,
    "/seller/v1/portfolios/me"
  );
  return { sellerId: response.seller.id, nickname: response.seller.name ?? `seller-${response.seller.id}` };
}

async function upsertMagaluAccount(input: {
  companyId: string;
  userId: string;
  sellerId: string;
  nickname: string;
  tokens: OAuthTokenResponse;
  status: string;
}) {
  return unwrap(
    await supabaseAdmin
      .from("magalu_accounts")
      .upsert(
        {
          company_id: input.companyId,
          connected_by: input.userId,
          seller_id: input.sellerId,
          nickname: input.nickname,
          access_token: input.tokens.access_token,
          refresh_token: input.tokens.refresh_token,
          token_expires_at: tokenExpiresAt(input.tokens.expires_in),
          status: input.status,
          connected_at: new Date().toISOString()
        },
        { onConflict: "company_id,seller_id" }
      )
      .select("id, company_id, seller_id, nickname, access_token, refresh_token, token_expires_at, status")
      .single()
  ) as MagaluAccountRecord;
}

export async function markAccountStatus(accountId: string, status: string, lastSyncedAt?: string) {
  const result = await supabaseAdmin
    .from("magalu_accounts")
    .update({ status, last_synced_at: lastSyncedAt ?? null })
    .eq("id", accountId);

  if (result.error) {
    throw new Error(`Falha ao atualizar status da conta Magalu: ${result.error.message}`);
  }
}

// Mesmo motivo do modulo do ML: nao trava o navegador na tela de callback
// esperando a sync inteira terminar. A conta ja fica persistida como
// "syncing"; o frontend acompanha via GET /integrations/magalu.
function runDetached(task: () => Promise<void>) {
  void task().catch((error) => {
    console.error("[magalu-integration] tarefa em segundo plano falhou:", error instanceof Error ? error.stack : error);
  });
}

export async function handleOAuthCallback(input: { code: string; state: string }) {
  const { companyId, userId } = decodeOAuthState(input.state);
  const tokens = await exchangeAuthorizationCode(input.code);
  // Diagnostico temporario (401 recorrente em fetchSellerProfile mesmo com
  // open:portfolio:read confirmado no token -- ja descartado como causa em
  // duas tentativas). Hipotese atual: a API usa multi-tenant de verdade
  // (login pedido com choose_tenants=true; "x-tenant-id" e o nome oficial
  // do header de tenant nas APIs da Magalu) e pode exigir um tenant_id que
  // o token exchange ja devolve num campo que OAuthTokenResponse nao
  // declara -- loga o corpo inteiro (exceto os proprios tokens) pra
  // confirmar sem adivinhar.
  const { access_token: _at, refresh_token: _rt, ...tokensWithoutSecrets } = tokens as OAuthTokenResponse & Record<string, unknown>;
  console.log(`[magalu-integration] resposta do token exchange (sem tokens): ${JSON.stringify(tokensWithoutSecrets)}`);
  const profile = await fetchSellerProfile(tokens.access_token);

  const account = await upsertMagaluAccount({
    companyId,
    userId,
    sellerId: profile.sellerId,
    nickname: profile.nickname,
    tokens,
    status: "syncing"
  });

  runDetached(async () => {
    try {
      await syncSkusForAccount(account as MagaluAccountForSync, tokens.access_token);
      await markAccountStatus(account.id, "connected", new Date().toISOString());
    } catch (error) {
      console.error(`[magalu-integration] sync inicial falhou para conta ${account.id}:`, error);
      await markAccountStatus(account.id, "sync_failed");
    }
  });

  return {
    companyId,
    provider: "magalu" as const,
    status: "syncing" as const,
    account: { id: account.id, sellerId: account.seller_id, nickname: account.nickname }
  };
}

export async function getIntegrationStatus(companyId: string) {
  const accounts = unwrap(
    await supabaseAdmin
      .from("magalu_accounts")
      .select("id, seller_id, nickname, status, last_synced_at, connected_at, token_expires_at")
      .eq("company_id", companyId)
      .order("connected_at", { ascending: false })
  );

  const accountsWithCounts = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { count } = await supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("magalu_account_id", account.id);
      return { ...account, listingsCount: count ?? 0 };
    })
  );

  return {
    connected: accountsWithCounts.some((account) => account.status === "connected"),
    configured: isMagaluConfigured(),
    accounts: accountsWithCounts
  };
}

// Mesmo raciocinio do modulo do ML: nao apaga conta nem historico, so limpa
// tokens e marca "disconnected". Reconectar a mesma loja reaproveita a
// mesma linha (upsert por company_id+seller_id no callback).
export async function disconnectAccount(companyId: string, accountId: string) {
  const result = await supabaseAdmin
    .from("magalu_accounts")
    .update({ status: "disconnected", access_token: null, refresh_token: null })
    .eq("id", accountId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw new Error(`Falha ao desconectar conta Magalu: ${result.error.message}`);
  }
  if (!result.data) {
    throw new Error("Conta não encontrada.");
  }
}

export async function refreshMagaluAccountAccessToken(account: MagaluAccountRecord): Promise<MagaluAccountRecord> {
  const TOKEN_REFRESH_BUFFER_MS = 60_000;
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;

  if (expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS && account.access_token) {
    return account;
  }
  if (!account.refresh_token) {
    throw new Error(`Refresh token ausente para conta Magalu ${account.id}`);
  }

  const tokens = await refreshAccessToken(account.refresh_token);
  return unwrap(
    await supabaseAdmin
      .from("magalu_accounts")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt(tokens.expires_in),
        status: "connected"
      })
      .eq("id", account.id)
      .select("id, company_id, seller_id, nickname, access_token, refresh_token, token_expires_at, status")
      .single()
  ) as MagaluAccountRecord;
}

// Chamado pelo job magalu-sync-account. Sincroniza SKUs (produtos + preco +
// estoque) de todas as contas conectadas da empresa; orders/order_items sao
// sincronizados separadamente (magalu-orders-sync.ts), mesma divisao do ML.
export async function syncConnectedMagaluAccountsListings(companyId: string) {
  const accounts = await getConnectedMagaluAccountsForCompany(companyId);
  let accountsProcessed = 0;
  let listingsUpserted = 0;

  for (const account of accounts) {
    try {
      const refreshed = await refreshMagaluAccountAccessToken(account as MagaluAccountRecord);
      if (!refreshed.access_token) continue;

      const result = await syncSkusForAccount(refreshed as MagaluAccountForSync, refreshed.access_token);
      listingsUpserted += result.listingsUpserted;
      accountsProcessed += 1;
      await markAccountStatus(account.id, "connected", new Date().toISOString());
    } catch (error) {
      console.error(`[magalu-integration] sync falhou para conta ${account.id}:`, error);
      if (isDefinitiveAuthError(error)) {
        await markAccountStatus(account.id, "sync_failed");
      }
      // erro transitorio: mantem "connected" para o proximo ciclo tentar de novo.
    }
  }

  return { accountsProcessed, listingsUpserted };
}
