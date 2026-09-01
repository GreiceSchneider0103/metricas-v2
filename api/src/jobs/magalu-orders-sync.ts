import { config } from "../config.js";
import { shiftIsoDate } from "../lib/dates.js";
import { unwrap } from "../lib/db.js";
import { withJobRun } from "../lib/job-runs.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { magaluGetWithRetry } from "../modules/integrations/magalu/client.js";
import { getConnectedMagaluAccountsForCompany, type MagaluAccountRecord } from "../modules/integrations/magalu/products-sync.js";
import { refreshMagaluAccountAccessToken } from "../modules/integrations/magalu/service.js";

type MagaluMoney = { value?: number; normalizer?: number };

type MagaluOrderItem = {
  info?: { id?: string; sku?: string };
  quantity?: number;
  unit_price?: MagaluMoney;
};

type MagaluDelivery = {
  items?: MagaluOrderItem[];
};

type MagaluOrder = {
  id: string;
  code: string;
  status?: string;
  purchased_at?: string;
  // Data de aprovacao do pagamento -- usada como equivalente ao date_closed
  // do ML (pedido do usuario, ver conversa: approved_at reflete melhor
  // "venda de fato aconteceu" do que purchased_at, que pode nem ser
  // aprovado depois).
  approved_at?: string | null;
  amounts?: { total?: number; normalizer?: number };
  deliveries?: MagaluDelivery[];
};

// "approved" e "finished" sao os unicos status com pagamento ja aprovado
// (ver doc: approved tambem cobre invoiced/shipped/delivered, que sao
// sub-estados de entrega, nao do pedido). "new" ainda nao foi pago;
// "cancelled" nao gera receita.
function isRevenueOrder(status: string | undefined) {
  return status === "approved" || status === "finished";
}

async function syncOrdersForAccount(account: MagaluAccountRecord, startDate: string, endDate: string) {
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
          .eq("magalu_account_id", account.id)
      ) ?? []
    ).map((row) => [row.external_id, row.id])
  );

  // A API da Magalu nao aceita filtrar por approved_at diretamente -- so por
  // purchased_at ou updated_at. Usa updated_at pra pegar tudo que mudou na
  // janela (cobre aprovacoes atrasadas de pedidos mais antigos), e depois
  // cada pedido e "baldeado" no dia certo pelo seu approved_at de verdade.
  while (true) {
    const from = `${startDate}T00:00:00-03:00`;
    const to = `${shiftIsoDate(endDate, 1)}T00:00:00-03:00`;
    const payload = await magaluGetWithRetry<{ results?: MagaluOrder[] }>(
      config.MAGALU_API_BASE_URL,
      account.access_token!,
      `/seller/v1/orders?updated_at__gte=${encodeURIComponent(from)}&updated_at__lte=${encodeURIComponent(to)}&_sort=purchased_at:desc&_limit=${limit}&_offset=${offset}`
    );
    const results = payload.results ?? [];
    if (results.length === 0) break;

    const orderRows = results
      .filter((order) => order.approved_at)
      .map((order) => {
        const normalizer = order.amounts?.normalizer ?? 100;
        const total = (order.amounts?.total ?? 0) / normalizer;
        return {
          company_id: account.company_id,
          magalu_account_id: account.id,
          ml_account_id: null,
          channel: "magalu" as const,
          external_id: order.code,
          status: order.status ?? "unknown",
          total_amount: isRevenueOrder(order.status) ? Math.max(0, total) : 0,
          closed_at: order.approved_at,
          raw_payload: { source: "magalu-api", synced_at: new Date().toISOString(), order }
        };
      });

    if (orderRows.length > 0) {
      const upsertResult = await supabaseAdmin
        .from("orders")
        .upsert(orderRows, { onConflict: "company_id,external_id" })
        .select("id, external_id");
      if (upsertResult.error) {
        throw new Error(`Falha ao persistir orders (Magalu): ${upsertResult.error.message}`);
      }
      ordersUpserted += orderRows.length;

      const orderIdByExternalId = new Map((upsertResult.data ?? []).map((row) => [row.external_id, row.id]));
      const itemRows = results
        .filter((order) => order.approved_at)
        .flatMap((order) => {
          const orderId = orderIdByExternalId.get(order.code);
          if (!orderId) return [];
          const items = (order.deliveries ?? []).flatMap((delivery) => delivery.items ?? []);
          return items
            .filter((item) => item.info?.sku)
            .map((item) => {
              const sku = item.info!.sku!;
              const quantity = Math.max(1, item.quantity ?? 1);
              const priceNormalizer = item.unit_price?.normalizer ?? 100;
              const unitPrice = (item.unit_price?.value ?? 0) / priceNormalizer;
              return {
                company_id: account.company_id,
                order_id: orderId,
                listing_id: listingIdByExternalId.get(sku) ?? null,
                item_external_id: item.info?.id ?? sku,
                quantity,
                unit_price: unitPrice,
                gross_amount: Math.max(0, unitPrice * quantity),
                net_amount: Math.max(0, unitPrice * quantity),
                seller_sku: sku,
                magalu_account_id: account.id,
                channel: "magalu" as const,
                raw_payload: item
              };
            });
        });

      if (itemRows.length > 0) {
        // Mesmo motivo do ML: sem chave natural unica por item, reprocessar
        // um pedido substitui os itens dele em vez de tentar upsert.
        const touchedOrderIds = Array.from(new Set(itemRows.map((row) => row.order_id)));
        const deleteResult = await supabaseAdmin.from("order_items").delete().in("order_id", touchedOrderIds);
        if (deleteResult.error) {
          throw new Error(`Falha ao limpar order_items antigos (Magalu): ${deleteResult.error.message}`);
        }

        const itemResult = await supabaseAdmin.from("order_items").insert(itemRows);
        if (itemResult.error) {
          throw new Error(`Falha ao persistir order_items (Magalu): ${itemResult.error.message}`);
        }
        orderItemsUpserted += itemRows.length;
      }
    }

    if (results.length < limit) break;
    offset += limit;
  }

  return { ordersUpserted, orderItemsUpserted };
}

export async function syncMagaluOrdersForCompany(companyId: string, startDate: string, endDate: string) {
  const accounts = await getConnectedMagaluAccountsForCompany(companyId);
  let ordersUpserted = 0;
  let orderItemsUpserted = 0;
  let accountsProcessed = 0;

  for (const account of accounts) {
    const refreshed = await refreshMagaluAccountAccessToken(account as MagaluAccountRecord);
    if (!refreshed.access_token) continue;
    const result = await syncOrdersForAccount(refreshed, startDate, endDate);
    ordersUpserted += result.ordersUpserted;
    orderItemsUpserted += result.orderItemsUpserted;
    accountsProcessed += 1;
  }

  return { accountsProcessed, ordersUpserted, orderItemsUpserted };
}

export async function runMagaluOrdersBackfillJob(companyId: string, startDate: string, endDate: string) {
  return withJobRun(
    { companyId, jobName: "magalu.orders.backfill", payload: { startDate, endDate } },
    () => syncMagaluOrdersForCompany(companyId, startDate, endDate)
  );
}
