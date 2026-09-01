import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, assertTabAllowed, getAuthContext } from "../../plugins/auth.js";
import { createGoal, deleteGoal, getGoalById, getGoalProgress, listGoals, updateGoal } from "./service.js";

const metricCodeEnum = z.enum(["revenue", "units_sold", "orders_count", "visits"]);
const goalStatusEnum = z.enum(["active", "achieved", "missed", "cancelled"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "deve estar no formato YYYY-MM-DD");

const createBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    metricCode: metricCodeEnum,
    targetValue: z.coerce.number().positive(),
    periodStart: isoDate,
    periodEnd: isoDate,
    listingId: z.string().uuid().optional(),
    ownerId: z.string().uuid().optional()
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "periodStart deve ser <= periodEnd",
    path: ["periodStart"]
  });

const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    targetValue: z.coerce.number().positive().optional(),
    periodStart: isoDate.optional(),
    periodEnd: isoDate.optional(),
    listingId: z.string().uuid().nullable().optional(),
    ownerId: z.string().uuid().nullable().optional(),
    status: goalStatusEnum.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "informe ao menos um campo para atualizar" });

const listQuerySchema = z.object({
  status: goalStatusEnum.optional(),
  listingId: z.string().uuid().optional(),
  metricCode: metricCodeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

const goalIdParamsSchema = z.object({ goalId: z.string().uuid() });

// Fase 6: metas sao geridas por adm/master (domain-model.md: "adm: gerencia
// ... metas, alertas, estrategias"), mas qualquer membro ativo pode ver
// (dashboard-like, mesma logica de sales-map).
export async function goalRoutes(app: FastifyInstance) {
  app.post("/goals", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "configuracoes"]);
    assertAdmOrMaster(request, context);
    const body = createBodySchema.parse(request.body ?? {});
    return createGoal({ companyId: context.companyId, createdBy: context.userId, ...body });
  });

  app.get("/goals", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "configuracoes"]);
    const { page, pageSize, ...filters } = listQuerySchema.parse(request.query ?? {});
    return listGoals(context.companyId, filters, page, pageSize);
  });

  app.get("/goals/:goalId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "configuracoes"]);
    const params = goalIdParamsSchema.parse(request.params);
    const goal = await getGoalById(context.companyId, params.goalId);
    if (!goal) throw request.server.httpErrors.notFound("Meta nao encontrada");
    return goal;
  });

  app.get("/goals/:goalId/progress", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "configuracoes"]);
    const params = goalIdParamsSchema.parse(request.params);
    const progress = await getGoalProgress(context.companyId, params.goalId);
    if (!progress) throw request.server.httpErrors.notFound("Meta nao encontrada");
    return progress;
  });

  app.patch("/goals/:goalId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "configuracoes"]);
    assertAdmOrMaster(request, context);
    const params = goalIdParamsSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body ?? {});
    return updateGoal({ companyId: context.companyId, goalId: params.goalId, changes: body });
  });

  app.delete("/goals/:goalId", async (request, reply) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "configuracoes"]);
    assertAdmOrMaster(request, context);
    const params = goalIdParamsSchema.parse(request.params);
    await deleteGoal(context.companyId, params.goalId);
    return reply.code(204).send();
  });
}
