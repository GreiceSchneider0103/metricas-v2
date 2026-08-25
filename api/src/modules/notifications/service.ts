import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";

const NOTIFICATION_COLUMNS = "id, type, title, body, link, is_read, metadata, created_at";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: row.is_read,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

// Usada por outros modulos (alerts, tasks, ...) pra notificar um usuario
// especifico -- nunca chamada direto por uma rota HTTP, so por service.ts
// de outros dominios (ver alerts/service.ts e tasks/service.ts).
export async function createNotification(input: {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await supabaseAdmin.from("notifications").insert({
    company_id: input.companyId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    metadata: input.metadata ?? {}
  });
  if (result.error) {
    throw new Error(`Falha ao criar notificacao: ${result.error.message}`);
  }
}

export async function listNotifications(userId: string, filters: { isRead?: boolean }, page: number, pageSize: number) {
  let query = supabaseAdmin.from("notifications").select(NOTIFICATION_COLUMNS, { count: "exact" }).eq("user_id", userId);
  if (filters.isRead !== undefined) query = query.eq("is_read", filters.isRead);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const result = await query;
  if (result.error) {
    throw new Error(`Falha ao listar notificacoes: ${result.error.message}`);
  }

  return {
    items: ((result.data ?? []) as NotificationRow[]).map(mapNotification),
    pagination: { page, pageSize, total: result.count ?? 0 }
  };
}

export async function countUnreadNotifications(userId: string) {
  const { count, error } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const updated = unwrap(
    await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("id", notificationId)
      .select("id")
      .maybeSingle()
  );
  if (!updated) {
    throw new Error("Notificacao nao encontrada");
  }
  return { id: updated.id };
}

export async function markAllNotificationsRead(userId: string) {
  const result = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (result.error) {
    throw new Error(`Falha ao marcar notificacoes como lidas: ${result.error.message}`);
  }
}
