import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { unwrap } from "../../lib/db.js";
import { runMlSyncAccountJob } from "../../jobs/ml-sync-account.js";
import { runListingDailySnapshotAggregateJobForYesterday } from "../../jobs/listing-daily-snapshot-aggregate.js";
import { runAlertsEvaluateJob } from "../../jobs/alerts-evaluate.js";

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
    const secret = request.headers["x-cron-secret"];
    if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
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
    const secret = request.headers["x-cron-secret"];
    if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
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

  // Fase 6: avalia as regras de alerta pra todas as empresas com pelo menos
  // uma conta ML conectada. Deve rodar DEPOIS de
  // listing-daily-snapshot-aggregate-all no agendamento externo -- depende
  // do snapshot do dia ja estar gravado.
  app.post("/cron/alerts-evaluate-all", async (request, reply) => {
    const secret = request.headers["x-cron-secret"];
    if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
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
