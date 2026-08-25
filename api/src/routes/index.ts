import type { FastifyInstance } from "fastify";
import { companyRoutes } from "../modules/companies/routes.js";
import { mercadoLivreRoutes, mercadoLivrePublicRoutes } from "../modules/integrations/mercado-livre/routes.js";
import { jobRoutes } from "../modules/jobs/routes.js";
import { cronRoutes } from "../modules/jobs/cron-routes.js";
import { salesMapRoutes } from "../modules/sales-map/routes.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(
    async (publicScope) => {
      await mercadoLivrePublicRoutes(publicScope);
      await cronRoutes(publicScope);
    },
    { prefix: "/api/v1" }
  );

  await app.register(
    async (protectedScope) => {
      await companyRoutes(protectedScope);
      await mercadoLivreRoutes(protectedScope);
      await jobRoutes(protectedScope);
      await salesMapRoutes(protectedScope);
    },
    { prefix: "/api/v1" }
  );
}
