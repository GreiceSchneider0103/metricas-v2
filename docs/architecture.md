# Arquitetura

## Stack

- **Frontend (`web/`)**: Next.js 14 + TypeScript, deploy na **Vercel**.
- **Backend (`api/`)**: Node 20 + Fastify + Zod, deploy no **Render**.
- **Banco**: Supabase (Postgres), mesmo projeto ja existente hoje (reaproveitado,
  schema recriado do zero — ver `supabase/migrations/`).
- **Jobs**: rodam dentro da propria API (`JOB_EXECUTION_MODE=direct`), disparados
  por cron (Render cron job ou Supabase `pg_cron` — decidir na fase 2, nao GitHub
  Actions como no repo antigo). Sem Redis/BullMQ no MVP — so entra se algum job
  precisar de fila de verdade, o que nao e o caso na escala atual.

## Regra de ouro do mapa de vendas

`listing_daily_snapshot` e a UNICA fonte de leitura do dashboard. O endpoint de
`sales-map` nunca faz join com `orders`/`order_items` em tempo de request — quem
faz esse join e o job de agregacao diaria, uma vez por dia, por anuncio.
Isso e a correcao direta do problema de performance diagnosticado no repo antigo
(`getSalesMap()` recalculava tudo em memoria a cada carregamento de tela).

## Fluxo de dados

1. `api/src/modules/integrations/mercado-livre` — OAuth + sync de `listings` e
   `orders`/`order_items` a partir da API do Mercado Livre.
2. `api/src/jobs/listing-daily-snapshot-aggregate.ts` — le `listings` +
   `orders` + `order_items` do dia e grava 1 linha por anuncio/dia em
   `listing_daily_snapshot`, ja com metricas derivadas calculadas
   (conversao, ticket medio).
3. `api/src/modules/sales-map` — le exclusivamente de `listing_daily_snapshot`.
4. `web/app/(dashboard)/mapa-vendas` — consome o endpoint acima.

## Isolamento multiempresa

RLS habilitado em todas as tabelas de negocio, via `public.is_company_member(company_id)`
(baseado em `auth.uid()`, nunca em header client-controlavel). A API acessa o
Supabase com a service role key (bypassa RLS) e e ela a autoridade real de
autorizacao — RLS e defesa em profundidade, nao a unica camada.

## Ordem de construcao

Ver raiz do repo / conversa de diagnostico: (1) integracao ML, (2) job de
agregacao, (3) mapa de vendas, (4) usuarios/permissoes, (5) tarefas, (6)
metas/alertas/notificacoes. Cada fase tem sua propria migration numerada em
`supabase/migrations/`.
