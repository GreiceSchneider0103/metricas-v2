-- Reset do schema antigo (v1) do projeto Supabase "Metricas" antes de aplicar
-- o schema novo (v2). Autorizado explicitamente pelo dono do projeto: perda
-- de dados aceita para reconstruir do zero (as 4 contas ML conectadas
-- precisaram reconectar via OAuth depois disso).
--
-- Documentado aqui para auditoria/reproducibilidade. Usa "if exists", entao
-- e inofensivo rodar num projeto Supabase novo (sem essas tabelas antigas).

drop table if exists public.sales_map_entries_mismatch_backup_20260616 cascade;
drop table if exists public.sales_map_entries_backup_wrong_store_20260715 cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.sales_map_entries cascade;
drop table if exists public.daily_panel_metrics cascade;
drop table if exists public.full_stock_items cascade;
drop table if exists public.full_stock_reports cascade;
drop table if exists public.shipping_analysis_entries cascade;
drop table if exists public.product_store_links cascade;
drop table if exists public.products cascade;
drop table if exists public.stores cascade;
drop table if exists public.activity_history cascade;
drop table if exists public.activity_comments cascade;
drop table if exists public.activities cascade;
drop table if exists public.task_comments cascade;
drop table if exists public.tasks cascade;
drop table if exists public.goals cascade;
drop table if exists public.strategies cascade;
drop table if exists public.alert_events cascade;
drop table if exists public.alert_rules cascade;
drop table if exists public.competitor_listings cascade;
drop table if exists public.keyword_rankings cascade;
drop table if exists public.keyword_scans cascade;
drop table if exists public.keywords cascade;
drop table if exists public.listing_scores cascade;
drop table if exists public.listing_snapshots cascade;
drop table if exists public.dashboard_cache cascade;
drop table if exists public.job_runs cascade;
drop table if exists public.ml_account_daily_metrics cascade;
drop table if exists public.ml_oauth_apps cascade;
drop table if exists public.listings cascade;
drop table if exists public.ml_accounts cascade;
drop table if exists public.memberships cascade;
drop table if exists public.users_profile cascade;
drop table if exists public.tenants cascade;

drop function if exists public.current_tenant_id() cascade;

drop type if exists public.app_role cascade;
drop type if exists public.task_status cascade;
drop type if exists public.alert_severity cascade;
drop type if exists public.activity_status cascade;
drop type if exists public.activity_priority cascade;
