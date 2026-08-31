import { getSaoPauloTodayIso, shiftIsoDate } from "../lib/dates.js";
import { fetchAllPages, unwrap } from "../lib/db.js";
import { withJobRun } from "../lib/job-runs.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getConnectedAccountsForCompany } from "../modules/integrations/mercado-livre/listings-sync.js";
import { refreshMlAccountAccessToken, type MlAccountRecord } from "../modules/integrations/mercado-livre/service.js";
import { fetchVisitsForDate } from "../modules/integrations/mercado-livre/visits-sync.js";

// So faz UPDATE em listing_daily_snapshot -- a linha do dia ja precisa
// existir (gravada pelo job de agregacao, fase 2). Preenche visits e
// recalcula conversion_rate (orders_count/visits) com o valor que a
// agregacao deixou como null por falta desse dado.
async function syncVisitsForCompanyAndDate(companyId: string, snapshotDate: string) {
  const accounts = await getConnectedAccountsForCompany(companyId);
  let listingsUpdated = 0;

  const existingSnapshots = await fetchAllPages<{ id: string; listing_id: string; orders_count: number }>((from, to) =>
    supabaseAdmin
      .from("listing_daily_snapshot")
      .select("id, listing_id, orders_count")
      .eq("company_id", companyId)
      .eq("snapshot_date", snapshotDate)
      .range(from, to)
  );
  const snapshotByListingId = new Map(existingSnapshots.map((row) => [row.listing_id, row]));
  if (snapshotByListingId.size === 0) return { listingsUpdated };

  for (const account of accounts) {
    const refreshed = await refreshMlAccountAccessToken(account as MlAccountRecord);
    if (!refreshed.access_token) continue;

    const listings =
      unwrap(
        await supabaseAdmin
          .from("listings")
          .select("id, external_id")
          .eq("company_id", companyId)
          .eq("ml_account_id", account.id)
      ) ?? [];
    if (listings.length === 0) continue;

    const visitsByExternalId = await fetchVisitsForDate(
      refreshed.access_token,
      listings.map((listing) => listing.external_id),
      snapshotDate
    );

    for (const listing of listings) {
      const visits = visitsByExternalId.get(listing.external_id);
      const snapshot = snapshotByListingId.get(listing.id);
      if (visits === undefined || !snapshot) continue;

      const result = await supabaseAdmin
        .from("listing_daily_snapshot")
        .update({ visits, conversion_rate: visits > 0 ? snapshot.orders_count / visits : null })
        .eq("id", snapshot.id);
      if (result.error) {
        throw new Error(`Falha ao atualizar visitas: ${result.error.message}`);
      }
      listingsUpdated += 1;
    }
  }

  return { listingsUpdated };
}

// Roda para o dia anterior completo, mesmo motivo do job de agregacao
// (fase 2): "hoje" ainda esta em andamento.
export async function runVisitsSyncJob(companyId: string, snapshotDate?: string) {
  const date = snapshotDate ?? shiftIsoDate(getSaoPauloTodayIso(), -1);
  return withJobRun({ companyId, jobName: "visits.sync", payload: { snapshotDate: date } }, () =>
    syncVisitsForCompanyAndDate(companyId, date)
  );
}

// Carga retroativa manual (disparo unico): preenche visits pra cada dia de
// um intervalo -- os snapshots desses dias ja precisam existir (rodar depois
// de /jobs/orders-backfill + a agregacao ja ter processado o periodo).
// Sequencial por dia pra nao multiplicar ainda mais a carga de requisicoes
// contra a API do Mercado Livre (ja e varias por dia, por causa do multiget
// em lotes de 8).
export async function runVisitsBackfillJob(companyId: string, startDate: string, endDate: string) {
  return withJobRun({ companyId, jobName: "visits.backfill", payload: { startDate, endDate } }, async () => {
    let listingsUpdated = 0;
    let date = startDate;
    while (date <= endDate) {
      const result = await syncVisitsForCompanyAndDate(companyId, date);
      listingsUpdated += result.listingsUpdated;
      date = shiftIsoDate(date, 1);
    }
    return { listingsUpdated };
  });
}
