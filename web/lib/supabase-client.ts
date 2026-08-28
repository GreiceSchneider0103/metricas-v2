import { createClient } from "@supabase/supabase-js";

const FALLBACK_URL = "https://missing-env.supabase.co";
const FALLBACK_KEY = "missing-env";

// Fallback evita que o build quebre inteiro (todas as paginas, nao so a que
// usa auth) se as env vars ainda nao estiverem configuradas -- nesse caso o
// app sobe e so as chamadas de auth falham em runtime, o que e bem mais
// facil de diagnosticar do que um build failure sem stack trace util.
//
// `createClient` lanca excecao se a URL nao for http(s) valida -- isso ja
// derrubou o build estatico na Vercel quando a env var estava setada com um
// valor mal formatado (espaco/quebra de linha colada, faltando o https://,
// etc). Validamos explicitamente em vez de confiar em `valor || fallback`,
// que so cobre o caso de env var ausente, nao o de env var presente porem
// invalida.
function resolveSupabaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return FALLBACK_URL;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return FALLBACK_URL;
  }
}

const supabaseUrl = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || FALLBACK_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
