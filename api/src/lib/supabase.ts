import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// Service role key: bypassa RLS de proposito. A API e a autoridade real de
// autorizacao (ver plugins/auth.ts); RLS no banco e defesa em profundidade,
// nao a camada primaria aqui.
export const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
