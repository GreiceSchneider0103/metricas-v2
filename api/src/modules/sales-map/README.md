# sales-map

Fase 3. Endpoint SO LE de listing_daily_snapshot (com filtros: mes, curva ABC, modalidade,
logistica, catalogo, status, busca). PROIBIDO fazer join com orders/order_items aqui --
se uma metrica nao esta pre-calculada no snapshot, ela entra no job de agregacao (fase 2),
nunca e calculada on-the-fly no endpoint. Essa regra e o motivo desta reescrita.
