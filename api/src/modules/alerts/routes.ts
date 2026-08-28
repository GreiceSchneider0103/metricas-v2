import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, assertTabAllowed, getAuthContext } from "../../plugins/auth.js";
import { getAlertById, listAlerts, updateAlertStatus } from "./service.js";

const alertStatusEnum = z.enum(["open", "resolved", "muted"]);
const alertSeverityEnum = z.enum(["low", "medium", "high", "critical"]);

const listQuerySchema = z.object({
  status: alertStatusEnum.optional(),
  severity: alertSeverityEnum.optional(),
  listingId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

const alertIdParamsSchema = z.object({ alertId: z.string().uuid() });
const updateBodySchema = z.object({ status: alertStatusEnum });

// Fase 6: alertas sao abertos/fechados automaticamente pelo job
// alerts-evaluate (ver jobs/alerts-evaluate.ts + service.ts desta pasta).
// A API so le e permite override manual (silenciar/reabrir/resolver), que
// e acao de adm/master (domain-model.md: "adm: gerencia ... alertas").
export async function alertRoutes(app: FastifyInstance) {
  app.get("/alerts", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "alertas");
    const { page, pageSize, ...filters } = listQuerySchema.parse(request.query ?? {});
    return listAlerts(context.companyId, filters, page, pageSize);
  });

  app.get("/alerts/:alertId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "alertas");
    const params = alertIdParamsSchema.parse(request.params);
    const alert = await getAlertById(context.companyId, params.alertId);
    if (!alert) throw request.server.httpErrors.notFound("Alerta nao encontrado");
    return alert;
  });

  app.patch("/alerts/:alertId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "alertas");
    assertAdmOrMaster(request, context);
    const params = alertIdParamsSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body ?? {});
    return updateAlertStatus(context.companyId, params.alertId, body.status);
  });
}
