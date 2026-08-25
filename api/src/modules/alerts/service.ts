import { chunk, fetchAllPages, unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { createNotification } from "../notifications/service.js";

export type AlertStatus = "open" | "resolved" | "muted";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
type AlertCode = "no_sales_7d" | "price_drop" | "stock_low";

type AlertRow = {
  id: string;
  listing_id: string | null;
  code: string;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
};

const ALERT_COLUMNS = "id, listing_id, code, severity, title, description, payload, status, created_at, resolved_at";

function mapAlert(row: AlertRow) {
  return {
    id: row.id,
    listingId: row.listing_id,
    code: row.code,
    severity: row.severity,
    title: row.title,
    description: row.description,
    payload: row.payload,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

export async function listAlerts(
  companyId: string,
  filters: { status?: AlertStatus; severity?: AlertSeverity; listingId?: string },
  page: number,
  pageSize: number
) {
  let query = supabaseAdmin.from("alerts").select(ALERT_COLUMNS, { count: "exact" }).eq("company_id", companyId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.listingId) query = query.eq("listing_id", filters.listingId);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const result = await query;
  if (result.error) {
    throw new Error(`Falha ao listar alertas: ${result.error.message}`);
  }

  return {
    items: ((result.data ?? []) as AlertRow[]).map(mapAlert),
    pagination: { page, pageSize, total: result.count ?? 0 }
  };
}

export async function getAlertById(companyId: string, alertId: string) {
  const row = unwrap(
    await supabaseAdmin.from("alerts").select(ALERT_COLUMNS).eq("company_id", companyId).eq("id", alertId).maybeSingle()
  ) as AlertRow | null;

  return row ? mapAlert(row) : null;
}

// Override manual (adm/master): silenciar um alerta barulhento, reabrir um
// que foi resolvido cedo demais, ou resolver na mao. O job alerts-evaluate
// (fase 6) tambem resolve automaticamente quando a condicao para de valer.
export async function updateAlertStatus(companyId: string, alertId: string, status: AlertStatus) {
  const updated = unwrap(
    await supabaseAdmin
      .from("alerts")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("company_id", companyId)
      .eq("id", alertId)
      .select(ALERT_COLUMNS)
      .maybeSingle()
  ) as AlertRow | null;

  if (!updated) throw new Error("Alerta nao encontrado");
  return mapAlert(updated);
}

// ---- Motor de regras (chamado pelo job jobs/alerts-evaluate.ts) ----

const LOOKBACK_DAYS = 7;
const STOCK_LOW_THRESHOLD = 5;
const PRICE_DROP_THRESHOLD_PCT = 0.1;

// "visits_drop" citado no README do modulo fica de fora por enquanto: a
// sync da fase 1 ainda nao busca a API de visitas do Mercado Livre, entao
// visits e sempre 0 -- nao ha "queda" real pra detectar, so ruido.
const ALERT_DEFINITIONS: Record<
  AlertCode,
  { severity: AlertSeverity; buildTitle: (listingTitle: string) => string; description: string }
> = {
  no_sales_7d: {
    severity: "medium",
    buildTitle: (title) => `Sem vendas ha ${LOOKBACK_DAYS} dias: ${title}`,
    description: `Nenhum pedido registrado nos ultimos ${LOOKBACK_DAYS} dias com snapshot completo.`
  },
  price_drop: {
    severity: "low",
    buildTitle: (title) => `Queda de preco: ${title}`,
    description: `Preco caiu ${Math.round(PRICE_DROP_THRESHOLD_PCT * 100)}% ou mais nos ultimos ${LOOKBACK_DAYS} dias.`
  },
  stock_low: {
    severity: "high",
    buildTitle: (title) => `Estoque baixo: ${title}`,
    description: `Estoque atual e menor ou igual a ${STOCK_LOW_THRESHOLD} unidades.`
  }
};

type SnapshotRow = { listing_id: string; snapshot_date: string; orders_count: number; price: number | null; stock: number | null };

async function fetchSnapshotWindow(companyId: string, listingIds: string[], windowStart: string, referenceDate: string) {
  const rows: SnapshotRow[] = [];
  for (const batch of chunk(listingIds, 200)) {
    const batchRows = (unwrap(
      await supabaseAdmin
        .from("listing_daily_snapshot")
        .select("listing_id, snapshot_date, orders_count, price, stock")
        .eq("company_id", companyId)
        .in("listing_id", batch)
        .gte("snapshot_date", windowStart)
        .lte("snapshot_date", referenceDate)
    ) ?? []) as SnapshotRow[];
    rows.push(...batchRows);
  }
  return rows;
}

async function getActiveAdminUserIds(companyId: string) {
  const rows = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("role", ["master", "adm"])
  );
  return (rows ?? []).map((row) => row.user_id as string);
}

// Faz o diff entre quem deveria estar disparando a regra hoje (triggeringListingIds)
// e os alertas ja abertos com esse code: abre o que e novo, resolve o que
// parou de valer, nunca duplica um alerta pra quem ja esta em aberto.
async function syncAlertsForCode(
  companyId: string,
  code: AlertCode,
  triggeringListingIds: Set<string>,
  listingsById: Map<string, { id: string; title: string }>
) {
  const existingOpen = unwrap(
    await supabaseAdmin.from("alerts").select("id, listing_id").eq("company_id", companyId).eq("code", code).eq("status", "open")
  );
  const openByListing = new Map(
    (existingOpen ?? []).filter((row) => row.listing_id).map((row) => [row.listing_id as string, row.id as string])
  );

  const definition = ALERT_DEFINITIONS[code];
  const toInsert = Array.from(triggeringListingIds)
    .filter((listingId) => !openByListing.has(listingId))
    .map((listingId) => {
      const listing = listingsById.get(listingId)!;
      return {
        company_id: companyId,
        listing_id: listingId,
        code,
        severity: definition.severity,
        title: definition.buildTitle(listing.title),
        description: definition.description,
        payload: {}
      };
    });

  const opened: Array<{ id: string; title: string }> = [];
  if (toInsert.length > 0) {
    const result = await supabaseAdmin.from("alerts").insert(toInsert).select("id, title");
    if (result.error) throw new Error(`Falha ao abrir alertas (${code}): ${result.error.message}`);
    opened.push(...((result.data ?? []) as Array<{ id: string; title: string }>));
  }

  const toResolveIds = Array.from(openByListing.entries())
    .filter(([listingId]) => !triggeringListingIds.has(listingId))
    .map(([, alertId]) => alertId);

  if (toResolveIds.length > 0) {
    const result = await supabaseAdmin
      .from("alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("id", toResolveIds);
    if (result.error) throw new Error(`Falha ao resolver alertas (${code}): ${result.error.message}`);
  }

  return { opened, resolvedCount: toResolveIds.length };
}

// Le listing_daily_snapshot dos ultimos LOOKBACK_DAYS dias (nunca orders/
// order_items direto) e aplica as 3 regras sobre anuncios ativos. Novos
// alertas geram notificacao (fase 6) pra todo adm/master ativo da empresa.
export async function evaluateAlertRulesForCompany(companyId: string, referenceDate: string) {
  const windowStart = new Date(`${referenceDate}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - (LOOKBACK_DAYS - 1));
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const listings = await fetchAllPages<{ id: string; title: string; status: string }>((from, to) =>
    supabaseAdmin.from("listings").select("id, title, status").eq("company_id", companyId).eq("status", "active").range(from, to)
  );

  if (listings.length === 0) {
    return { alertsOpened: 0, alertsResolved: 0 };
  }

  const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
  const snapshotRows = await fetchSnapshotWindow(companyId, listings.map((listing) => listing.id), windowStartIso, referenceDate);

  const byListing = new Map<string, SnapshotRow[]>();
  for (const row of snapshotRows) {
    const list = byListing.get(row.listing_id) ?? [];
    list.push(row);
    byListing.set(row.listing_id, list);
  }

  const triggered: Record<AlertCode, Set<string>> = {
    no_sales_7d: new Set(),
    price_drop: new Set(),
    stock_low: new Set()
  };

  for (const listing of listings) {
    const rows = (byListing.get(listing.id) ?? []).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    if (rows.length === 0) continue;

    if (rows.length >= LOOKBACK_DAYS && rows.every((row) => row.orders_count === 0)) {
      triggered.no_sales_7d.add(listing.id);
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    if (first.price && last.price && first.price > 0) {
      const dropPct = (first.price - last.price) / first.price;
      if (dropPct >= PRICE_DROP_THRESHOLD_PCT) triggered.price_drop.add(listing.id);
    }

    if (last.stock !== null && last.stock <= STOCK_LOW_THRESHOLD) {
      triggered.stock_low.add(listing.id);
    }
  }

  let alertsOpened = 0;
  let alertsResolved = 0;
  const newlyOpened: Array<{ id: string; title: string }> = [];

  for (const code of Object.keys(triggered) as AlertCode[]) {
    const result = await syncAlertsForCode(companyId, code, triggered[code], listingsById);
    alertsOpened += result.opened.length;
    alertsResolved += result.resolvedCount;
    newlyOpened.push(...result.opened);
  }

  if (newlyOpened.length > 0) {
    const adminUserIds = await getActiveAdminUserIds(companyId);
    for (const userId of adminUserIds) {
      for (const alert of newlyOpened) {
        await createNotification({
          companyId,
          userId,
          type: "alert",
          title: alert.title,
          metadata: { alertId: alert.id }
        });
      }
    }
  }

  return { alertsOpened, alertsResolved };
}
