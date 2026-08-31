-- Preco praticado de fato (com desconto de promocao ativa aplicado), vindo
-- da API de seller-promotions do Mercado Livre. `listings.price` continua
-- sendo o preco "de tabela" do item; `effective_price` e o que o comprador
-- realmente paga quando ha promocao ativa (mesmo valor quando nao ha).
--
-- Antes disso, listing_daily_snapshot.price sempre guardava o preco cheio
-- (listings.price), mesmo em anuncios com promocao ativa -- o mapa de vendas
-- e as flechinhas de variacao de preco nunca refletiam desconto nenhum.
alter table public.listings add column effective_price numeric(12, 2);
