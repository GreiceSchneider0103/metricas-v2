import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";

const RECENT_FAILURES_LIMIT = 20;
const RECENT_FAILURES_WINDOW_HOURS = 48;

// Painel de "saude do sync" em Configuracoes -- unica tela que le job_runs
// direto (as demais paginas nunca precisam saber que esse job existe).
// Mistura ml_accounts + magalu_accounts numa lista so, ordenada pela conta
// mais parada primeiro (null vem antes de qualquer data -- nunca sincronizou
// e pior do que sincronizou ha muito tempo).
export async function getSyncHealth(companyId: string) {
  const [mlResult, magaluResult, failuresResult] = await Promise.all([
    supabaseAdmin
      .from("ml_accounts")
      .select("id, nickname, status, last_synced_at")
      .eq("company_id", companyId),
    supabaseAdmin
      .from("magalu_accounts")
      .select("id, nickname, status, last_synced_at")
      .eq("company_id", companyId),
    supabaseAdmin
      .from("job_runs")
      .select("id, job_name, status, created_at, finished_at, error")
      .eq("company_id", companyId)
      .eq("status", "failed")
      .gte("created_at", new Date(Date.now() - RECENT_FAILURES_WINDOW_HOURS * 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(RECENT_FAILURES_LIMIT)
  ]);

  const mlAccounts = (unwrap(mlResult) ?? []).map((row) => ({
    id: row.id as string,
    provider: "mercado_livre" as const,
    nickname: row.nickname as string,
    status: row.status as string,
    lastSyncedAt: row.last_synced_at as string | null
  }));
  const magaluAccounts = (unwrap(magaluResult) ?? []).map((row) => ({
    id: row.id as string,
    provider: "magalu" as const,
    nickname: row.nickname as string,
    status: row.status as string,
    lastSyncedAt: row.last_synced_at as string | null
  }));

  const accounts = [...mlAccounts, ...magaluAccounts].sort((a, b) => {
    if (!a.lastSyncedAt && !b.lastSyncedAt) return 0;
    if (!a.lastSyncedAt) return -1;
    if (!b.lastSyncedAt) return 1;
    return a.lastSyncedAt.localeCompare(b.lastSyncedAt);
  });

  const failures = (unwrap(failuresResult) ?? []).map((row) => {
    const error = row.error as { message?: string } | null;
    return {
      jobName: row.job_name as string,
      createdAt: row.created_at as string,
      errorMessage: error?.message ?? null
    };
  });

  return { accounts, failures };
}
