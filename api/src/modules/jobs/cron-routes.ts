import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { unwrap } from "../../lib/db.js";
import { runMlSyncAccountJob } from "../../jobs/ml-sync-account.js";

// Acionado por um cron externo (Render cron job ou Supabase pg_cron --
// decidir na fase 2), nao por GitHub Actions como no repo antigo. Roda o
// sync de todas as empresas com pelo menos uma conta ML conectada.
export async function cronRoutes(app: FastifyInstance) {
  app.post("/cron/ml-sync-all", async (request, reply) => {
    const secret = request.headers["x-cron-secret"];
    if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
      return reply.code(401).send({ error: "invalid cron secret" });
    }

    const accounts = unwrap(
      await supabaseAdmin.from("ml_accounts").select("company_id").eq("status", "connected")
    );
    const companyIds = Array.from(new Set((accounts ?? []).map((row) => row.company_id)));

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
}
