import { getSaoPauloTodayIso, shiftIsoDate } from "../lib/dates.js";
import { chunk, fetchAllPages, unwrap } from "../lib/db.js";
import { withJobRun } from "../lib/job-runs.js";
import { supabaseAdmin } from "../lib/supabase.js";

type ListingRow = {
  id: string;
  price: number | null;
  available_quantity: number | null;
  status: string;
  has_ads: boolean;
  has_promotion: boolean;
};

type OrderItemRow = {
  order_id: string;
  listing_id: string | null;
  quantity: number;
  net_amount: number | null;
};

type ListingStats = {
  orderIds: Set<string>;
  unitsSold: number;
  revenue: number;
};

function monthRangeForDate(snapshotDate: string) {
  const [year, month] = snapshotDate.split("-").map(Number);
  const start = `${snapshotDate.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

// Curva ABC (Pareto por receita, 80/95/100) do mes corrente ao dia agregado --
// recalculada a cada agregacao diaria pra ir se ajustando conforme o mes
// avanca. Le direto de listing_daily_snapshot (ja gravado acima nesse mesmo
// job), nunca de orders/order_items.
async function recomputeAbcCurveForCompany(companyId: string, snapshotDate: string) {
  const { start, end } = monthRangeForDate(snapshotDate);

  const listings = await fetchAllPages<{ id: string }>((from, to) =>
    supabaseAdmin.from("listings").select("id").eq("company_id", companyId).range(from, to)
  );
  if (listings.length === 0) return;

  const snapshotRows = await fetchAllPages<{ listing_id: string; revenue: number }>((from, to) =>
    supabaseAdmin
      .from("listing_daily_snapshot")
      .select("listing_id, revenue")
      .eq("company_id", companyId)
      .gte("snapshot_date", start)
      .lte("snapshot_date", end)
      .range(from, to)
  );

  const revenueByListing = new Map<string, number>();
  for (const listing of listings) revenueByListing.set(listing.id, 0);
  for (const row of snapshotRows) {
    revenueByListing.set(row.listing_id, (revenueByListing.get(row.listing_id) ?? 0) + row.revenue);
  }

  const totalRevenue = Array.from(revenueByListing.values()).reduce((sum, value) => sum + value, 0);
  const ranked = Array.from(revenueByListing.entries()).sort((a, b) => b[1] - a[1]);

  let runningTotal = 0;
  const updates = ranked.map(([listingId, revenue]) => {
    runningTotal += revenue;
    const abcCurve =
      totalRevenue === 0 ? "C" : runningTotal <= totalRevenue * 0.8 ? "A" : runningTotal <= totalRevenue * 0.95 ? "B" : "C";
    return { id: listingId, abc_curve: abcCurve };
  });

  for (const batch of chunk(updates, 200)) {
    const result = await supabaseAdmin.from("listings").upsert(batch, { onConflict: "id" });
    if (result.error) {
      throw new Error(`Falha ao atualizar curva ABC: ${result.error.message}`);
    }
  }
}

// America/Sao_Paulo e UTC-3 fixo (ver lib/dates.ts) -- 00:00 local = 03:00 UTC.
function saoPauloDayRangeUtc(snapshotDate: string) {
  return {
    startUtc: `${snapshotDate}T03:00:00.000Z`,
    endUtc: `${shiftIsoDate(snapshotDate, 1)}T03:00:00.000Z`
  };
}

// So pedidos com total_amount > 0 contam -- orders-sync.ts ja zera
// total_amount na ingestao para pedidos cancelados/nao pagos (isRevenueOrder).
// Sem esse filtro, order_items de pedidos nao pagos inflariam unidades
// vendidas e receita do snapshot, porque gross/net_amount la sao calculados
// independente do status do pedido.
async function fetchRevenueOrderIdsClosedOnDate(companyId: string, snapshotDate: string) {
  const { startUtc, endUtc } = saoPauloDayRangeUtc(snapshotDate);
  const rows = await fetchAllPages<{ id: string }>((from, to) =>
    supabaseAdmin
      .from("orders")
      .select("id")
      .eq("company_id", companyId)
      .gt("total_amount", 0)
      .gte("closed_at", startUtc)
      .lt("closed_at", endUtc)
      .range(from, to)
  );
  return rows.map((row) => row.id);
}

async function fetchOrderItemsForOrders(companyId: string, orderIds: string[]) {
  const items: OrderItemRow[] = [];
  for (const batch of chunk(orderIds, 200)) {
    const rows = unwrap(
      await supabaseAdmin
        .from("order_items")
        .select("order_id, listing_id, quantity, net_amount")
        .eq("company_id", companyId)
        .in("order_id", batch)
    );
    items.push(...(rows ?? []));
  }
  return items;
}

function groupStatsByListing(orderItems: OrderItemRow[]) {
  const statsByListingId = new Map<string, ListingStats>();

  for (const item of orderItems) {
    if (!item.listing_id) continue;
    const stats = statsByListingId.get(item.listing_id) ?? { orderIds: new Set<string>(), unitsSold: 0, revenue: 0 };
    stats.orderIds.add(item.order_id);
    stats.unitsSold += item.quantity;
    stats.revenue += item.net_amount ?? 0;
    statsByListingId.set(item.listing_id, stats);
  }

  return statsByListingId;
}

// Fase 2: le listings + orders/order_items ja sincronizados pela fase 1 e
// grava 1 linha por anuncio em listing_daily_snapshot, com as metricas
// derivadas ja calculadas. E a UNICA escrita nessa tabela -- o endpoint do
// mapa de vendas (fase 3) so le daqui (ver docs/architecture.md).
//
// "visits" fica sempre 0 e "conversion_rate" sempre null: a sync da fase 1
// ainda nao busca a API de visitas do Mercado Livre. "effective_price" fica
// null quando ha promocao ativa, porque tambem nao sincronizamos o preco
// promocional de verdade ainda -- melhor null do que reportar o preco cheio
// como se fosse o preco com desconto.
export async function aggregateListingDailySnapshotForCompany(companyId: string, snapshotDate: string) {
  return withJobRun(
    { companyId, jobName: "listing_daily_snapshot.aggregate", payload: { snapshotDate } },
    async () => {
      const listings = await fetchAllPages<ListingRow>((from, to) =>
        supabaseAdmin
          .from("listings")
          .select("id, price, available_quantity, status, has_ads, has_promotion")
          .eq("company_id", companyId)
          .range(from, to)
      );

      if (listings.length === 0) {
        return { snapshotDate, listingsProcessed: 0 };
      }

      const orderIds = await fetchRevenueOrderIdsClosedOnDate(companyId, snapshotDate);
      const orderItems = await fetchOrderItemsForOrders(companyId, orderIds);
      const statsByListingId = groupStatsByListing(orderItems);

      const rows = listings.map((listing) => {
        const stats = statsByListingId.get(listing.id);
        const ordersCount = stats?.orderIds.size ?? 0;
        const unitsSold = stats?.unitsSold ?? 0;
        const revenue = stats?.revenue ?? 0;

        return {
          company_id: companyId,
          listing_id: listing.id,
          snapshot_date: snapshotDate,
          visits: 0,
          orders_count: ordersCount,
          units_sold: unitsSold,
          revenue,
          price: listing.price ?? null,
          effective_price: listing.has_promotion ? null : listing.price ?? null,
          stock: listing.available_quantity ?? null,
          listing_status: listing.status,
          is_promotion_active: listing.has_promotion,
          has_ads: listing.has_ads,
          conversion_rate: null,
          avg_ticket: ordersCount > 0 ? revenue / ordersCount : null
        };
      });

      const result = await supabaseAdmin
        .from("listing_daily_snapshot")
        .upsert(rows, { onConflict: "company_id,listing_id,snapshot_date" });

      if (result.error) {
        throw new Error(`Falha ao gravar listing_daily_snapshot: ${result.error.message}`);
      }

      await recomputeAbcCurveForCompany(companyId, snapshotDate);

      return { snapshotDate, listingsProcessed: rows.length };
    }
  );
}

// Roda para o dia anterior completo (America/Sao_Paulo) -- o dia corrente
// ainda esta em andamento, entao agregar "hoje" geraria um snapshot parcial
// que seria reescrito no dia seguinte sem necessidade.
export async function runListingDailySnapshotAggregateJobForYesterday(companyId: string) {
  const yesterday = shiftIsoDate(getSaoPauloTodayIso(), -1);
  return aggregateListingDailySnapshotForCompany(companyId, yesterday);
}
