import type { PostgrestSingleResponse } from "@supabase/supabase-js";

type Awaitable<T> = T | PromiseLike<T>;

export function unwrap<T>(result: PostgrestSingleResponse<T> | { data: T; error: null }) {
  if ("error" in result && result.error) {
    throw new Error(result.error.message);
  }
  return result.data;
}

// PostgREST/Supabase limita a ~1000 linhas por resposta mesmo com .range() --
// paginar aqui evita parar cedo silenciosamente em tabelas grandes.
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Awaitable<PostgrestSingleResponse<T[]>>,
  pageSize = 1000
) {
  const items: T[] = [];
  let from = 0;

  while (true) {
    const page = unwrap(await fetchPage(from, from + pageSize - 1));
    if (!page?.length) break;
    items.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return items;
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
