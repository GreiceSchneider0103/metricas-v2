import { config } from "../../../config.js";
import { mlGetWithRetry } from "./client.js";

type MercadoLivreVisitsWindow = {
  results?: Array<{ date?: string | null; total?: number | null }> | null;
};

function daysBetweenInclusive(from: string, to: string) {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((toMs - fromMs) / 86_400_000) + 1);
}

// So aceita 1 item por chamada -- o endpoint "multiget" (ids=A,B,C) que a
// documentacao do ML sugere devolve "maximum amount of items to query is 1"
// nessa conta (confirmado via log em producao). O app antigo ja tinha essa
// mesma descoberta -- por isso o multiget la vinha desligado por padrao,
// usando so o caminho por item. Em compensacao aceita varios dias numa unica
// chamada (parametro "last"), entao busca o intervalo inteiro de uma vez por
// item em vez de um dia de cada vez -- essencial pra carga retroativa de um
// mes nao virar milhares de requisicoes.
export async function fetchVisitsForItem(accessToken: string, externalId: string, from: string, to: string) {
  const last = daysBetweenInclusive(from, to);
  try {
    const response = await mlGetWithRetry<MercadoLivreVisitsWindow>(
      config.MERCADO_LIVRE_API_BASE_URL,
      accessToken,
      `/items/${externalId}/visits/time_window?last=${last}&unit=day&ending=${to}`
    );
    const byDate = new Map<string, number>();
    for (const entry of response.results ?? []) {
      if (entry.date && typeof entry.total === "number") byDate.set(entry.date, entry.total);
    }
    return byDate;
  } catch (error) {
    console.warn("[ml-visits-sync] falha ao buscar visitas do item", {
      externalId,
      from,
      to,
      error: error instanceof Error ? error.message : String(error)
    });
    return new Map<string, number>();
  }
}

// Busca visitas de varios itens em paralelo -- o limitador de concorrencia
// global do client.ts (MAX_CONCURRENT_REQUESTS=15, ver fetchWithTimeout) ja
// trava as requisicoes simultaneas pra API do ML, entao nao precisa de outro
// throttling manual aqui.
export async function fetchVisitsForItems(accessToken: string, externalIds: string[], from: string, to: string) {
  const entries = await Promise.all(
    externalIds.map(async (externalId) => [externalId, await fetchVisitsForItem(accessToken, externalId, from, to)] as const)
  );
  return new Map(entries);
}
