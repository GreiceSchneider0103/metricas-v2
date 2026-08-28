import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { assertListingBelongsToCompany, assertUserBelongsToCompany } from "../../lib/tenant-guards.js";

export type GoalMetricCode = "revenue" | "units_sold" | "orders_count" | "visits";
export type GoalStatus = "active" | "achieved" | "missed" | "cancelled";

type GoalRow = {
  id: string;
  name: string;
  metric_code: GoalMetricCode;
  target_value: number;
  period_start: string;
  period_end: string;
  listing_id: string | null;
  owner_id: string | null;
  status: GoalStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const GOAL_COLUMNS =
  "id, name, metric_code, target_value, period_start, period_end, listing_id, owner_id, status, created_by, created_at, updated_at";

function mapGoal(row: GoalRow) {
  return {
    id: row.id,
    name: row.name,
    metricCode: row.metric_code,
    targetValue: row.target_value,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    listingId: row.listing_id,
    ownerId: row.owner_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createGoal(input: {
  companyId: string;
  createdBy: string;
  name: string;
  metricCode: GoalMetricCode;
  targetValue: number;
  periodStart: string;
  periodEnd: string;
  listingId?: string;
  ownerId?: string;
}) {
  if (input.listingId) await assertListingBelongsToCompany(input.companyId, input.listingId);
  if (input.ownerId) await assertUserBelongsToCompany(input.companyId, input.ownerId);

  const goal = unwrap(
    await supabaseAdmin
      .from("goals")
      .insert({
        company_id: input.companyId,
        name: input.name,
        metric_code: input.metricCode,
        target_value: input.targetValue,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        listing_id: input.listingId ?? null,
        owner_id: input.ownerId ?? null,
        created_by: input.createdBy
      })
      .select(GOAL_COLUMNS)
      .single()
  ) as GoalRow;

  return mapGoal(goal);
}

export async function listGoals(
  companyId: string,
  filters: { status?: GoalStatus; listingId?: string; metricCode?: GoalMetricCode },
  page: number,
  pageSize: number
) {
  let query = supabaseAdmin.from("goals").select(GOAL_COLUMNS, { count: "exact" }).eq("company_id", companyId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.listingId) query = query.eq("listing_id", filters.listingId);
  if (filters.metricCode) query = query.eq("metric_code", filters.metricCode);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order("period_start", { ascending: false }).range(from, to);

  const result = await query;
  if (result.error) {
    throw new Error(`Falha ao listar metas: ${result.error.message}`);
  }

  return {
    items: ((result.data ?? []) as GoalRow[]).map(mapGoal),
    pagination: { page, pageSize, total: result.count ?? 0 }
  };
}

export async function getGoalById(companyId: string, goalId: string) {
  const row = unwrap(
    await supabaseAdmin.from("goals").select(GOAL_COLUMNS).eq("company_id", companyId).eq("id", goalId).maybeSingle()
  ) as GoalRow | null;

  return row ? mapGoal(row) : null;
}

export async function updateGoal(input: {
  companyId: string;
  goalId: string;
  changes: Partial<{
    name: string;
    targetValue: number;
    periodStart: string;
    periodEnd: string;
    listingId: string | null;
    ownerId: string | null;
    status: GoalStatus;
  }>;
}) {
  if (input.changes.listingId) await assertListingBelongsToCompany(input.companyId, input.changes.listingId);
  if (input.changes.ownerId) await assertUserBelongsToCompany(input.companyId, input.changes.ownerId);

  const columnMap = {
    name: "name",
    targetValue: "target_value",
    periodStart: "period_start",
    periodEnd: "period_end",
    listingId: "listing_id",
    ownerId: "owner_id",
    status: "status"
  } as const;

  const updates: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columnMap) as [keyof typeof columnMap, string][]) {
    if (key in input.changes) updates[column] = input.changes[key];
  }

  if (Object.keys(updates).length === 0) {
    const current = await getGoalById(input.companyId, input.goalId);
    if (!current) throw new Error("Meta nao encontrada");
    return current;
  }

  const updated = unwrap(
    await supabaseAdmin
      .from("goals")
      .update(updates)
      .eq("company_id", input.companyId)
      .eq("id", input.goalId)
      .select(GOAL_COLUMNS)
      .maybeSingle()
  ) as GoalRow | null;

  if (!updated) throw new Error("Meta nao encontrada");
  return mapGoal(updated);
}

const METRIC_COLUMN: Record<GoalMetricCode, string> = {
  revenue: "revenue",
  units_sold: "units_sold",
  orders_count: "orders_count",
  visits: "visits"
};

// Progresso e sempre calculado por cima de listing_daily_snapshot (nunca
// orders/order_items direto) -- mesma regra de leitura do mapa de vendas
// (fase 3). "visits" como metrica de meta hoje sempre soma 0, mesma
// limitacao ja documentada na fase 2 (sync ainda nao busca a API de
// visitas do Mercado Livre).
export async function getGoalProgress(companyId: string, goalId: string) {
  const goal = await getGoalById(companyId, goalId);
  if (!goal) return null;

  const column = METRIC_COLUMN[goal.metricCode];
  let query = supabaseAdmin
    .from("listing_daily_snapshot")
    .select(column)
    .eq("company_id", companyId)
    .gte("snapshot_date", goal.periodStart)
    .lte("snapshot_date", goal.periodEnd);

  if (goal.listingId) {
    query = query.eq("listing_id", goal.listingId);
  }

  const result = await query;
  if (result.error) {
    throw new Error(`Falha ao calcular progresso da meta: ${result.error.message}`);
  }

  const achievedValue = ((result.data ?? []) as unknown as Array<Record<string, number>>).reduce(
    (sum, row) => sum + (row[column] ?? 0),
    0
  );

  return {
    goalId: goal.id,
    metricCode: goal.metricCode,
    targetValue: goal.targetValue,
    achievedValue,
    progressPercent: goal.targetValue > 0 ? Math.min(999, (achievedValue / goal.targetValue) * 100) : null
  };
}
