export const LISTING_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  closed: "Fechado",
  under_review: "Em revisão"
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
