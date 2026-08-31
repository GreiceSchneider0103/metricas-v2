import { config } from "../../../config.js";
import { chunk } from "../../../lib/db.js";
import { mlGetWithRetry } from "./client.js";

const VISITS_BATCH_SIZE = 8;

type MercadoLivreVisitsMultiGetItem = {
  id?: string | null;
  item_id?: string | null;
  results?: Array<{ date?: string | null; total?: number | null }> | null;
};

// Endpoint multiget de visitas do ML -- 1 requisicao cobre ate ~8 itens
// (mesmo endpoint e tamanho de lote usados em producao no app antigo).
// Lotes sequenciais, nao paralelos: contas com 100+ anuncios batem em rate
// limit facilmente se todos os lotes saem juntos. Falha de UM lote (rede,
// item invalido, etc.) so deixa os itens desse lote sem visita nesse dia --
// nao derruba a sincronizacao dos demais.
export async function fetchVisitsForDate(accessToken: string, externalIds: string[], date: string) {
  const visitsByItem = new Map<string, number>();

  for (const batch of chunk(externalIds, VISITS_BATCH_SIZE)) {
    try {
      const response = await mlGetWithRetry<MercadoLivreVisitsMultiGetItem[]>(
        config.MERCADO_LIVRE_API_BASE_URL,
        accessToken,
        `/items/visits/time_window?ids=${batch.join(",")}&last=1&unit=day&ending=${date}`
      );
      for (const entry of response ?? []) {
        const itemId = entry.id ?? entry.item_id;
        if (!itemId) continue;
        const total = entry.results?.[0]?.total;
        if (typeof total === "number") visitsByItem.set(itemId, total);
      }
    } catch (error) {
      console.warn("[ml-visits-sync] falha ao buscar visitas do lote", {
        batchSize: batch.length,
        date,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return visitsByItem;
}
