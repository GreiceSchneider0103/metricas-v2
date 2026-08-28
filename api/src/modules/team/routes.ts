import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, assertPlatformAdmin, assertTabAllowed, getAuthContext } from "../../plugins/auth.js";
import { inviteTeamMember, listTeamMembers, listUserMemberships, updateTeamMember, updateUserFullName } from "./service.js";

const appTabEnum = z.enum(["mapa_vendas", "atividades", "alertas", "configuracoes"]);

const inviteBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["adm", "agente"]),
  fullName: z.string().trim().min(1).max(120).optional(),
  allowedTabs: z.array(appTabEnum).optional(),
  // So respeitado se quem chama for master de plataforma -- permite convidar
  // pra uma empresa diferente da ativa no momento (ver routes abaixo).
  companyId: z.string().uuid().optional()
});

const updateBodySchema = z
  .object({
    role: z.enum(["adm", "agente"]).optional(),
    isActive: z.boolean().optional(),
    allowedTabs: z.array(appTabEnum).optional(),
    companyId: z.string().uuid().optional()
  })
  .refine((value) => value.role !== undefined || value.isActive !== undefined || value.allowedTabs !== undefined, {
    message: "informe role, isActive e/ou allowedTabs"
  });

const userIdParamsSchema = z.object({ userId: z.string().uuid() });
const profileBodySchema = z.object({ fullName: z.string().trim().min(1).max(120) });

export async function teamRoutes(app: FastifyInstance) {
  // Fase 4: qualquer membro ativo da empresa pode ver quem mais faz parte dela.
  app.get("/team", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    return { items: await listTeamMembers(context.companyId) };
  });

  // Convida (ou reativa, se ja tiver sido removido) um adm ou agente. "master"
  // nao e um papel convidavel -- so existe o master criado junto com a empresa.
  app.post("/team/invite", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    assertAdmOrMaster(request, context);
    const body = inviteBodySchema.parse(request.body ?? {});

    if (context.role === "adm" && body.role !== "agente") {
      throw request.server.httpErrors.forbidden("adm so pode convidar usuarios com papel agente");
    }
    const targetCompanyId = context.isPlatformAdmin && body.companyId ? body.companyId : context.companyId;

    return inviteTeamMember({
      companyId: targetCompanyId,
      invitedBy: context.userId,
      email: body.email,
      role: body.role,
      fullName: body.fullName,
      allowedTabs: body.allowedTabs
    });
  });

  // Atualiza papel, ativo/inativo e/ou abas liberadas de um membro. Regras
  // finas de quem pode mexer em quem (adm so em agente, master nao pode ser
  // rebaixado por aqui, nao pode zerar o ultimo master ativo) ficam em
  // team/service.ts. Master de plataforma pode informar companyId pra editar
  // uma membership em empresa diferente da ativa no momento.
  app.patch("/team/:userId", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    assertAdmOrMaster(request, context);
    const params = userIdParamsSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body ?? {});
    const targetCompanyId = context.isPlatformAdmin && body.companyId ? body.companyId : context.companyId;

    return updateTeamMember({
      companyId: targetCompanyId,
      requesterRole: context.role,
      isPlatformAdmin: context.isPlatformAdmin,
      targetUserId: params.userId,
      role: body.role,
      isActive: body.isActive,
      allowedTabs: body.allowedTabs
    });
  });

  // So o master de plataforma enxerga/edita um usuario "de fora" das
  // proprias empresas -- para todo mundo, a edicao de membership acontece
  // via /team/:userId de dentro da empresa em questao.
  app.get("/team/users/:userId/memberships", async (request) => {
    const context = await getAuthContext(request);
    assertPlatformAdmin(request, context);
    const params = userIdParamsSchema.parse(request.params);
    return { items: await listUserMemberships(params.userId) };
  });

  app.patch("/team/users/:userId/profile", async (request) => {
    const context = await getAuthContext(request);
    assertPlatformAdmin(request, context);
    const params = userIdParamsSchema.parse(request.params);
    const body = profileBodySchema.parse(request.body ?? {});
    return updateUserFullName(params.userId, body.fullName);
  });
}
