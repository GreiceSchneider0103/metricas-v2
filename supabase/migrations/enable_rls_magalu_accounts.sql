-- magalu_accounts foi criada na migration magalu_channel_support sem RLS
-- habilitado (unico caso no schema inteiro) -- como a chave anon do Supabase
-- e publica por definicao, isso expunha access_token/refresh_token da Magalu
-- de TODAS as empresas via API REST do Supabase pra qualquer pessoa sem
-- login. Espelha exatamente a policy de ml_accounts.
alter table public.magalu_accounts enable row level security;

create policy magalu_accounts_by_membership on public.magalu_accounts
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));
