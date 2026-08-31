import { config } from "../config.js";
import { shiftIsoDate } from "../lib/dates.js";
import { unwrap } from "../lib/db.js";
import { withJobRun } from "../lib/job-runs.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { mlGetWithRetry } from "../modules/integrations/mercado-livre/client.js";
import { getConnectedAccountsForCompany } from "../modules/integrations/mercado-livre/listings-sync.js";
import { refreshMlAccountAccessToken, type MlAccountRecord } from "../modules/integrations/mercado-livre/service.js";

type MercadoLivreOrderItem = {
  item?: { id?: string; seller_sku?: string | null };
  quantity?: number;
  unit_price?: number;
};

type MercadoLivreOrder = {
  id: number | string;
  status?: string;
  date_closed?: string | null;
  total_amount?: number;
  paid_amount?: number;
  order_items?: MercadoLivreOrderItem[];
  payments?: Array<{ status?: string }>;
};

function isRevenueOrder(status: string | undefined, payments: Array<{ status?: string }>) {
  if (status === "paid") return true;
  return payments.some((payment) => payment.status === "approved" || payment.status === "accredited");
}

// Sincroniza orders/order_items de uma conta ML num intervalo de datas
// (fechamento do pedido). Resolve listing_id na propria ingestao (join com
// `listings` uma unica vez aqui), diferente do repo antigo que recalculava
// esse match a cada leitura do mapa de vendas.
async function syncOrdersForAccount(account: MlAccountRecord, startDate: string, endDate: string) {
  const limit = 50;
  let offset = 0;
  let ordersUpserted = 0;
  let orderItemsUpserted = 0;

  const listingIdByExternalId = new Map(
    (
      unwrap(
        await supabaseAdmin
          .from("listings")
          .select("id, external_id")
          .eq("company_id", account.company_id)
          .eq("ml_account_id", account.id)
      ) ?? []
    ).map((row) => [row.external_id, row.id])
  );

  while (true) {
    const from = `${startDate}T00:00:00.000-03:00`;
    const to = `${shiftIsoDate(endDate, 1)}T00:00:00.000-03:00`;
    const payload = await mlGetWithRetry<{ results?: MercadoLivreOrder[] }>(
      config.MERCADO_LIVRE_API_BASE_URL,
      account.access_token!,
      `/orders/search?seller=${account.seller_id}&order.date_closed.from=${encodeURIComponent(from)}&order.date_closed.to=${encodeURIComponent(to)}&sort=date_desc&limit=${limit}&offset=${offset}`
    );
    const results = payload.results ?? [];
    if (results.length === 0) break;

    const orderRows = results
      .filter((order) => order.date_closed)
      .map((order) => ({
        company_id: account.company_id,
        ml_account_id: account.id,
        external_id: String(order.id),
        status: order.status ?? "unknown",
        total_amount: isRevenueOrder(order.status, order.payments ?? [])
          ? Math.max(0, order.total_amount ?? order.paid_amount ?? 0)
          : 0,
        closed_at: order.date_closed,
        raw_payload: { source: "mercado-livre-api", synced_at: new Date().toISOString(), order }
      }));

    if (orderRows.length > 0) {
      const upsertResult = await supabaseAdmin
        .from("orders")
        .upsert(orderRows, { onConflict: "company_id,external_id" })
        .select("id, external_id");
      if (upsertResult.error) {
        throw new Error(`Falha ao persistir orders: ${upsertResult.error.message}`);
      }
      ordersUpserted += orderRows.length;

      const orderIdByExternalId = new Map((upsertResult.data ?? []).map((row) => [row.external_id, row.id]));
      const itemRows = results.flatMap((order) => {
        const orderId = orderIdByExternalId.get(String(order.id));
        if (!orderId) return [];
        return (order.order_items ?? [])
          .filter((item) => item.item?.id)
          .map((item) => ({
            company_id: account.company_id,
            order_id: orderId,
            listing_id: listingIdByExternalId.get(item.item!.id!) ?? null,
            item_external_id: item.item!.id!,
            quantity: Math.max(1, item.quantity ?? 1),
            unit_price: item.unit_price ?? null,
            gross_amount: Math.max(0, (item.unit_price ?? 0) * Math.max(1, item.quantity ?? 1)),
            net_amount: Math.max(0, (item.unit_price ?? 0) * Math.max(1, item.quantity ?? 1)),
            seller_sku: item.item?.seller_sku ?? null,
            raw_payload: item
          }));
      });

      if (itemRows.length > 0) {
        // order_items nao tem chave natural unica (variation_id do ML nem
        // sempre existe) -- reprocessar um pedido substitui os itens dele
        // em vez de tentar upsert por chave composta.
        const touchedOrderIds = Array.from(new Set(itemRows.map((row) => row.order_id)));
        const deleteResult = await supabaseAdmin.from("order_items").delete().in("order_id", touchedOrderIds);
        if (deleteResult.error) {
          throw new Error(`Falha ao limpar order_items antigos: ${deleteResult.error.message}`);
        }

        const itemResult = await supabaseAdmin.from("order_items").insert(itemRows);
        if (itemResult.error) {
          throw new Error(`Falha ao persistir order_items: ${itemResult.error.message}`);
        }
        orderItemsUpserted += itemRows.length;
      }
    }

    if (results.length < limit) break;
    offset += limit;
  }

  return { ordersUpserted, orderItemsUpserted };
}

export async function syncOrdersForCompany(companyId: string, startDate: string, endDate: string) {
  const accounts = await getConnectedAccountsForCompany(companyId);
  let ordersUpserted = 0;
  let orderItemsUpserted = 0;
  let accountsProcessed = 0;

  for (const account of accounts) {
    const refreshed = await refreshMlAccountAccessToken(account as MlAccountRecord);
    if (!refreshed.access_token) continue;
    const result = await syncOrdersForAccount(refreshed, startDate, endDate);
    ordersUpserted += result.ordersUpserted;
    orderItemsUpserted += result.orderItemsUpserted;
    accountsProcessed += 1;
  }

  return { accountsProcessed, ordersUpserted, orderItemsUpserted };
}

// Carga retroativa: o ciclo normal (ml-sync-all) so busca os ultimos 3 dias
// corridos (cobre pedidos que fecham com atraso, nao serve pra historico).
// Usado uma vez ao conectar uma conta com anuncios ja ativos ha mais tempo,
// ou pra preencher um periodo anterior a essa conexao -- mesma logica de
// sync, so com o intervalo de datas explicito em vez do padrao de 3 dias.
export async function runOrdersBackfillJob(companyId: string, startDate: string, endDate: string) {
  return withJobRun(
    { companyId, jobName: "orders.backfill", payload: { startDate, endDate } },
    () => syncOrdersForCompany(companyId, startDate, endDate)
  );
}
