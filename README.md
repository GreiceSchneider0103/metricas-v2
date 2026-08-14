# Metricas v2

Reescrita do zero do SaaS "Metricas" — inteligencia comercial multiempresa para
vendedores do Mercado Livre. Ver diagnostico do repositorio anterior
(`GreiceSchneider0103/metricas`) para o raciocinio completo por tras de cada
decisao deste redesenho.

## Estrutura

- `web/` — frontend em Next.js (deploy: Vercel)
- `api/` — backend em Node/Fastify (deploy: Render)
- `supabase/migrations/` — schema Postgres, numerado por fase de construcao
- `docs/` — arquitetura e modelo de dominio

## Ordem de construcao

1. Integracao Mercado Livre (conexao de conta + sync de listings/orders, multi-conta)
2. Job de agregacao diaria -> `listing_daily_snapshot`
3. Mapa de vendas (lendo so do snapshot, nunca calculando on-the-fly)
4. Usuarios/permissoes (master/adm/agente, isolamento por empresa)
5. Tarefas (tasks)
6. Metas, alertas, notificacoes

Cada fase tem sua propria migration (`0001` a `0006`) e seu proprio modulo em
`api/src/modules/`. Nao pular etapas.

## Banco de dados

Reaproveita o mesmo projeto Supabase do repositorio anterior — schema recriado
do zero (ver `supabase/migrations/`). Reaproveita tambem o app OAuth do
Mercado Livre ja cadastrado (mesmo `MERCADO_LIVRE_CLIENT_ID`/`CLIENT_SECRET`
do `.env` antigo).

## Rodando local

```bash
npm --prefix api install
npm --prefix web install
cp api/.env.example api/.env   # preencher com as credenciais reais
npm run dev:api
npm run dev:web
```
