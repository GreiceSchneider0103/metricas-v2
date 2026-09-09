-- Impede duas execucoes concorrentes do mesmo job pra mesma empresa (ver
-- comentario em api/src/lib/job-runs.ts). GitHub Actions e pg_cron chamam os
-- mesmos endpoints /cron/* de forma redundante -- sem isso, o refresh de
-- OAuth token e o reprocessamento de order_items (delete+insert sem chave
-- natural unica) podem rodar em paralelo pra mesma conta.
create unique index job_runs_one_running_per_company_job
  on public.job_runs (company_id, job_name)
  where status = 'running';
