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

## Setup pendente (manual, feito por um humano)

Client OAuth ainda nao existe. Passos:

1. Instalar o IDM CLI (https://developers.magalu.com/docs/first-steps/create-an-application/create-application)
2. `./idm login`
3. `./idm client create --name "Go Metriks" --redirect-uris "https://metricas-v2-api.onrender.com/api/v1/integrations/magalu/callback" --scopes "open:portfolio-skus-seller:read open:portfolio-prices-seller:read open:portfolio-stocks-seller:read open:order-order-seller:read" --scopes-default "open:portfolio-skus-seller:read open:portfolio-prices-seller:read open:portfolio-stocks-seller:read open:order-order-seller:read" --terms-of-use "<url>" --privacy-term "<url>" --access-token-exp 7200 --always-require-login false`
4. Guardar `client_id`/`client_secret` (secret so aparece uma vez).
5. Configurar no Render: `MAGALU_CLIENT_ID`, `MAGALU_CLIENT_SECRET`, `MAGALU_REDIRECT_URI` (a mesma URL do `--redirect-uris` acima).

Ate isso existir, `/integrations/magalu/authorize` responde 503 (`isMagaluConfigured()` em oauth.ts) --
a API nao quebra, so essa rota fica indisponivel.
