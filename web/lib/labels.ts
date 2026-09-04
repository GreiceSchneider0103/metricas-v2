export const LISTING_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  closed: "Fechado",
  under_review: "Em revisão"
};

export const LISTING_TYPE_LABELS: Record<string, string> = {
  classic: "Clássico",
  premium: "Premium"
};

export const ALERT_CODE_LABELS: Record<string, string> = {
  no_sales_7d: "Sem vendas há 7 dias",
  price_drop: "Queda de preço",
  stock_low: "Estoque baixo",
  account_sync_stale: "Sincronização parada"
};

// Titulos de anuncio do Mercado Livre costumam ter 10+ palavras -- em tabelas
// densas (mapa de vendas) isso quebra a linha e some com o alinhamento. O
// titulo completo continua acessivel via atributo title (tooltip nativo) e
// no drawer de detalhe.
export function truncateWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}…`;
}
