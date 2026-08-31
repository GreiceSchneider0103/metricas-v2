-- A tabela listing_daily_snapshot (criada pela migration 0004) sumiu da
-- producao em algum momento entre 14/08 e 24/08 -- o historico de migrations
-- do Supabase mostra 0004 como aplicada, mas a tabela nao existe mais.
-- Nesse meio-tempo rodaram migrations "restore_*" fora deste repo (aplicadas
-- direto via MCP), que reintroduziram uma tabela antiga e incompativel
-- chamada listing_snapshots (colunas orders/promotion_active em vez de
-- orders_count/is_promotion_active) -- provavelmente de outro app que
-- compartilha este mesmo projeto Supabase. Essa tabela antiga nao e tocada
-- aqui; so recriamos a tabela que o codigo desta app (mapa de vendas, job de
-- agregacao fase 2) sempre esperou.
--
-- Nunca foi percebido antes porque, com 0 listings sincronizados, o codigo
-- de leitura tinha um early-return que nunca chegava a consultar essa
-- tabela.

create table if not exists public.listing_daily_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  snapshot_date date not null,

  visits integer not null default 0,
  orders_count integer not null default 0,
  units_sold integer not null default 0,
  revenue numeric(14, 2) not null default 0,

  price numeric(12, 2),
  effective_price numeric(12, 2),
  stock integer,

  listing_status text,
  is_promotion_active boolean not null default false,
  has_ads boolean not null default false,

  conversion_rate numeric(7, 4),
  avg_ticket numeric(12, 2),

  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, listing_id, snapshot_date)
);

create index if not exists listing_daily_snapshot_company_date_idx
  on public.listing_daily_snapshot (company_id, snapshot_date desc);
create index if not exists listing_daily_snapshot_listing_date_idx
  on public.listing_daily_snapshot (listing_id, snapshot_date desc);

drop trigger if exists listing_daily_snapshot_set_updated_at on public.listing_daily_snapshot;
create trigger listing_daily_snapshot_set_updated_at before update on public.listing_daily_snapshot
  for each row execute function public.set_updated_at();

alter table public.listing_daily_snapshot enable row level security;

drop policy if exists "listing_daily_snapshot_by_membership" on public.listing_daily_snapshot;
create policy "listing_daily_snapshot_by_membership" on public.listing_daily_snapshot
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

grant select on public.listing_daily_snapshot to authenticated;
