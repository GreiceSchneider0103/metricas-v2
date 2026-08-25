import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, getAuthContext } from "../../plugins/auth.js";
import { inviteTeamMember, listTeamMembers, updateTeamMember } from "./service.js";

const inviteBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["adm", "agente"]),
  fullName: z.string().trim().min(1).max(120).optional()
});

const updateBodySchema = z
  .object({
    role: z.enum(["adm", "agente"]).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: "informe role e/ou isActive"
  });

const userIdParamsSchema = z.object({ userId: z.string().uuid() });

export async function teamRoutes(app: FastifyInstance) {
  // Fase 4: qualquer membro ativo da empresa pode ver quem mais faz parte dela.
  app.get("/team", async (request) => {
    const context = await getAuthContext(request);
    return { items: await listTeamMembers(context.companyId) };
  });

  // Convida (ou reativa, se ja tiver sido removido) um adm ou agente. "master"
  // nao e um papel convidavel -- so existe o master criado junto com a empresa.
  app.post("/team/invite", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const body = inviteBodySchema.parse(request.body ?? {});

    if (context.role === "adm" && body.role !== "agente") {
      throw request.server.httpErrors.forbidden("adm so pode convidar usuarios com papel agente");
    }

    return inviteTeamMember({
      companyId: context.companyId,
      invitedBy: context.userId,
      email: body.email,
      role: body.role,
      fullName: body.fullName
    });
  });

  // Atualiza papel e/ou ativa/desativa um membro. Regras finas de quem pode
  // mexer em quem (adm so em agente, master nao pode ser rebaixado por aqui,
  // nao pode zerar o ultimo master ativo) ficam em team/service.ts.
  app.patch("/team/:userId", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const params = userIdParamsSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body ?? {});

    return updateTeamMember({
      companyId: context.companyId,
      requesterRole: context.role,
      targetUserId: params.userId,
      role: body.role,
      isActive: body.isActive
    });
  });
}
