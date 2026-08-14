-- Fase 0: nucleo multiempresa (companies, users, company_users) + helpers de RLS.
-- Sem isso nenhuma outra tabela pode aplicar isolamento por empresa.

create extension if not exists "pgcrypto";

create type public.company_role as enum ('master', 'adm', 'agente');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Espelha auth.users (1:1). Populada automaticamente pelo trigger abaixo,
-- para eliminar o passo manual que o repo antigo exigia ("crie um usuario
-- em Supabase Auth, depois insira em users_profile manualmente").
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.company_role not null default 'agente',
  is_active boolean not null default true,
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_users_company_idx on public.company_users (company_id, is_active, role);
create index company_users_user_idx on public.company_users (user_id, is_active);

-- Trigger: toda vez que um usuario e criado no Supabase Auth, cria a linha
-- correspondente em public.users automaticamente (full_name/email vindos do
-- signup). Isso substitui o passo manual documentado no README antigo.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Utilitario generico para manter updated_at correto sem depender de cada
-- service.ts lembrar de setar o campo manualmente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger company_users_set_updated_at before update on public.company_users
  for each row execute function public.set_updated_at();

-- Helper central de isolamento por empresa. Baseado em auth.uid() (nunca em
-- header/claim client-controlavel), reutilizado por todas as policies de
-- todas as tabelas das proximas migrations.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users
    where company_id = target_company_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.company_role_for(target_company_id uuid)
returns public.company_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.company_users
  where company_id = target_company_id
    and user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.company_users enable row level security;

drop policy if exists "companies_by_membership" on public.companies;
create policy "companies_by_membership" on public.companies
for all using (public.is_company_member(id))
with check (public.is_company_member(id));

drop policy if exists "users_self_or_same_company" on public.users;
create policy "users_self_or_same_company" on public.users
for select using (
  id = auth.uid()
  or exists (
    select 1 from public.company_users mine
    join public.company_users theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.is_active = true
      and theirs.user_id = public.users.id and theirs.is_active = true
  )
);
create policy "users_update_self" on public.users
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "company_users_by_membership" on public.company_users;
create policy "company_users_by_membership" on public.company_users
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

-- Nota: a API sempre acessa o Supabase com a service role key (bypassa RLS)
-- e e ela quem aplica a regra de negocio (master/adm/agente por endpoint).
-- RLS aqui e defesa em profundidade para qualquer acesso direto autenticado
-- (ex.: uma chamada futura do frontend direto ao Supabase).
grant select, insert, update on public.companies to authenticated;
grant select, update on public.users to authenticated;
grant select on public.company_users to authenticated;
