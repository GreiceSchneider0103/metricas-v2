-- Fixes apontados pelo advisor de seguranca logo apos aplicar 0001-0006:
--   1. set_updated_at() sem search_path fixo (mutavel).
--   2. handle_new_auth_user() e uma trigger function, nao deveria ser
--      chamavel via RPC publico (/rest/v1/rpc/handle_new_auth_user).
--   3. Funcoes orfas do schema antigo (v1), que o reset original nao
--      cobriu porque nao apareciam em list_tables (sao so funcoes soltas,
--      sem tabela associada) -- referenciavam tabelas que ja foram
--      dropadas, entao ja estavam inutilizaveis, so nao removidas.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from anon, authenticated, public;

drop function if exists public.trigger_metricas_job(text, uuid, uuid, uuid, uuid) cascade;
drop function if exists public.validate_order_item_relationships() cascade;
drop function if exists public.handle_new_user_profile() cascade;
drop function if exists public.get_operational_options_filters(uuid) cascade;
