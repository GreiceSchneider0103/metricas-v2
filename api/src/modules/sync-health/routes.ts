import type { FastifyInstance } from "fastify";
import { assertAdmOrMaster, assertTabAllowed, getAuthContext } from "../../plugins/auth.js";
import { getSyncHealth } from "./service.js";

export async function syncHealthRoutes(app: FastifyInstance) {
  app.get("/integrations/sync-health", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    assertAdmOrMaster(request, context);
    return getSyncHealth(context.companyId);
  });
}
