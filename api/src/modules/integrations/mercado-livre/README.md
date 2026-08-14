# integrations/mercado-livre

Fase 1 — prioridade maxima.
Porta mercado-livre-service.ts do repo antigo (OAuth authorize/callback/refresh, sync de listings/orders).
Reaproveitar: fluxo de state assinado (HMAC), refresh token com buffer de expiracao,
distincao entre erro definitivo (invalid_grant) vs transitorio (429/5xx).
Novo: nao escreve mais listing_snapshots direto daqui -- so listings/orders/order_items.
Quem gera listing_daily_snapshot e o job da fase 2, nao o service de integracao.
