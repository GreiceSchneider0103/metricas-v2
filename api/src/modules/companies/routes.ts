import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthContext, getAuthenticatedUserId } from "../../plugins/auth.js";
import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { createCompany, listMyCompanies, searchCompanies } from "./service.js";

export async function companyRoutes(app: FastifyInstance) {
  // Sem auth de company (o usuario ainda nao tem uma) -- so precisa de um
  // usuario Supabase Auth valido. E o unico jeito de "entrar" no sistema
  // pela primeira vez.
  app.post("/companies", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const body = z.object({ name: z.string().trim().min(2).max(120) }).parse(request.body ?? {});
    return createCompany({ userId, name: body.name });
  });

  app.get("/companies/mine", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    return { items: await listMyCompanies(userId) };
  });

  app.get("/companies/current", async (request) => {
    const context = await getAuthContext(request);
    return unwrap(
      await supabaseAdmin.from("companies").select("id, name, slug, created_at").eq("id", context.companyId).single()
    );
  });

  // Publica de proposito: usada pela tela de cadastro (login), ANTES de
  // existir conta -- e assim que a pessoa acha a empresa a qual quer pedir
  // acesso. Expoe so id/name/slug, nunca dados internos da empresa.
  app.get("/companies/search", async (request) => {
    const query = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query ?? {});
    return { items: await searchCompanies(query.q) };
  });
}
