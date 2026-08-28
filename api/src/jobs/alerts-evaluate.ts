import { getSaoPauloTodayIso, shiftIsoDate } from "../lib/dates.js";
import { withJobRun } from "../lib/job-runs.js";
import { evaluateAlertRulesForCompany } from "../modules/alerts/service.js";

// Fase 6: roda as regras de alerta (ver modules/alerts/service.ts) sobre
// listing_daily_snapshot. Usa o mesmo "ontem" (America/Sao_Paulo) que o job
// de agregacao (fase 2) grava -- listing_daily_snapshot nunca tem uma linha
// pra "hoje" ainda em andamento, entao avaliar contra qualquer outra data
// nao acharia snapshot novo. Pensado pra rodar depois do
// listing-daily-snapshot-aggregate-all no agendamento externo (Render cron
// ou pg_cron), nao encadeado no codigo -- um arquivo por job.
export async function runAlertsEvaluateJob(companyId: string, referenceDate?: string) {
  const date = referenceDate ?? shiftIsoDate(getSaoPauloTodayIso(), -1);
  return withJobRun({ companyId, jobName: "alerts.evaluate", payload: { referenceDate: date } }, () =>
    evaluateAlertRulesForCompany(companyId, date)
  );
}
