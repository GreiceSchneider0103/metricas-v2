-- Master de plataforma: um flag global em public.users, independente de
-- qualquer company_users. Quem tem is_platform_admin = true decide TODOS os
-- pedidos de acesso pendentes (de qualquer empresa) e escolhe em qual
-- empresa cada usuario entra -- nao fica limitado as empresas onde ja e
-- membro. Isso e diferente do role master/adm/agente por empresa
-- (company_users.role), que continua existindo e controlando o que cada
-- pessoa pode fazer dentro de UMA empresa.
--
-- Junto, uma empresa e marcada como "onboarding": e para onde todo cadastro
-- novo e automaticamente direcionado (sem escolher/criar empresa na tela de
-- cadastro), ate o master de plataforma revisar e mandar a pessoa pra
-- empresa certa.

alter table public.users
  add column is_platform_admin boolean not null default false;

alter table public.companies
  add column is_onboarding boolean not null default false;

-- No maximo uma empresa "onboarding" por vez.
create unique index companies_single_onboarding_idx
  on public.companies (is_onboarding)
  where is_onboarding;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_platform_admin from public.users where id = auth.uid()), false);
$$;

-- Master de plataforma ve pedidos de acesso de qualquer empresa (defesa em
-- profundidade -- quem decide de fato e a API com service role).
drop policy if exists "access_requests_owner_or_company_member" on public.access_requests;
create policy "access_requests_owner_or_company_member" on public.access_requests
for select using (user_id = auth.uid() or public.is_company_member(company_id) or public.is_platform_admin());
