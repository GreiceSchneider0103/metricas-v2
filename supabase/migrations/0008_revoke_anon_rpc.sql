-- is_company_member/company_role_for precisam continuar executaveis por
-- "authenticated" (RLS depende disso), mas nao ha motivo para o role "anon"
-- (nao autenticado) conseguir chama-las via RPC publico.
revoke execute on function public.is_company_member(uuid) from anon;
revoke execute on function public.company_role_for(uuid) from anon;
