import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, getAuthContext } from "../../plugins/auth.js";
import { runMlSyncAccountJob } from "../../jobs/ml-sync-account.js";
import {
  aggregateListingDailySnapshotForCompany,
  runListingDailySnapshotAggregateJobForYesterday
} from "../../jobs/listing-daily-snapshot-aggregate.js";

const dateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD")
    .optional()
});

export async function jobRoutes(app: FastifyInstance) {
  // Fase 1: dispara sync manual (listings + orders) para a empresa logada.
  // A versao recorrente (cron) chama a mesma funcao via jobs/cron-routes.ts,
  // sem depender de um usuario logado clicando em um botao.
  app.post("/jobs/ml-sync", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    return runMlSyncAccountJob(context.companyId);
  });

  // Fase 2: dispara a agregacao diaria manualmente. Sem "date" na query,
  // agrega o dia anterior completo (mesmo comportamento do cron). Util para
  // reprocessar um dia especifico depois de uma correcao na sync.
  app.post("/jobs/listing-daily-snapshot-aggregate", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const query = dateQuerySchema.parse(request.query ?? {});
    return query.date
      ? aggregateListingDailySnapshotForCompany(context.companyId, query.date)
      : runListingDailySnapshotAggregateJobForYesterday(context.companyId);
  });
}
