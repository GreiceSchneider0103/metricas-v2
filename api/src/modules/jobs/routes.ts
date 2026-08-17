import type { FastifyInstance } from "fastify";
import { assertAdmOrMaster, getAuthContext } from "../../plugins/auth.js";
import { runMlSyncAccountJob } from "../../jobs/ml-sync-account.js";

export async function jobRoutes(app: FastifyInstance) {
  // Fase 1: dispara sync manual (listings + orders) para a empresa logada.
  // A versao recorrente (cron) chama a mesma funcao via jobs/cron-routes.ts,
  // sem depender de um usuario logado clicando em um botao.
  app.post("/jobs/ml-sync", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    return runMlSyncAccountJob(context.companyId);
  });
}
