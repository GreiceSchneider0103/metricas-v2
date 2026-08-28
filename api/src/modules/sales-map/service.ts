import { chunk, unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";

export type SalesMapFilters = {
  search?: string;
  status?: string;
  listingType?: string;
  logisticType?: string;
  isCatalog?: boolean;
  abcCurve?: string;
  hasAds?: boolean;
  hasPromotion?: boolean;
};

export type SalesMapSortField = "revenue" | "unitsSold" | "ordersCount" | "avgTicket" | "title";

type ListingRow = {
  id: string;
  external_id: string;
  title: string;
  category_name: string | null;
  status: string;
  permalink: string | null;
  listing_type: string | null;
  logistic_type: string | null;
  is_catalog: boolean;
  abc_curve: string | null;
  price: number | null;
  available_quantity: number | null;
  has_ads: boolean;
  has_promotion: boolean;
  attributes: Record<string, string | null> | null;
};

// Mercado Livre expoe o SKU do vendedor como o atributo "SELLER_SKU" (ver
// listings-sync.ts, que grava item.attributes cru nesse jsonb) -- nao ha
// coluna dedicada, entao lemos direto daqui. IDs de catalogo/variacoes
// vinculadas (buybox, MLBU) NAO sao sincronizados hoje; "vinculados" no
// mapa de vendas usa SKU igual como proxy ate isso ser sincronizado.
function extractSku(attributes: Record<string, string | null> | null) {
  return attributes?.SELLER_SKU ?? null;
}

type SnapshotRow = {
  listing_id: string;
  orders_count: number;
  units_sold: number;
  revenue: number;
  visits: number;
};

type SnapshotTotals = { ordersCount: number; unitsSold: number; revenue: number; visits: number };

type SalesMapRow = {
  listingId: string;
  externalId: string;
  title: string;
  categoryName: string | null;
  status: string;
  permalink: string | null;
  listingType: string | null;
  logisticType: string | null;
  isCatalog: boolean;
  abcCurve: string | null;
  currentPrice: number;
  currentStock: number;
  hasAds: boolean;
  hasPromotion: boolean;
  sku: string | null;
  ordersCount: number;
  unitsSold: number;
  revenue: number;
  avgTicket: number | null;
  visits: number;
  conversionRate: number | null;
};

// PostgREST usa "," e "()" como delimitadores dentro de .or(); um termo de
// busca com esses caracteres (ou aspas) precisa vir entre aspas duplas, com
// aspas/barras internas escapadas -- senao quebra a sintaxe do filtro.
function escapePostgrestOrValue(value: string) {
  if (/[,()"\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

// mapa de vendas: le apenas de `listings` (identidade/filtros/estado atual)
// e `listing_daily_snapshot` (metricas do periodo, ja pre-agregadas pelo job
// da fase 2) -- nunca de orders/order_items em tempo de request. `listings`
// e uma tabela pequena (1 linha por anuncio), entao filtrar nela direto e
// barato; o custo que o repo antigo tinha era somar orders/order_items
// inteiros a cada carregamento de tela, o que este endpoint nunca faz.
async function fetchFilteredListings(companyId: string, filters: SalesMapFilters) {
  let query = supabaseAdmin
    .from("listings")
    .select(
      "id, external_id, title, category_name, status, permalink, listing_type, logistic_type, is_catalog, abc_curve, price, available_quantity, has_ads, has_promotion, attributes"
    )
    .eq("company_id", companyId);

  if (filters.search) {
    const escapedForIlike = filters.search.replace(/[%_\\]/g, (match) => `\\${match}`);
    const pattern = escapePostgrestOrValue(`%${escapedForIlike}%`);
    query = query.or(`title.ilike.${pattern},external_id.ilike.${pattern},attributes->>SELLER_SKU.ilike.${pattern}`);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.listingType) query = query.eq("listing_type", filters.listingType);
  if (filters.logisticType) query = query.eq("logistic_type", filters.logisticType);
  if (filters.isCatalog !== undefined) query = query.eq("is_catalog", filters.isCatalog);
  if (filters.abcCurve) query = query.eq("abc_curve", filters.abcCurve);
  if (filters.hasAds !== undefined) query = query.eq("has_ads", filters.hasAds);
  if (filters.hasPromotion !== undefined) query = query.eq("has_promotion", filters.hasPromotion);

  return (unwrap(await query) ?? []) as ListingRow[];
}

async function fetchSnapshotTotals(companyId: string, listingIds: string[], from: string, to: string) {
  const totals = new Map<string, SnapshotTotals>();
  if (listingIds.length === 0) return totals;

  for (const batch of chunk(listingIds, 200)) {
    const rows = (unwrap(
      await supabaseAdmin
        .from("listing_daily_snapshot")
        .select("listing_id, orders_count, units_sold, revenue, visits")
        .eq("company_id", companyId)
        .in("listing_id", batch)
        .gte("snapshot_date", from)
        .lte("snapshot_date", to)
    ) ?? []) as SnapshotRow[];

    for (const row of rows) {
      const current = totals.get(row.listing_id) ?? { ordersCount: 0, unitsSold: 0, revenue: 0, visits: 0 };
      current.ordersCount += row.orders_count;
      current.unitsSold += row.units_sold;
      current.revenue += row.revenue;
      current.visits += row.visits;
      totals.set(row.listing_id, current);
    }
  }

  return totals;
}

const SORT_ACCESSORS: Record<SalesMapSortField, (row: SalesMapRow) => number | string> = {
  revenue: (row) => row.revenue,
  unitsSold: (row) => row.unitsSold,
  ordersCount: (row) => row.ordersCount,
  avgTicket: (row) => row.avgTicket ?? -1,
  title: (row) => row.title.toLowerCase()
};

export async function getSalesMap(input: {
  companyId: string;
  from: string;
  to: string;
  filters: SalesMapFilters;
  sort: SalesMapSortField;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  const listings = await fetchFilteredListings(input.companyId, input.filters);
  const listingIds = listings.map((listing) => listing.id);
  const totals = await fetchSnapshotTotals(input.companyId, listingIds, input.from, input.to);

  const rows: SalesMapRow[] = listings.map((listing) => {
    const t = totals.get(listing.id) ?? { ordersCount: 0, unitsSold: 0, revenue: 0, visits: 0 };
    return {
      listingId: listing.id,
      externalId: listing.external_id,
      title: listing.title,
      categoryName: listing.category_name,
      status: listing.status,
      permalink: listing.permalink,
      listingType: listing.listing_type,
      logisticType: listing.logistic_type,
      isCatalog: listing.is_catalog,
      abcCurve: listing.abc_curve,
      currentPrice: listing.price ?? 0,
      currentStock: listing.available_quantity ?? 0,
      hasAds: listing.has_ads,
      hasPromotion: listing.has_promotion,
      sku: extractSku(listing.attributes),
      ordersCount: t.ordersCount,
      unitsSold: t.unitsSold,
      revenue: t.revenue,
      avgTicket: t.ordersCount > 0 ? t.revenue / t.ordersCount : null,
      visits: t.visits,
      conversionRate: t.visits > 0 ? t.ordersCount / t.visits : null
    };
  });

  const accessor = SORT_ACCESSORS[input.sort];
  const direction = input.sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return 0;
  });

  const total = rows.length;
  const start = (input.page - 1) * input.pageSize;
  const items = rows.slice(start, start + input.pageSize);

  const summary = rows.reduce(
    (acc, row) => {
      acc.revenue += row.revenue;
      acc.unitsSold += row.unitsSold;
      acc.ordersCount += row.ordersCount;
      acc.visits += row.visits;
      return acc;
    },
    { revenue: 0, unitsSold: 0, ordersCount: 0, visits: 0 }
  );

  return {
    period: { from: input.from, to: input.to },
    summary: {
      ...summary,
      avgTicket: summary.ordersCount > 0 ? summary.revenue / summary.ordersCount : null,
      conversionRate: summary.visits > 0 ? summary.ordersCount / summary.visits : null,
      listingsCount: total
    },
    pagination: { page: input.page, pageSize: input.pageSize, total },
    items
  };
}

// --- Mapa de vendas em calendario (heatmap dia a dia + metas diarias) ---

type CalendarSnapshotRow = {
  listing_id: string;
  snapshot_date: string;
  units_sold: number;
  revenue: number;
  orders_count: number;
  visits: number;
  price: number | null;
};

type UnitGoalRow = {
  id: string;
  listing_id: string;
  target_value: number;
  period_start: string;
  period_end: string;
};

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function buildMonthDates(month: string) {
  const total = daysInMonth(month);
  const dates: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    dates.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

async function fetchCalendarSnapshots(companyId: string, listingIds: string[], from: string, to: string) {
  const rows: CalendarSnapshotRow[] = [];
  if (listingIds.length === 0) return rows;

  for (const batch of chunk(listingIds, 200)) {
    const page = (unwrap(
      await supabaseAdmin
        .from("listing_daily_snapshot")
        .select("listing_id, snapshot_date, units_sold, revenue, orders_count, visits, price")
        .eq("company_id", companyId)
        .in("listing_id", batch)
        .gte("snapshot_date", from)
        .lte("snapshot_date", to)
    ) ?? []) as CalendarSnapshotRow[];
    rows.push(...page);
  }

  return rows;
}

// Meta mensal por anuncio == goals com metric_code = 'units_sold' e
// listing_id setado (reaproveita o modulo goals inteiro, ver
// access-requests/equipe para o mesmo padrao de reuso). Meta diaria =
// target_value / dias do periodo da meta (distribuicao uniforme -- o
// usuario pediu "metas diarias" sem especificar peso por dia da semana).
async function fetchActiveUnitGoals(companyId: string, listingIds: string[], monthStart: string, monthEnd: string) {
  const goals = new Map<string, { id: string; targetValue: number; dailyTarget: number }>();
  if (listingIds.length === 0) return goals;

  for (const batch of chunk(listingIds, 200)) {
    const rows = (unwrap(
      await supabaseAdmin
        .from("goals")
        .select("id, listing_id, target_value, period_start, period_end")
        .eq("company_id", companyId)
        .eq("metric_code", "units_sold")
        .eq("status", "active")
        .in("listing_id", batch)
        .lte("period_start", monthEnd)
        .gte("period_end", monthStart)
    ) ?? []) as UnitGoalRow[];

    for (const row of rows) {
      const start = new Date(`${row.period_start}T00:00:00Z`);
      const end = new Date(`${row.period_end}T00:00:00Z`);
      const periodDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      goals.set(row.listing_id, {
        id: row.id,
        targetValue: row.target_value,
        dailyTarget: periodDays > 0 ? row.target_value / periodDays : 0
      });
    }
  }

  return goals;
}

const ABC_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };
function abcRank(curve: string | null) {
  return curve && curve in ABC_RANK ? ABC_RANK[curve] : 3;
}

export async function getSalesMapCalendar(input: {
  companyId: string;
  month: string;
  filters: SalesMapFilters;
  sort: SalesMapSortField;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  const dates = buildMonthDates(input.month);
  const monthStart = dates[0];
  const monthEnd = dates[dates.length - 1];

  const listings = await fetchFilteredListings(input.companyId, input.filters);
  const listingIds = listings.map((listing) => listing.id);

  const [snapshotRows, goalsByListing] = await Promise.all([
    fetchCalendarSnapshots(input.companyId, listingIds, monthStart, monthEnd),
    fetchActiveUnitGoals(input.companyId, listingIds, monthStart, monthEnd)
  ]);

  const snapshotsByListing = new Map<string, Map<string, CalendarSnapshotRow>>();
  for (const row of snapshotRows) {
    if (!snapshotsByListing.has(row.listing_id)) snapshotsByListing.set(row.listing_id, new Map());
    snapshotsByListing.get(row.listing_id)!.set(row.snapshot_date, row);
  }

  const rows = listings.map((listing) => {
    const byDate = snapshotsByListing.get(listing.id);
    const goal = goalsByListing.get(listing.id) ?? null;

    let previousPrice: number | null = null;
    let unitsTotal = 0;
    let revenueTotal = 0;
    let ordersTotal = 0;
    let visitsTotal = 0;

    const days = dates.map((date) => {
      const snapshot = byDate?.get(date);
      const unitsSold = snapshot?.units_sold ?? 0;
      const revenue = snapshot?.revenue ?? 0;
      const ordersCount = snapshot?.orders_count ?? 0;
      const visits = snapshot?.visits ?? 0;
      const price = snapshot?.price ?? null;

      let priceChange: "up" | "down" | "same" | null = null;
      if (price !== null && previousPrice !== null) {
        priceChange = price > previousPrice ? "up" : price < previousPrice ? "down" : "same";
      }
      if (price !== null) previousPrice = price;

      unitsTotal += unitsSold;
      revenueTotal += revenue;
      ordersTotal += ordersCount;
      visitsTotal += visits;

      let targetStatus: "hit" | "miss" | "none" = "none";
      if (goal && goal.dailyTarget > 0) {
        targetStatus = unitsSold >= goal.dailyTarget ? "hit" : "miss";
      }

      return { date, unitsSold, revenue, ordersCount, visits, price, priceChange, targetStatus };
    });

    // Tendencia: media dos ultimos 7 dias do mes vs os 7 anteriores. So
    // dentro do proprio mes (nao busca dados do mes anterior) -- fica
    // "flat" ate haver pelo menos 14 dias de historico no periodo.
    const last7 = days.slice(-7);
    const prev7 = days.slice(-14, -7);
    const last7Avg = last7.reduce((sum, day) => sum + day.unitsSold, 0) / (last7.length || 1);
    const prev7Avg = prev7.length ? prev7.reduce((sum, day) => sum + day.unitsSold, 0) / prev7.length : null;
    let trend: "up" | "down" | "flat" = "flat";
    if (prev7Avg !== null && prev7Avg > 0) {
      if (last7Avg > prev7Avg * 1.1) trend = "up";
      else if (last7Avg < prev7Avg * 0.9) trend = "down";
    }

    const avgDailyUnits = unitsTotal / dates.length;

    return {
      listingId: listing.id,
      externalId: listing.external_id,
      title: listing.title,
      permalink: listing.permalink,
      status: listing.status,
      listingType: listing.listing_type,
      abcCurve: listing.abc_curve,
      hasAds: listing.has_ads,
      hasPromotion: listing.has_promotion,
      sku: extractSku(listing.attributes),
      currentStock: listing.available_quantity ?? 0,
      days,
      totals: { unitsSold: unitsTotal, revenue: revenueTotal, ordersCount: ordersTotal, visits: visitsTotal },
      avgTicket: ordersTotal > 0 ? revenueTotal / ordersTotal : null,
      conversionRate: visitsTotal > 0 ? ordersTotal / visitsTotal : null,
      daysOfStock: avgDailyUnits > 0 ? (listing.available_quantity ?? 0) / avgDailyUnits : null,
      trend,
      goal: goal ? { id: goal.id, monthlyTargetUnits: goal.targetValue, dailyTargetUnits: goal.dailyTarget } : null
    };
  });

  const CALENDAR_SORT_ACCESSORS: Record<SalesMapSortField, (row: (typeof rows)[number]) => number | string> = {
    revenue: (row) => row.totals.revenue,
    unitsSold: (row) => row.totals.unitsSold,
    ordersCount: (row) => row.totals.ordersCount,
    avgTicket: (row) => row.avgTicket ?? -1,
    title: (row) => row.title.toLowerCase()
  };
  const accessor = CALENDAR_SORT_ACCESSORS[input.sort];
  const direction = input.sortDir === "asc" ? 1 : -1;

  // Curva A/B sempre antes de C/sem curva (pedido explicito), o campo de
  // ordenacao escolhido decide o desempate dentro de cada faixa.
  rows.sort((a, b) => {
    const abcDiff = abcRank(a.abcCurve) - abcRank(b.abcCurve);
    if (abcDiff !== 0) return abcDiff;
    const left = accessor(a);
    const right = accessor(b);
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return 0;
  });

  const total = rows.length;
  const start = (input.page - 1) * input.pageSize;
  const items = rows.slice(start, start + input.pageSize);

  return {
    month: input.month,
    period: { from: monthStart, to: monthEnd },
    pagination: { page: input.page, pageSize: input.pageSize, total },
    items
  };
}

// "Vinculados" pro drawer lateral: como catalogo/variacoes do ML nao sao
// sincronizados (ver comentario em extractSku), usa SKU do vendedor igual
// como proxy -- so retorna algo se o anuncio tiver SELLER_SKU preenchido.
export async function getLinkedListings(companyId: string, listingId: string) {
  const listing = unwrap(
    await supabaseAdmin.from("listings").select("id, attributes").eq("company_id", companyId).eq("id", listingId).maybeSingle()
  );
  const sku = listing ? extractSku(listing.attributes) : null;
  if (!sku) return [];

  const rows = unwrap(
    await supabaseAdmin
      .from("listings")
      .select("id, external_id, title, status, permalink")
      .eq("company_id", companyId)
      .eq("attributes->>SELLER_SKU", sku)
      .neq("id", listingId)
  );

  return (rows ?? []).map((row) => ({
    listingId: row.id,
    externalId: row.external_id,
    title: row.title,
    status: row.status,
    permalink: row.permalink
  }));
}
