import { getSaoPauloTodayIso, shiftIsoDate } from "../lib/dates.js";
import { withJobRun } from "../lib/job-runs.js";
import { syncConnectedMagaluAccountsListings } from "../modules/integrations/magalu/service.js";
import { syncMagaluOrdersForCompany } from "./magalu-orders-sync.js";

// Espelha ml-sync-account.ts: sincroniza SKUs e orders/order_items de todas
// as contas Magalu conectadas da empresa. Nao escreve em
// listing_daily_snapshot -- isso e do job de agregacao (ja channel-agnostico).
export async function runMagaluSyncAccountJob(companyId: string) {
  return withJobRun({ companyId, jobName: "magalu.sync.account" }, async () => {
    const listingsResult = await syncConnectedMagaluAccountsListings(companyId);

    const endDate = getSaoPauloTodayIso();
    const startDate = shiftIsoDate(endDate, -3);
    const ordersResult = await syncMagaluOrdersForCompany(companyId, startDate, endDate);

    return { listings: listingsResult, orders: ordersResult };
  });
}
