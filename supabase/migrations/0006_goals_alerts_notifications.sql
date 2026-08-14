-- Fase 6: metas, alertas e notificacoes.
--
-- `goals` e `strategies` existiam no schema antigo mas nunca tiveram
-- nenhuma linha de codigo em api/src usando -- eram DDL morto. Aqui goals
-- comeca do zero, com implementacao real na mesma fase.
-- `alert_rules` + `alert_events` do repo antigo viram uma unica tabela
-- `alerts` (regra e ocorrencia fundidas) -- mais simples para o volume do
-- MVP; se no futuro precisar de regras configuraveis reutilizaveis entre
-- alertas, separa de novo.
-- `notifications` nao existia em lugar nenhum do banco antigo -- e nova.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  metric_code text not null, -- 'revenue' | 'units_sold' | 'orders_count' | 'visits' | ...
  target_value numeric(14, 2) not null,
  period_start date not null,
  period_end date not null,
  listing_id uuid references public.listings(id) on delete cascade, -- null = meta da empresa inteira
  owner_id uuid references public.users(id) on delete set null,
  status text not null default 'active', -- active | achieved | missed | cancelled
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_company_period_idx on public.goals (company_id, period_start, period_end, status);

alter table public.tasks
  add column related_goal_id uuid references public.goals(id) on delete set null;

create type public.alert_severity as enum ('low', 'medium', 'high', 'critical');

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  code text not null, -- 'no_sales_7d' | 'price_drop' | 'stock_low' | 'visits_drop' | ...
  severity public.alert_severity not null default 'medium',
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open', -- open | resolved | muted
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index alerts_company_status_idx on public.alerts (company_id, status, severity, created_at desc);
create index alerts_listing_idx on public.alerts (listing_id) where listing_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null, -- 'alert' | 'task_assigned' | 'goal_at_risk' | ...
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);

create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
alter table public.alerts enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "goals_by_membership" on public.goals;
create policy "goals_by_membership" on public.goals
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "alerts_by_membership" on public.alerts;
create policy "alerts_by_membership" on public.alerts
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "notifications_self_only" on public.notifications;
create policy "notifications_self_only" on public.notifications
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select on public.goals to authenticated;
grant select on public.alerts to authenticated;
grant select, update on public.notifications to authenticated;
