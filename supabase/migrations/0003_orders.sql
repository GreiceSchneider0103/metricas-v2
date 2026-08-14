-- Fase 1 (continuacao): orders + order_items sincronizados do Mercado Livre.
-- Junto com listings (migration anterior), e a fonte bruta que o job de
-- agregacao da proxima migration consome para popular listing_daily_snapshot.
--
-- Mudanca importante vs. o repo antigo: order_items.listing_id e resolvido
-- e persistido no momento da ingestao (join feito uma vez, pelo job), em vez
-- de recalculado a cada leitura via alias matching (MLB123 vs 123 vs #123)
-- como fazia listingByExternalAlias em operations/service.ts.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts(id) on delete cascade,
  external_id text not null,
  status text not null,
  total_amount numeric(12, 2) not null default 0,
  closed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, external_id)
);

create index orders_company_closed_idx on public.orders (company_id, closed_at);
create index orders_company_account_idx on public.orders (company_id, ml_account_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null, -- resolvido na ingestao
  item_external_id text not null,
  quantity integer not null default 1,
  unit_price numeric(12, 2),
  gross_amount numeric(12, 2) not null default 0,
  net_amount numeric(12, 2) not null default 0,
  refunded_amount numeric(12, 2) not null default 0,
  seller_sku text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_items_company_order_idx on public.order_items (company_id, order_id);
create index order_items_listing_idx on public.order_items (listing_id) where listing_id is not null;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "orders_by_membership" on public.orders;
create policy "orders_by_membership" on public.orders
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "order_items_by_membership" on public.order_items;
create policy "order_items_by_membership" on public.order_items
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
