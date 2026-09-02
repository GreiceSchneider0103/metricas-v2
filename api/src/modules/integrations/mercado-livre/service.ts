import { unwrap } from "../../../lib/db.js";
import { supabaseAdmin } from "../../../lib/supabase.js";
import {
  buildAuthorizationUrl,
  decodeOAuthState,
  exchangeAuthorizationCode,
  isDefinitiveAuthError,
  refreshAccessToken,
  tokenExpiresAt,
  type OAuthTokenResponse
} from "./oauth.js";
import {
  fetchAdvertiserProfile,
  fetchSellerProfile,
  getConnectedAccountsForCompany,
  syncListingsForAccount,
  type MlAccountForSync
} from "./listings-sync.js";

export type MlAccountRecord = {
  id: string;
  company_id: string;
  seller_id: string;
  nickname: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  advertiser_id: string | null;
  status: string;
};

export function getAuthorizationUrl(companyId: string, userId: string) {
  return { authorizationUrl: buildAuthorizationUrl(companyId, userId) };
}

async function upsertMlAccount(input: {
  companyId: string;
  userId: string;
  sellerId: string;
  nickname: string;
  tokens: OAuthTokenResponse;
  advertiserId: string | null;
  status: string;
}) {
  return unwrap(
    await supabaseAdmin
      .from("ml_accounts")
      .upsert(
        {
          company_id: input.companyId,
          connected_by: input.userId,
          seller_id: input.sellerId,
          nickname: input.nickname,
          access_token: input.tokens.access_token,
          refresh_token: input.tokens.refresh_token,
          token_expires_at: tokenExpiresAt(input.tokens.expires_in),
          advertiser_id: input.advertiserId,
          status: input.status,
          connected_at: new Date().toISOString()
        },
        { onConflict: "company_id,seller_id" }
      )
      .select("id, company_id, seller_id, nickname, access_token, refresh_token, token_expires_at, advertiser_id, status")
      .single()
  ) as MlAccountRecord;
}

export async function markAccountStatus(accountId: string, status: string, lastSyncedAt?: string) {
  const result = await supabaseAdmin
    .from("ml_accounts")
    .update({ status, last_synced_at: lastSyncedAt ?? null })
    .eq("id", accountId);

  if (result.error) {
    throw new Error(`Falha ao atualizar status da conta ML: ${result.error.message}`);
  }
}

// Roda em segundo plano apos o callback do OAuth responder: contas com
// centenas de anuncios podiam levar minutos para sincronizar, travando o
// navegador do usuario na pagina de callback ate terminar. A conta ja fica
// persistida com status "syncing"; o frontend acompanha a transicao para
// "connected" via GET /integrations/mercado-livre.
function runDetached(task: () => Promise<void>) {
  void task().catch((error) => {
    console.error("[ml-integration] tarefa em segundo plano falhou:", error instanceof Error ? error.stack : error);
  });
}

export async function handleOAuthCallback(input: { code: string; state: string }) {
  const { companyId, userId } = decodeOAuthState(input.state);
  const tokens = await exchangeAuthorizationCode(input.code);
  const profile = await fetchSellerProfile(tokens.access_token);
  const advertiserProfile = await fetchAdvertiserProfile(tokens.access_token);

  const account = await upsertMlAccount({
    companyId,
    userId,
    sellerId: profile.sellerId,
    nickname: profile.nickname,
    tokens,
    advertiserId: advertiserProfile?.advertiserId ?? null,
    status: "syncing"
  });

  runDetached(async () => {
    try {
      await syncListingsForAccount(account as MlAccountForSync, tokens.access_token);
      await markAccountStatus(account.id, "connected", new Date().toISOString());
    } catch (error) {
      console.error(`[ml-integration] sync inicial falhou para conta ${account.id}:`, error);
      await markAccountStatus(account.id, "sync_failed");
    }
  });

  return {
    companyId,
    provider: "mercado-livre" as const,
    status: "syncing" as const,
    account: { id: account.id, sellerId: account.seller_id, nickname: account.nickname }
  };
}

export async function getIntegrationStatus(companyId: string) {
  const accounts = unwrap(
    await supabaseAdmin
      .from("ml_accounts")
      .select("id, seller_id, nickname, status, last_synced_at, connected_at, token_expires_at")
      .eq("company_id", companyId)
      .order("connected_at", { ascending: false })
  );

  const accountsWithCounts = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { count } = await supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("ml_account_id", account.id);
      return { ...account, listingsCount: count ?? 0 };
    })
  );

  return {
    connected: accountsWithCounts.some((account) => account.status === "connected"),
    accounts: accountsWithCounts
  };
}

// Desconectar NAO apaga a conta nem os dados historicos ja sincronizados
// (listings/orders continuam com o vinculo pra sempre poder reconectar e
// reaproveitar o historico) -- so limpa os tokens e marca "disconnected",
// tirando a conta da lista que os crons/sync consideram "conectada". Se a
// pessoa reconectar a mesma loja depois, o upsert por (company_id,
// seller_id) no callback reaproveita essa mesma linha.
export async function disconnectAccount(companyId: string, accountId: string) {
  const result = await supabaseAdmin
    .from("ml_accounts")
    .update({ status: "disconnected", access_token: null, refresh_token: null })
    .eq("id", accountId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw new Error(`Falha ao desconectar conta ML: ${result.error.message}`);
  }
  if (!result.data) {
    throw new Error("Conta não encontrada.");
  }
}

export async function refreshMlAccountAccessToken(account: MlAccountRecord): Promise<MlAccountRecord> {
  const TOKEN_REFRESH_BUFFER_MS = 60_000;
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;

  if (expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS && account.access_token) {
    return account;
  }
  if (!account.refresh_token) {
    throw new Error(`Refresh token ausente para conta ${account.id}`);
  }

  const tokens = await refreshAccessToken(account.refresh_token);
  return unwrap(
    await supabaseAdmin
      .from("ml_accounts")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt(tokens.expires_in),
        status: "connected"
      })
      .eq("id", account.id)
      .select("id, company_id, seller_id, nickname, access_token, refresh_token, token_expires_at, advertiser_id, status")
      .single()
  ) as MlAccountRecord;
}

// Chamado pelo job ml-sync-account (fase 1). Sincroniza listings de todas as
// contas conectadas da empresa; orders/order_items sao sincronizados
// separadamente pelo job orders-sync (mesma fase, arquivo proprio).
export async function syncConnectedAccountsListings(companyId: string) {
  const accounts = await getConnectedAccountsForCompany(companyId);
  let accountsProcessed = 0;
  let listingsUpserted = 0;

  for (const account of accounts) {
    try {
      const refreshed = await refreshMlAccountAccessToken(account as MlAccountRecord);
      if (!refreshed.access_token) continue;

      const result = await syncListingsForAccount(refreshed as MlAccountForSync, refreshed.access_token);
      listingsUpserted += result.listingsUpserted;
      accountsProcessed += 1;
      await markAccountStatus(account.id, "connected", new Date().toISOString());
    } catch (error) {
      console.error(`[ml-integration] sync falhou para conta ${account.id}:`, error);
      if (isDefinitiveAuthError(error)) {
        await markAccountStatus(account.id, "sync_failed");
      }
      // erro transitorio (timeout, 429, 5xx): mantem "connected" para o
      // proximo ciclo tentar de novo.
    }
  }

  return { accountsProcessed, listingsUpserted };
}
