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
};

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
      "id, external_id, title, category_name, status, permalink, listing_type, logistic_type, is_catalog, abc_curve, price, available_quantity, has_ads, has_promotion"
    )
    .eq("company_id", companyId);

  if (filters.search) {
    const escapedForIlike = filters.search.replace(/[%_\\]/g, (match) => `\\${match}`);
    const pattern = escapePostgrestOrValue(`%${escapedForIlike}%`);
    query = query.or(`title.ilike.${pattern},external_id.ilike.${pattern}`);
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
      return acc;
    },
    { revenue: 0, unitsSold: 0, ordersCount: 0 }
  );

  return {
    period: { from: input.from, to: input.to },
    summary: {
      ...summary,
      avgTicket: summary.ordersCount > 0 ? summary.revenue / summary.ordersCount : null,
      listingsCount: total
    },
    pagination: { page: input.page, pageSize: input.pageSize, total },
    items
  };
}
