-- Fase 2: job de agregacao diaria -> listing_daily_snapshot.
--
-- Esta e a tabela que resolve o problema central diagnosticado no repo
-- antigo: getSalesMap() recalculava vendas/receita em memoria a cada
-- request, juntando listings + orders + order_items inteiros do mes. Aqui,
-- 1 linha = 1 anuncio + 1 dia, ja com tudo pre-calculado a partir de
-- listings + orders + order_items (migrations anteriores). O endpoint do
-- mapa de vendas (fase 3) so faz select ... where company_id = ? and
-- snapshot_date between ? and ?, nunca mais um join com orders/order_items
-- em tempo de leitura.
--
-- Quem escreve aqui e exclusivamente o job de agregacao (fase 2), nunca o
-- endpoint de leitura.

create table public.listing_daily_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  snapshot_date date not null,

  -- funil do dia
  visits integer not null default 0,
  orders_count integer not null default 0,
  units_sold integer not null default 0,
  revenue numeric(14, 2) not null default 0,

  -- preco e estoque no dia
  price numeric(12, 2),
  effective_price numeric(12, 2), -- preco de venda considerando promocao ativa
  stock integer,

  -- flags do dia (podem mudar dia a dia, por isso ficam no snapshot e nao só em listings)
  listing_status text,
  is_promotion_active boolean not null default false,
  has_ads boolean not null default false,

  -- metricas derivadas, materializadas para o endpoint nunca calcular na leitura
  conversion_rate numeric(7, 4), -- orders_count / visits
  avg_ticket numeric(12, 2), -- revenue / orders_count

  raw_payload jsonb not null default '{}'::jsonb, -- payload cru do ML no momento da coleta, para auditoria/reprocessamento
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, listing_id, snapshot_date)
);

-- Os dois padroes de leitura do mapa de vendas: "todos os anuncios de um dia/mes"
-- e "historico de um anuncio". Cobrem os dois sem depender de full scan.
create index listing_daily_snapshot_company_date_idx
  on public.listing_daily_snapshot (company_id, snapshot_date desc);
create index listing_daily_snapshot_listing_date_idx
  on public.listing_daily_snapshot (listing_id, snapshot_date desc);

create trigger listing_daily_snapshot_set_updated_at before update on public.listing_daily_snapshot
  for each row execute function public.set_updated_at();

alter table public.listing_daily_snapshot enable row level security;

drop policy if exists "listing_daily_snapshot_by_membership" on public.listing_daily_snapshot;
create policy "listing_daily_snapshot_by_membership" on public.listing_daily_snapshot
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

grant select on public.listing_daily_snapshot to authenticated;

-- Rastreabilidade de execucoes de job (sync ML, agregacao diaria, etc).
-- Requisito nao-funcional do PRD: "sincronizacoes devem ser rastreaveis",
-- "falhas de ingestao devem gerar log", "reprocessamento precisa ser possivel".
create type public.job_run_status as enum ('running', 'completed', 'failed');

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade, -- null = job global (varias empresas)
  job_name text not null, -- 'ml.sync.account' | 'listing_daily_snapshot.aggregate' | ...
  status public.job_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create index job_runs_company_job_idx on public.job_runs (company_id, job_name, started_at desc);
create index job_runs_status_idx on public.job_runs (status, started_at desc);

alter table public.job_runs enable row level security;

drop policy if exists "job_runs_by_membership" on public.job_runs;
create policy "job_runs_by_membership" on public.job_runs
for select using (company_id is null or public.is_company_member(company_id));

grant select on public.job_runs to authenticated;
