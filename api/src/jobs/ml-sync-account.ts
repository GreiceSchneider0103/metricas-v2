import { getSaoPauloTodayIso, shiftIsoDate } from "../lib/dates.js";
import { withJobRun } from "../lib/job-runs.js";
import { syncConnectedAccountsListings } from "../modules/integrations/mercado-livre/service.js";
import { syncOrdersForCompany } from "./orders-sync.js";

// Fase 1: sincroniza listings e orders/order_items de todas as contas
// conectadas da empresa. Nao escreve em listing_daily_snapshot -- isso e
// responsabilidade exclusiva do job de agregacao (fase 2).
//
// Janela padrao de orders: ultimos 3 dias (cobre pedidos que fecham com
// atraso). Para uma carga historica maior, chamar syncOrdersForCompany
// diretamente com um range explicito.
export async function runMlSyncAccountJob(companyId: string) {
  return withJobRun({ companyId, jobName: "ml.sync.account" }, async () => {
    const listingsResult = await syncConnectedAccountsListings(companyId);

    const endDate = getSaoPauloTodayIso();
    const startDate = shiftIsoDate(endDate, -3);
    const ordersResult = await syncOrdersForCompany(companyId, startDate, endDate);

    return { listings: listingsResult, orders: ordersResult };
  });
}
