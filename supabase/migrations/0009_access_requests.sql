-- Fluxo de auto-cadastro com aprovacao: um usuario cria a propria conta
-- (Supabase Auth) e pede acesso a uma empresa ja existente, escolhendo-a por
-- nome na tela de cadastro. Master/adm dessa empresa ve o pedido em
-- "Equipe" e aprova (escolhendo o papel, que ja governa toda a
-- funcionalidade liberada no app) ou rejeita. So na aprovacao nasce a linha
-- em company_users -- ate la o usuario nao tem acesso a nenhum dado da
-- empresa (nem RLS nem a API liberam nada sem company_users).
--
-- Nao mexe no fluxo existente de "criar propria empresa" (companies/service.ts,
-- usado quando o usuario ainda nao pertence a nenhuma empresa) -- os dois
-- convivem: criar empresa nova segue igual, pedir acesso a uma empresa
-- existente e o caminho novo.

create type public.access_request_status as enum ('pending', 'approved', 'rejected');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status public.access_request_status not null default 'pending',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Um pedido pendente por par usuario/empresa -- reenviar so e possivel apos
-- o anterior ser aprovado ou rejeitado (o unique index so olha "pending").
create unique index access_requests_pending_unique
  on public.access_requests (user_id, company_id)
  where status = 'pending';

create index access_requests_company_status_idx
  on public.access_requests (company_id, status, created_at desc);

alter table public.access_requests enable row level security;

-- Dono do pedido sempre pode ver o proprio; membro (master/adm, checado na
-- API) da empresa alvo pode ver/gerenciar os pedidos dela. RLS aqui e
-- defesa em profundidade -- quem decide de fato e a API com service role,
-- igual ao resto do sistema.
drop policy if exists "access_requests_owner_or_company_member" on public.access_requests;
create policy "access_requests_owner_or_company_member" on public.access_requests
for select using (user_id = auth.uid() or public.is_company_member(company_id));

drop policy if exists "access_requests_owner_insert" on public.access_requests;
create policy "access_requests_owner_insert" on public.access_requests
for insert with check (user_id = auth.uid());

grant select, insert on public.access_requests to authenticated;
