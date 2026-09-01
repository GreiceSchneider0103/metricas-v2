import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { unwrap } from "../../lib/db.js";
import { getSaoPauloTodayIso } from "../../lib/dates.js";
import { runMlSyncAccountJob } from "../../jobs/ml-sync-account.js";
import {
  runListingDailySnapshotAggregateJobForToday,
  runListingDailySnapshotAggregateJobForYesterday,
  runListingDailySnapshotAggregateRangeJob
} from "../../jobs/listing-daily-snapshot-aggregate.js";
import { runAlertsEvaluateJob } from "../../jobs/alerts-evaluate.js";
import { runOrdersBackfillJob } from "../../jobs/orders-sync.js";
import { runVisitsSyncJob } from "../../jobs/visits-sync.js";

// Aceita qualquer um dos dois secrets configurados -- CRON_SECRET (usado
// pelo GitHub Actions) ou SUPABASE_CRON_SECRET (usado pelo pg_cron do
// Supabase, gatilho redundante e mais confiavel: o schedule do GitHub
// Actions ja ficou horas sem disparar nenhuma vez, mesmo ativo, um
// problema conhecido de confiabilidade do lado do GitHub, nao daqui).
function isValidCronSecret(secret: unknown) {
  if (typeof secret !== "string" || secret.length === 0) return false;
  return secret === config.CRON_SECRET || secret === config.SUPABASE_CRON_SECRET;
}

async function getConnectedCompanyIds() {
  const accounts = unwrap(
    await supabaseAdmin.from("ml_accounts").select("company_id").eq("status", "connected")
  );
  return Array.from(new Set((accounts ?? []).map((row) => row.company_id)));
}

// Acionado por um cron externo (Render cron job ou Supabase pg_cron --
// decidir na fase 2), nao por GitHub Actions como no repo antigo.
export async function cronRoutes(app: FastifyInstance) {
  // Roda o sync de todas as empresas com pelo menos uma conta ML conectada.
  app.post("/cron/ml-sync-all", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const companyIds = await getConnectedCompanyIds();
    const results = [];
    for (const companyId of companyIds) {
      try {
        results.push({ companyId, ...(await runMlSyncAccountJob(companyId)) });
      } catch (error) {
        results.push({ companyId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { companiesProcessed: companyIds.length, results };
  });

  // Fase 2: agrega o dia anterior completo (America/Sao_Paulo) para todas as
  // empresas com pelo menos uma conta ML conectada. Roda separado do
  // ml-sync-all porque a agregacao so faz sentido depois que o dia fechou
  // de verdade -- um agendamento tipico e ml-sync-all a cada poucas horas e
  // este endpoint uma vez por dia, logo apos a meia-noite local.
  app.post("/cron/listing-daily-snapshot-aggregate-all", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const companyIds = await getConnectedCompanyIds();
    const results = [];
    for (const companyId of companyIds) {
      try {
        results.push({ companyId, ...(await runListingDailySnapshotAggregateJobForYesterday(companyId)) });
      } catch (error) {
        results.push({ companyId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { companiesProcessed: companyIds.length, results };
  });

  // Reagrega o mes corrente inteiro (dia 1 ate hoje), nao so ontem --
  // pedido explicito do usuario, roda 1x por dia as 5h (ver cron.yml). Cobre
  // pedidos que chegaram atrasados em dias ja fechados do mes.
  app.post("/cron/listing-daily-snapshot-aggregate-month-all", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const monthStart = `${getSaoPauloTodayIso().slice(0, 7)}-01`;
    const today = getSaoPauloTodayIso();
    const companyIds = await getConnectedCompanyIds();
    const results = [];
    for (const companyId of companyIds) {
      try {
        results.push({ companyId, ...(await runListingDailySnapshotAggregateRangeJob(companyId, monthStart, today)) });
      } catch (error) {
        results.push({ companyId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { companiesProcessed: companyIds.length, results };
  });

  // Atualiza o dia corrente (agregacao + visitas) -- pedido explicito do
  // usuario, roda de hora em hora (ver cron.yml). "Hoje" e um snapshot
  // parcial por natureza, reescrito a cada rodada conforme mais pedidos
  // fecham no dia.
  app.post("/cron/today-refresh-all", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const companyIds = await getConnectedCompanyIds();
    const results = [];
    for (const companyId of companyIds) {
      try {
        await runListingDailySnapshotAggregateJobForToday(companyId);
        results.push({ companyId, ...(await runVisitsSyncJob(companyId, getSaoPauloTodayIso())) });
      } catch (error) {
        results.push({ companyId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { companiesProcessed: companyIds.length, results };
  });

  // Preenche visits em listing_daily_snapshot pro dia anterior -- roda
  // DEPOIS de listing-daily-snapshot-aggregate-all no agendamento externo
  // (a linha do snapshot precisa existir antes do UPDATE).
  app.post("/cron/visits-sync-all", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const companyIds = await getConnectedCompanyIds();
    const results = [];
    for (const companyId of companyIds) {
      try {
        results.push({ companyId, ...(await runVisitsSyncJob(companyId)) });
      } catch (error) {
        results.push({ companyId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { companiesProcessed: companyIds.length, results };
  });

  // Carga retroativa manual (disparo unico, nao um cron periodico): busca
  // orders/order_items de uma empresa num intervalo de datas explicito, fora
  // da janela padrao de 3 dias do ml-sync-all. Mesmo secret dos outros
  // endpoints de /cron -- nao depende de sessao de usuario.
  app.post("/cron/orders-backfill", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const body = z
      .object({
        companyId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.body ?? {});

    return runOrdersBackfillJob(body.companyId, body.from, body.to);
  });

  // Fase 6: avalia as regras de alerta pra todas as empresas com pelo menos
  // uma conta ML conectada. Deve rodar DEPOIS de
  // listing-daily-snapshot-aggregate-all no agendamento externo -- depende
  // do snapshot do dia ja estar gravado.
  app.post("/cron/alerts-evaluate-all", async (request, reply) => {
    if (!isValidCronSecret(request.headers["x-cron-secret"])) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const companyIds = await getConnectedCompanyIds();
    const results = [];
    for (const companyId of companyIds) {
      try {
        results.push({ companyId, ...(await runAlertsEvaluateJob(companyId)) });
      } catch (error) {
        results.push({ companyId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { companiesProcessed: companyIds.length, results };
  });
}
