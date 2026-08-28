import { createClient } from "@supabase/supabase-js";

// Fallback so evita que o build quebre inteiro (todas as paginas, nao so a
// que usa auth) se as env vars ainda nao estiverem configuradas na Vercel --
// nesse caso o app sobe e so as chamadas de auth falham em runtime, o que e
// bem mais facil de diagnosticar do que um build failure sem stack trace util.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://missing-env.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-env";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
