import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { assertListingBelongsToCompany, assertUserBelongsToCompany } from "../../lib/tenant-guards.js";
import { createNotification } from "../notifications/service.js";

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  related_listing_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TaskFilters = {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  relatedListingId?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
};

const TASK_COLUMNS =
  "id, title, description, status, priority, due_date, assigned_to, created_by, related_listing_id, metadata, created_at, updated_at";

function mapTask(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    relatedListingId: row.related_listing_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function recordTaskHistory(input: {
  companyId: string;
  taskId: string;
  actorId: string;
  action: string;
  payload: Record<string, unknown>;
}) {
  const result = await supabaseAdmin.from("task_history").insert({
    company_id: input.companyId,
    task_id: input.taskId,
    actor_id: input.actorId,
    action: input.action,
    payload: input.payload
  });
  if (result.error) {
    throw new Error(`Falha ao registrar historico da tarefa: ${result.error.message}`);
  }
}

export async function createTask(input: {
  companyId: string;
  createdBy: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assignedTo?: string;
  relatedListingId?: string;
}) {
  if (input.assignedTo) await assertUserBelongsToCompany(input.companyId, input.assignedTo);
  if (input.relatedListingId) await assertListingBelongsToCompany(input.companyId, input.relatedListingId);

  const task = unwrap(
    await supabaseAdmin
      .from("tasks")
      .insert({
        company_id: input.companyId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        due_date: input.dueDate ?? null,
        assigned_to: input.assignedTo ?? null,
        created_by: input.createdBy,
        related_listing_id: input.relatedListingId ?? null
      })
      .select(TASK_COLUMNS)
      .single()
  ) as TaskRow;

  await recordTaskHistory({
    companyId: input.companyId,
    taskId: task.id,
    actorId: input.createdBy,
    action: "created",
    payload: { title: task.title, status: task.status, priority: task.priority, assignedTo: task.assigned_to }
  });

  if (task.assigned_to) {
    await createNotification({
      companyId: input.companyId,
      userId: task.assigned_to,
      type: "task_assigned",
      title: `Nova tarefa atribuida: ${task.title}`,
      metadata: { taskId: task.id }
    });
  }

  return mapTask(task);
}

export async function listTasks(companyId: string, filters: TaskFilters, page: number, pageSize: number) {
  let query = supabaseAdmin.from("tasks").select(TASK_COLUMNS, { count: "exact" }).eq("company_id", companyId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.relatedListingId) query = query.eq("related_listing_id", filters.relatedListingId);
  if (filters.dueBefore) query = query.lte("due_date", filters.dueBefore);
  if (filters.dueAfter) query = query.gte("due_date", filters.dueAfter);
  if (filters.search) {
    const escaped = filters.search.replace(/[%_\\]/g, (match) => `\\${match}`);
    query = query.ilike("title", `%${escaped}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const result = await query;
  if (result.error) {
    throw new Error(`Falha ao listar tarefas: ${result.error.message}`);
  }

  return {
    items: ((result.data ?? []) as TaskRow[]).map(mapTask),
    pagination: { page, pageSize, total: result.count ?? 0 }
  };
}

export async function getTaskById(companyId: string, taskId: string) {
  const row = unwrap(
    await supabaseAdmin.from("tasks").select(TASK_COLUMNS).eq("company_id", companyId).eq("id", taskId).maybeSingle()
  ) as TaskRow | null;

  return row ? mapTask(row) : null;
}

export async function updateTask(input: {
  companyId: string;
  taskId: string;
  actorId: string;
  changes: Partial<{
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
    assignedTo: string | null;
    relatedListingId: string | null;
  }>;
}) {
  const current = unwrap(
    await supabaseAdmin
      .from("tasks")
      .select("id, title, description, status, priority, due_date, assigned_to, related_listing_id")
      .eq("company_id", input.companyId)
      .eq("id", input.taskId)
      .maybeSingle()
  ) as Pick<TaskRow, "id" | "title" | "description" | "status" | "priority" | "due_date" | "assigned_to" | "related_listing_id"> | null;

  if (!current) {
    throw new Error("Tarefa nao encontrada");
  }

  const columnMap = {
    title: "title",
    description: "description",
    status: "status",
    priority: "priority",
    dueDate: "due_date",
    assignedTo: "assigned_to",
    relatedListingId: "related_listing_id"
  } as const;

  const updates: Record<string, unknown> = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, column] of Object.entries(columnMap) as [keyof typeof columnMap, string][]) {
    if (!(key in input.changes)) continue;
    const newValue = input.changes[key];
    const oldValue = (current as unknown as Record<string, unknown>)[column];
    if (newValue !== oldValue) {
      updates[column] = newValue;
      diff[key] = { from: oldValue, to: newValue };
    }
  }

  if (updates.assigned_to) await assertUserBelongsToCompany(input.companyId, updates.assigned_to as string);
  if (updates.related_listing_id) await assertListingBelongsToCompany(input.companyId, updates.related_listing_id as string);

  if (Object.keys(updates).length === 0) {
    return mapTask(current as TaskRow);
  }

  const updated = unwrap(
    await supabaseAdmin
      .from("tasks")
      .update(updates)
      .eq("company_id", input.companyId)
      .eq("id", input.taskId)
      .select(TASK_COLUMNS)
      .single()
  ) as TaskRow;

  await recordTaskHistory({
    companyId: input.companyId,
    taskId: input.taskId,
    actorId: input.actorId,
    action: "updated",
    payload: diff
  });

  if (diff.assignedTo && diff.assignedTo.to) {
    await createNotification({
      companyId: input.companyId,
      userId: diff.assignedTo.to as string,
      type: "task_assigned",
      title: `Tarefa atribuida a voce: ${updated.title}`,
      metadata: { taskId: input.taskId }
    });
  }

  return mapTask(updated);
}

export async function listTaskComments(companyId: string, taskId: string) {
  const rows = unwrap(
    await supabaseAdmin
      .from("task_comments")
      .select("id, task_id, author_id, body, created_at, users ( id, full_name, email )")
      .eq("company_id", companyId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
  );

  return (rows ?? []).map((row) => {
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id,
      taskId: row.task_id,
      authorId: row.author_id,
      authorName: author?.full_name ?? null,
      body: row.body,
      createdAt: row.created_at
    };
  });
}

export async function addTaskComment(input: { companyId: string; taskId: string; authorId: string; body: string }) {
  const task = unwrap(
    await supabaseAdmin.from("tasks").select("id").eq("company_id", input.companyId).eq("id", input.taskId).maybeSingle()
  );
  if (!task) {
    throw new Error("Tarefa nao encontrada");
  }

  const comment = unwrap(
    await supabaseAdmin
      .from("task_comments")
      .insert({ company_id: input.companyId, task_id: input.taskId, author_id: input.authorId, body: input.body })
      .select("id, task_id, author_id, body, created_at")
      .single()
  );

  return {
    id: comment.id,
    taskId: comment.task_id,
    authorId: comment.author_id,
    body: comment.body,
    createdAt: comment.created_at
  };
}

export async function listTaskHistory(companyId: string, taskId: string) {
  const rows = unwrap(
    await supabaseAdmin
      .from("task_history")
      .select("id, task_id, actor_id, action, payload, created_at")
      .eq("company_id", companyId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
  );

  return (rows ?? []).map((row) => ({
    id: row.id,
    taskId: row.task_id,
    actorId: row.actor_id,
    action: row.action,
    payload: row.payload,
    createdAt: row.created_at
  }));
}
