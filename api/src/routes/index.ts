import type { FastifyInstance } from "fastify";
import { companyRoutes } from "../modules/companies/routes.js";
import { accessRequestRoutes } from "../modules/access-requests/routes.js";
import { mercadoLivreRoutes, mercadoLivrePublicRoutes } from "../modules/integrations/mercado-livre/routes.js";
import { jobRoutes } from "../modules/jobs/routes.js";
import { cronRoutes } from "../modules/jobs/cron-routes.js";
import { salesMapRoutes } from "../modules/sales-map/routes.js";
import { teamRoutes } from "../modules/team/routes.js";
import { taskRoutes } from "../modules/tasks/routes.js";
import { goalRoutes } from "../modules/goals/routes.js";
import { alertRoutes } from "../modules/alerts/routes.js";
import { notificationRoutes } from "../modules/notifications/routes.js";

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
      await accessRequestRoutes(protectedScope);
      await mercadoLivreRoutes(protectedScope);
      await jobRoutes(protectedScope);
      await salesMapRoutes(protectedScope);
      await teamRoutes(protectedScope);
      await taskRoutes(protectedScope);
      await goalRoutes(protectedScope);
      await alertRoutes(protectedScope);
      await notificationRoutes(protectedScope);
    },
    { prefix: "/api/v1" }
  );
}
