-- Controle de acesso por aba, independente do papel (master/adm/agente).
-- Vive em company_users porque e por membership: a mesma pessoa pode ter
-- abas diferentes liberadas em empresas diferentes. Default = todas as abas,
-- pra nao trancar ninguem que ja existia antes desta coluna existir.
alter table public.company_users
  add column allowed_tabs text[] not null default array['mapa_vendas','atividades','alertas','configuracoes'];
