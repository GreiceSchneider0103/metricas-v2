import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertTabAllowed, getAuthContext } from "../../plugins/auth.js";
import {
  addTaskComment,
  countOpenTasks,
  createTask,
  getTaskById,
  listTaskComments,
  listTaskHistory,
  listTasks,
  updateTask
} from "./service.js";

const taskStatusEnum = z.enum(["todo", "in_progress", "waiting", "done", "cancelled"]);
const taskPriorityEnum = z.enum(["low", "medium", "high", "critical"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "deve estar no formato YYYY-MM-DD");

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000).optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: isoDate.optional(),
  assignedTo: z.string().uuid().optional(),
  relatedListingId: z.string().uuid().optional()
});

const updateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: taskStatusEnum.optional(),
    priority: taskPriorityEnum.optional(),
    dueDate: isoDate.nullable().optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    relatedListingId: z.string().uuid().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "informe ao menos um campo para atualizar" });

const listQuerySchema = z.object({
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assignedTo: z.string().uuid().optional(),
  relatedListingId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
  dueBefore: isoDate.optional(),
  dueAfter: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

const taskIdParamsSchema = z.object({ taskId: z.string().uuid() });
const commentBodySchema = z.object({ body: z.string().trim().min(1).max(5000) });

// Fase 5: qualquer membro ativo da empresa cria/ve/opera tarefas -- ao
// contrario de integracoes e equipe (adm/master), o domain-model.md nao
// distingue papel para tarefas ("agente: opera tarefas atribuidas" nao
// implica que so agente opera, so que agente tambem pode). Nao ha DELETE:
// remocao e representada por status "cancelled" via PATCH, pra nao perder
// o historico de auditoria (task_history) junto com a tarefa.
export async function taskRoutes(app: FastifyInstance) {
  app.post("/tasks", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const body = createBodySchema.parse(request.body ?? {});
    return createTask({ companyId: context.companyId, createdBy: context.userId, ...body });
  });

  app.get("/tasks", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const { page, pageSize, ...filters } = listQuerySchema.parse(request.query ?? {});
    return listTasks(context.companyId, filters, page, pageSize);
  });

  app.get("/tasks/open-count", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    return { count: await countOpenTasks(context.companyId) };
  });

  app.get("/tasks/:taskId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const params = taskIdParamsSchema.parse(request.params);
    const task = await getTaskById(context.companyId, params.taskId);
    if (!task) {
      throw request.server.httpErrors.notFound("Tarefa nao encontrada");
    }
    return task;
  });

  app.patch("/tasks/:taskId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const params = taskIdParamsSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body ?? {});
    const existing = await getTaskById(context.companyId, params.taskId);
    if (!existing) {
      throw request.server.httpErrors.notFound("Tarefa nao encontrada");
    }
    return updateTask({ companyId: context.companyId, taskId: params.taskId, actorId: context.userId, changes: body });
  });

  app.get("/tasks/:taskId/comments", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const params = taskIdParamsSchema.parse(request.params);
    const task = await getTaskById(context.companyId, params.taskId);
    if (!task) {
      throw request.server.httpErrors.notFound("Tarefa nao encontrada");
    }
    return { items: await listTaskComments(context.companyId, params.taskId) };
  });

  app.post("/tasks/:taskId/comments", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const params = taskIdParamsSchema.parse(request.params);
    const body = commentBodySchema.parse(request.body ?? {});
    const task = await getTaskById(context.companyId, params.taskId);
    if (!task) {
      throw request.server.httpErrors.notFound("Tarefa nao encontrada");
    }
    return addTaskComment({ companyId: context.companyId, taskId: params.taskId, authorId: context.userId, body: body.body });
  });

  app.get("/tasks/:taskId/history", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "atividades");
    const params = taskIdParamsSchema.parse(request.params);
    const task = await getTaskById(context.companyId, params.taskId);
    if (!task) {
      throw request.server.httpErrors.notFound("Tarefa nao encontrada");
    }
    return { items: await listTaskHistory(context.companyId, params.taskId) };
  });
}
