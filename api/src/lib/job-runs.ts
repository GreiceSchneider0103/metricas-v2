import { unwrap } from "./db.js";
import { supabaseAdmin } from "./supabase.js";

// Wrapper fino sobre public.job_runs (migration 0004). Todo job (fase 1: sync
// ML; fase 2: agregacao diaria) passa por aqui, para cumprir o requisito nao
// funcional do PRD: "sincronizacoes devem ser rastreaveis", "falhas de
// ingestao devem gerar log", "reprocessamento precisa ser possivel".
export async function withJobRun<T extends Record<string, unknown>>(
  input: { companyId: string | null; jobName: string; payload?: Record<string, unknown> },
  work: () => Promise<T>
): Promise<T> {
  const jobRun = unwrap(
    await supabaseAdmin
      .from("job_runs")
      .insert({
        company_id: input.companyId,
        job_name: input.jobName,
        status: "running",
        payload: input.payload ?? {}
      })
      .select("id")
      .single()
  );

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
