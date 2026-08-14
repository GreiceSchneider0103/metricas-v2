-- Fase 1: integracao Mercado Livre (contas conectadas + anuncios).
-- Reaproveita o desenho de ml_accounts/listings do repo antigo quase 1:1 --
-- essa parte do schema nao era o problema. Principais mudancas:
--   - tenant_id -> company_id (rename para bater com o novo modelo)
--   - flags que antes viviam soltas dentro de "attributes" jsonb (listing
--     type, logistica, catalogo, ads, promocao) viraram colunas reais,
--     porque o mapa de vendas filtra por elas diretamente (ver filtros da
--     UI: Curva ABC, Modalidade, Logistica, Catalogo, Status do anuncio).
--     Isso elimina os helpers readAttributeString/readAttributeBoolean
--     espalhados pelo operations/service.ts antigo.

create table public.ml_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  seller_id text not null,
  nickname text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'connected', -- connected | syncing | sync_failed | disconnected
  advertiser_id text,
  connected_by uuid references public.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, seller_id)
);

create index ml_accounts_company_idx on public.ml_accounts (company_id, status);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts(id) on delete cascade,
  external_id text not null, -- MLB...
  title text not null,
  category_id text,
  category_name text,
  status text not null, -- active | paused | closed | under_review
  condition text,
  price numeric(12, 2) not null default 0,
  available_quantity integer not null default 0,
  permalink text,
  listing_type text, -- classic | premium
  logistic_type text, -- fulfillment | cross_docking | drop_off | self_service | xd_drop_off
  is_catalog boolean not null default false,
  has_ads boolean not null default false,
  has_promotion boolean not null default false,
  abc_curve text check (abc_curve in ('A', 'B', 'C')),
  attributes jsonb not null default '{}'::jsonb, -- resto dos atributos crus do ML, sem valor de filtro direto
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, external_id)
);

create index listings_company_updated_idx on public.listings (company_id, updated_at desc);
create index listings_company_account_idx on public.listings (company_id, ml_account_id);
create index listings_company_status_idx on public.listings (company_id, status);

create trigger ml_accounts_set_updated_at before update on public.ml_accounts
  for each row execute function public.set_updated_at();
create trigger listings_set_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

alter table public.ml_accounts enable row level security;
alter table public.listings enable row level security;

drop policy if exists "ml_accounts_by_membership" on public.ml_accounts;
create policy "ml_accounts_by_membership" on public.ml_accounts
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "listings_by_membership" on public.listings;
create policy "listings_by_membership" on public.listings
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

grant select on public.ml_accounts to authenticated;
grant select on public.listings to authenticated;
