import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthContext } from "../../plugins/auth.js";
import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { createCompany, listMyCompanies } from "./service.js";

export async function companyRoutes(app: FastifyInstance) {
  // Sem auth de company (o usuario ainda nao tem uma) -- so precisa de um
  // usuario Supabase Auth valido. E o unico jeito de "entrar" no sistema
  // pela primeira vez.
  app.post("/companies", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw request.server.httpErrors.unauthorized("Missing authorization bearer token");
    }
    const token = authorization.slice("Bearer ".length);
    const authResult = await supabaseAdmin.auth.getUser(token);
    if (authResult.error || !authResult.data.user) {
      throw request.server.httpErrors.unauthorized("Invalid or expired token");
    }

    const body = z.object({ name: z.string().trim().min(2).max(120) }).parse(request.body ?? {});
    return createCompany({ userId: authResult.data.user.id, name: body.name });
  });

  app.get("/companies/mine", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw request.server.httpErrors.unauthorized("Missing authorization bearer token");
    }
    const token = authorization.slice("Bearer ".length);
    const authResult = await supabaseAdmin.auth.getUser(token);
    if (authResult.error || !authResult.data.user) {
      throw request.server.httpErrors.unauthorized("Invalid or expired token");
    }

    return { items: await listMyCompanies(authResult.data.user.id) };
  });

  app.get("/companies/current", async (request) => {
    const context = await getAuthContext(request);
    return unwrap(
      await supabaseAdmin.from("companies").select("id, name, slug, created_at").eq("id", context.companyId).single()
    );
  });
}
