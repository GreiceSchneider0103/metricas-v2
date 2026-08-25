import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthContext } from "../../plugins/auth.js";
import { countUnreadNotifications, listNotifications, markAllNotificationsRead, markNotificationRead } from "./service.js";

const booleanQueryParam = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const listQuerySchema = z.object({
  isRead: booleanQueryParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

const notificationIdParamsSchema = z.object({ notificationId: z.string().uuid() });

// Notificacoes sao sempre pessoais (user_id) -- por isso nenhuma rota aqui
// usa assertAdmOrMaster, so o proprio usuario logado ve/marca as suas.
export async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications", async (request) => {
    const context = await getAuthContext(request);
    const { page, pageSize, isRead } = listQuerySchema.parse(request.query ?? {});
    return listNotifications(context.userId, { isRead }, page, pageSize);
  });

  app.get("/notifications/unread-count", async (request) => {
    const context = await getAuthContext(request);
    return { count: await countUnreadNotifications(context.userId) };
  });

  app.patch("/notifications/read-all", async (request) => {
    const context = await getAuthContext(request);
    await markAllNotificationsRead(context.userId);
    return { ok: true };
  });

  app.patch("/notifications/:notificationId/read", async (request) => {
    const context = await getAuthContext(request);
    const params = notificationIdParamsSchema.parse(request.params);
    return markNotificationRead(context.userId, params.notificationId);
  });
}
