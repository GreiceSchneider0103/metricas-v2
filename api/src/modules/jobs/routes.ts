import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmOrMaster, getAuthContext } from "../../plugins/auth.js";
import { runMlSyncAccountJob } from "../../jobs/ml-sync-account.js";
import {
  aggregateListingDailySnapshotForCompany,
  runListingDailySnapshotAggregateJobForYesterday
} from "../../jobs/listing-daily-snapshot-aggregate.js";
import { runAlertsEvaluateJob } from "../../jobs/alerts-evaluate.js";
import { runOrdersBackfillJob } from "../../jobs/orders-sync.js";
import { runVisitsBackfillJob, runVisitsSyncJob } from "../../jobs/visits-sync.js";

const dateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD")
    .optional()
});

const dateRangeBodySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from deve estar no formato YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to deve estar no formato YYYY-MM-DD")
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

  // Carga retroativa manual (disparo unico, nao recorrente): busca
  // orders/order_items da empresa logada num intervalo de datas explicito,
  // fora da janela padrao de 3 dias do ml-sync. Util ao conectar uma conta
  // com anuncios ja ativos ha mais tempo.
  app.post("/jobs/orders-backfill", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const body = dateRangeBodySchema.parse(request.body ?? {});
    return runOrdersBackfillJob(context.companyId, body.from, body.to);
  });

  // Preenche visits em listing_daily_snapshot (a agregacao sozinha nao busca
  // isso -- ver comentario em visits-sync.ts). Sem "date", faz o dia anterior
  // (mesmo padrao dos outros jobs de dia unico).
  app.post("/jobs/visits-sync", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const query = dateQuerySchema.parse(request.query ?? {});
    return runVisitsSyncJob(context.companyId, query.date);
  });

  // Carga retroativa manual de visitas (disparo unico): os snapshots do
  // intervalo ja precisam existir (rodar depois de orders-backfill +
  // listing-daily-snapshot-aggregate cobrirem o mesmo periodo).
  app.post("/jobs/visits-backfill", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const body = dateRangeBodySchema.parse(request.body ?? {});
    return runVisitsBackfillJob(context.companyId, body.from, body.to);
  });

  // Fase 6: dispara a avaliacao de alertas manualmente. Sem "date" na query,
  // avalia o dia anterior completo (mesmo comportamento do cron e do mesmo
  // motivo do job de agregacao: "hoje" ainda nao tem snapshot fechado).
  app.post("/jobs/alerts-evaluate", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    const query = dateQuerySchema.parse(request.query ?? {});
    return runAlertsEvaluateJob(context.companyId, query.date);
  });
}
