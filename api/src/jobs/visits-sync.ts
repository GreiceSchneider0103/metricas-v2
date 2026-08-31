import { getSaoPauloTodayIso, shiftIsoDate } from "../lib/dates.js";
import { fetchAllPages, unwrap } from "../lib/db.js";
import { withJobRun } from "../lib/job-runs.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getConnectedAccountsForCompany } from "../modules/integrations/mercado-livre/listings-sync.js";
import { refreshMlAccountAccessToken, type MlAccountRecord } from "../modules/integrations/mercado-livre/service.js";
import { fetchVisitsForItems } from "../modules/integrations/mercado-livre/visits-sync.js";

type SnapshotRow = { id: string; listing_id: string; snapshot_date: string; orders_count: number };

// So faz UPDATE em listing_daily_snapshot -- as linhas do periodo ja
// precisam existir (gravadas pelo job de agregacao, fase 2). Busca o
// intervalo inteiro de uma vez por item (ver visits-sync.ts: o endpoint so
// aceita 1 item por chamada, mas aceita varios dias numa unica chamada).
async function syncVisitsForCompanyAndRange(companyId: string, from: string, to: string) {
  const accounts = await getConnectedAccountsForCompany(companyId);
  let listingsUpdated = 0;

  const existingSnapshots = await fetchAllPages<SnapshotRow>((rangeFrom, rangeTo) =>
    supabaseAdmin
      .from("listing_daily_snapshot")
      .select("id, listing_id, snapshot_date, orders_count")
      .eq("company_id", companyId)
      .gte("snapshot_date", from)
      .lte("snapshot_date", to)
      .range(rangeFrom, rangeTo)
  );
  if (existingSnapshots.length === 0) return { listingsUpdated };

  const snapshotsByListingId = new Map<string, SnapshotRow[]>();
  for (const row of existingSnapshots) {
    const list = snapshotsByListingId.get(row.listing_id) ?? [];
    list.push(row);
    snapshotsByListingId.set(row.listing_id, list);
  }

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

    const visitsByExternalId = await fetchVisitsForItems(
      refreshed.access_token,
      listings.map((listing) => listing.external_id),
      from,
      to
    );

    for (const listing of listings) {
      const visitsByDate = visitsByExternalId.get(listing.external_id);
      const snapshots = snapshotsByListingId.get(listing.id);
      if (!visitsByDate || !snapshots || visitsByDate.size === 0) continue;

      for (const snapshot of snapshots) {
        const visits = visitsByDate.get(snapshot.snapshot_date);
        if (visits === undefined) continue;

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
  }

  return { listingsUpdated };
}

// Roda para o dia anterior completo, mesmo motivo do job de agregacao
// (fase 2): "hoje" ainda esta em andamento.
export async function runVisitsSyncJob(companyId: string, snapshotDate?: string) {
  const date = snapshotDate ?? shiftIsoDate(getSaoPauloTodayIso(), -1);
  return withJobRun({ companyId, jobName: "visits.sync", payload: { snapshotDate: date } }, () =>
    syncVisitsForCompanyAndRange(companyId, date, date)
  );
}

// Carga retroativa manual (disparo unico): preenche visits pra um intervalo
// inteiro -- os snapshots desse periodo ja precisam existir (rodar depois de
// /jobs/orders-backfill + a agregacao ja terem processado o periodo).
export async function runVisitsBackfillJob(companyId: string, startDate: string, endDate: string) {
  return withJobRun({ companyId, jobName: "visits.backfill", payload: { startDate, endDate } }, () =>
    syncVisitsForCompanyAndRange(companyId, startDate, endDate)
  );
}
