# Modelo de dominio

## Entidades

- `companies` — empresa cliente (era `tenants` no repo antigo).
- `users` — usuario autenticado, espelha `auth.users` 1:1 (era `users_profile`).
- `company_users` — vinculo usuario/empresa + papel (era `memberships`).
  `role`: `master | adm | agente`.
- `ml_accounts` — conta Mercado Livre conectada (multi-conta por empresa).
- `listings` — anuncio monitorado. Flags de filtro (curva ABC, modalidade,
  logistica, catalogo, ads, promocao) sao colunas reais, nao chaves soltas
  dentro de `attributes` jsonb como no repo antigo.
- `listing_daily_snapshot` — 1 linha por anuncio/dia, pre-agregada. Fonte
  unica de leitura do mapa de vendas. Substitui `listing_snapshots` do repo
  antigo (que existia com o grao certo mas nao era tratada como fonte de
  verdade — o endpoint recalculava tudo por cima dela).
- `orders` / `order_items` — pedidos sincronizados. `order_items.listing_id`
  e resolvido na ingestao, nao a cada leitura.
- `job_runs` — rastreabilidade de execucoes (sync ML, agregacao diaria).
- `tasks` / `task_comments` / `task_history` — tarefas operacionais. Unifica
  os dois sistemas paralelos do repo antigo (`tasks` vs `activities`).
- `goals` — metas por empresa ou por anuncio.
- `alerts` — regra + ocorrencia fundidas numa tabela so (repo antigo tinha
  `alert_rules` + `alert_events` separados, sem necessidade no volume atual).
- `notifications` — nao existia no schema antigo.

## Regras relevantes

- Todo registro de negocio carrega `company_id`; isolamento via RLS
  (`is_company_member`) + autorizacao aplicada na API.
- `master`: dono/criador da empresa, unico papel que pode gerenciar outros
  `adm` e (no futuro) billing/exclusao da empresa. Todo `master` tambem tem
  as permissoes de `adm`. Criado automaticamente ao criar a empresa.
- `adm`: gerencia integracoes, usuarios `agente`, metas, alertas, estrategias.
- `agente`: opera tarefas atribuidas, visualiza dashboards autorizados.
- `listing_daily_snapshot` e append-only por dia (upsert por
  `company_id + listing_id + snapshot_date`) — nunca reescreve dias
  anteriores fora do fluxo de reprocessamento explicito.

## Descartado do repo antigo (ver diagnostico completo na conversa)

- `strategies`, `goals` (v1) — DDL sem nenhuma implementacao.
- `stores`, `products`, `product_store_links`, `daily_panel_metrics`,
  `sales_map_entries`, `full_stock_reports`, `full_stock_items`,
  `shipping_analysis_entries` — camada "operacional" duplicando
  `ml_accounts`/`listings` com outro nome.
- Motor de score em Python (`analytics/`) — terceiro runtime, fora do
  orcamento free-tier limpo, fora da ordem de prioridade atual.
