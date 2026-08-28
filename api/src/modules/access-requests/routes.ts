import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, getAuthContext, getAuthenticatedUserId } from "../../plugins/auth.js";
import {
  approveAccessRequest,
  createAccessRequest,
  hasPendingAccessRequest,
  listPendingAccessRequests,
  rejectAccessRequest
} from "./service.js";

const requestIdParamsSchema = z.object({ requestId: z.string().uuid() });

export async function accessRequestRoutes(app: FastifyInstance) {
  // So precisa de um usuario Supabase Auth valido -- chamado logo apos o
  // cadastro, quando o usuario ainda pode nao pertencer a nenhuma empresa.
  app.post("/access-requests", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const body = z.object({ companyId: z.string().uuid() }).parse(request.body ?? {});
    return createAccessRequest({ userId, companyId: body.companyId });
  });

  // Usado pela tela de espera (login) para saber se ja existe pedido em
  // aberto, sem precisar de contexto de empresa.
  app.get("/access-requests/mine", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    return { hasPending: await hasPendingAccessRequest(userId) };
  });

  app.get("/team/access-requests", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    return { items: await listPendingAccessRequests(context.companyId) };
  });

  app.post("/team/access-requests/:requestId/approve", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const params = requestIdParamsSchema.parse(request.params);
    const body = z.object({ role: z.enum(["adm", "agente"]) }).parse(request.body ?? {});
    return approveAccessRequest({
      companyId: context.companyId,
      requestId: params.requestId,
      reviewedBy: context.userId,
      role: body.role
    });
  });

  app.post("/team/access-requests/:requestId/reject", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const params = requestIdParamsSchema.parse(request.params);
    return rejectAccessRequest({ companyId: context.companyId, requestId: params.requestId, reviewedBy: context.userId });
  });
}
