-- Fase 5: tarefas (activities).
--
-- O repo antigo tinha DOIS sistemas de tarefas paralelos: `tasks` +
-- `task_comments` (schema v1, sem uso real no frontend) e `activities` +
-- `activity_comments` + `activity_history` (schema v2, e o que a tela
-- /atividades de fato usava). Aqui existe um so: `tasks`, com comentarios e
-- historico de auditoria (quem mudou o que, quando).

create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'critical');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  due_date date,
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  related_listing_id uuid references public.listings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_company_status_idx on public.tasks (company_id, status, priority, due_date);
create index tasks_assigned_idx on public.tasks (assigned_to, status);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id, created_at desc);

create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null, -- 'created' | 'status_changed' | 'reassigned' | ...
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index task_history_task_idx on public.task_history (task_id, created_at desc);

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_history enable row level security;

drop policy if exists "tasks_by_membership" on public.tasks;
create policy "tasks_by_membership" on public.tasks
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "task_comments_by_membership" on public.task_comments;
create policy "task_comments_by_membership" on public.task_comments
for all using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "task_history_by_membership" on public.task_history;
create policy "task_history_by_membership" on public.task_history
for select using (public.is_company_member(company_id));

grant select on public.tasks to authenticated;
grant select on public.task_comments to authenticated;
grant select on public.task_history to authenticated;
