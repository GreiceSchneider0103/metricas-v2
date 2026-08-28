import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertPlatformAdmin, getAuthContext, getAuthenticatedUserId } from "../../plugins/auth.js";
import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { createCompany, listMyCompanies, searchCompanies } from "./service.js";

export async function companyRoutes(app: FastifyInstance) {
  // So o master de plataforma cria empresas novas -- quem se cadastra nunca
  // cria nem escolhe empresa (cai automaticamente na empresa de onboarding,
  // ver access-requests/service.ts).
  app.post("/companies", async (request) => {
    const context = await getAuthContext(request);
    assertPlatformAdmin(request, context);
    const body = z.object({ name: z.string().trim().min(2).max(120) }).parse(request.body ?? {});
    return createCompany({ userId: context.userId, name: body.name });
  });

  app.get("/companies/mine", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const userRow = unwrap(await supabaseAdmin.from("users").select("is_platform_admin").eq("id", userId).maybeSingle());
    return { items: await listMyCompanies(userId), isPlatformAdmin: userRow?.is_platform_admin ?? false };
  });

  app.get("/companies/current", async (request) => {
    const context = await getAuthContext(request);
    return unwrap(
      await supabaseAdmin.from("companies").select("id, name, slug, created_at").eq("id", context.companyId).single()
    );
  });

  // So o master de plataforma usa isso hoje (seletor de empresa-destino ao
  // aprovar um pedido de acesso). Sem "q", lista todas em ordem alfabetica.
  app.get("/companies/search", async (request) => {
    const context = await getAuthContext(request);
    assertPlatformAdmin(request, context);
    const query = z.object({ q: z.string().trim().min(1).max(120).optional() }).parse(request.query ?? {});
    return { items: await searchCompanies(query.q) };
  });
}
