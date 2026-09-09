import { supabaseAdmin } from "./supabase.js";

// Job preso "running" pra sempre trava esse (company_id, job_name) de vez --
// acontece se o processo morrer no meio (deploy, crash) antes do finally
// rodar. Acima desse tempo o run e considerado morto e liberado sozinho na
// proxima tentativa, em vez de exigir destravar manualmente no banco.
const STALE_RUNNING_THRESHOLD_MINUTES = 30;

// Wrapper fino sobre public.job_runs (migration 0004). Todo job (fase 1: sync
// ML; fase 2: agregacao diaria) passa por aqui, para cumprir o requisito nao
// funcional do PRD: "sincronizacoes devem ser rastreaveis", "falhas de
// ingestao devem gerar log", "reprocessamento precisa ser possivel".
//
// Tambem e o unico lugar que impede duas execucoes concorrentes do mesmo job
// pra mesma empresa -- necessario porque o GitHub Actions e o pg_cron do
// Supabase disparam os mesmos endpoints /cron/* de forma redundante (ver
// comentario em cron-routes.ts), e o refresh de OAuth token (le token atual,
// grava o novo) e o reprocessamento de orders/order_items (delete + insert
// sem chave natural unica) nao sao seguros rodando em paralelo pra mesma
// conta. A trava e um unique index parcial em job_runs (company_id, job_name)
// WHERE status = 'running' (migration job_runs_one_running_lock) -- o INSERT
// abaixo falha com 23505 (unique_violation) se ja existir um run "running"
// pra essa combinacao, e isso e tratado como "pula essa rodada" em vez de erro.
export async function withJobRun<T extends Record<string, unknown>>(
  input: { companyId: string | null; jobName: string; payload?: Record<string, unknown> },
  work: () => Promise<T>
): Promise<T> {
  if (input.companyId) {
    const staleCutoff = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MINUTES * 60_000).toISOString();
    await supabaseAdmin
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: { message: `Run travado em "running" por mais de ${STALE_RUNNING_THRESHOLD_MINUTES}min -- provavelmente o processo morreu no meio (deploy/crash). Marcado como falho pra liberar a trava.` }
      })
      .eq("company_id", input.companyId)
      .eq("job_name", input.jobName)
      .eq("status", "running")
      .lt("started_at", staleCutoff);
  }

  const insertResult = await supabaseAdmin
    .from("job_runs")
    .insert({
      company_id: input.companyId,
      job_name: input.jobName,
      status: "running",
      payload: input.payload ?? {}
    })
    .select("id")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      throw new Error(
        `Já existe uma execução em andamento de "${input.jobName}" para esta empresa -- pulando esta rodada para evitar processar em duplicidade.`
      );
    }
    throw new Error(insertResult.error.message);
  }
  const jobRun = insertResult.data;

  try {
    const result = await work();
    await supabaseAdmin
      .from("job_runs")
      .update({ status: "completed", finished_at: new Date().toISOString(), payload: { ...input.payload, result } })
      .eq("id", jobRun.id);
    return result;
  } catch (error) {
    await supabaseAdmin
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: { message: error instanceof Error ? error.message : String(error) }
      })
      .eq("id", jobRun.id);
    throw error;
  }
}
