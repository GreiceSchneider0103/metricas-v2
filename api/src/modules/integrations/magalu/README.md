# integrations/magalu

Espelha o modulo mercado-livre/ (OAuth authorize/callback/refresh, sync de produtos/orders).
Mesmo padrao de state assinado (HMAC), refresh token com buffer de expiracao,
distincao entre erro definitivo (invalid_grant/invalid_token) vs transitorio (429/5xx).

## Diferencas do ML

- Client OAuth criado via CLI (IDM), nao um formulario web -- ver "Setup pendente" abaixo.
- Preco e estoque nao vem junto da listagem de SKUs -- sao 2 chamadas extras por SKU
  (`/seller/v1/portfolios/prices/:sku` e `/seller/v1/portfolios/stocks/:sku`).
- Pedidos tem estrutura aninhada (orders -> deliveries -> items), diferente do ML (orders -> order_items direto).
- "Full" (fulfillment) e um booleano simples por SKU (`fulfillment: true/false`), sem quantidade separada.
- closed_at (data usada pra bucket de receita no snapshot diario) = `approved_at` do pedido
  (decisao explicita do usuario -- a API nao permite filtrar por approved_at, so por purchased_at/updated_at).

## Setup (feito manualmente, 04/09/2026)

Client OAuth ja existe em producao. Passos usados (documentado aqui pra caso precise
recriar ou criar um segundo client):

1. Instalar o IDM CLI (https://developers.magalu.com/docs/first-steps/create-an-application/create-application)
2. `./idm login`
3. `./idm client create --name "Go Metriks" --description "<descricao curta -- campo obrigatorio, apesar de nao vir marcado como tal no --help>" --redirect-uris "https://metricas-v2-api.onrender.com/api/v1/integrations/magalu/callback" --scopes "open:portfolio:read open:portfolio-skus-seller:read open:portfolio-prices-seller:read open:portfolio-stocks-seller:read open:order-order-seller:read" --scopes-default "open:portfolio:read open:portfolio-skus-seller:read open:portfolio-prices-seller:read open:portfolio-stocks-seller:read open:order-order-seller:read" --reason "<justificativa -- tambem obrigatorio pros escopos open:* aprovarem sem intervencao manual>" --audience "public" --terms-of-use "<url>" --privacy-term "<url>" --access-token-exp 7200 --always-require-login false`
4. Guardar `client_id`/`client_secret` (secret so aparece uma vez).
5. Configurar no Render: `MAGALU_CLIENT_ID`, `MAGALU_CLIENT_SECRET`, `MAGALU_REDIRECT_URI` (a mesma URL do `--redirect-uris` acima).

Se algum escopo ficar de fora na criacao (aconteceu com `open:portfolio:read`, usado por
`GET /seller/v1/portfolios/me` em `fetchSellerProfile` -- sem ele o callback falha com
401 "Unauthorized" nessa chamada especifica, mesmo com o token exchange OK), adicionar
depois com `./idm client add-scope --client-uuid "<uuid>" --scopes "<escopo>" --scopes-default "<escopo>" --reason "<motivo>"`
(`--client-uuid` vem de `./idm client list`).

Ate isso existir/estar completo, `/integrations/magalu/authorize` responde 503
(`isMagaluConfigured()` em oauth.ts) -- a API nao quebra, so essa rota fica indisponivel.
