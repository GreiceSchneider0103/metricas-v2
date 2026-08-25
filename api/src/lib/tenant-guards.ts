import { unwrap } from "./db.js";
import { supabaseAdmin } from "./supabase.js";

// users/listings sao tabelas globais -- a FK do Postgres garante que um id
// existe, mas nao que pertence a UMA empresa especifica. Esses guards fecham
// essa lacuna sempre que o dado vem de input do cliente (atribuir uma
// tarefa/meta a alguem, vincular a um anuncio). Usado por mais de um modulo
// (tasks, goals) -- por isso vive aqui e nao duplicado em cada service.ts.
export async function assertUserBelongsToCompany(companyId: string, userId: string) {
  const membership = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle()
  );
  if (!membership) {
    throw new Error("Usuario informado nao pertence a esta empresa");
  }
}

export async function assertListingBelongsToCompany(companyId: string, listingId: string) {
  const listing = unwrap(
    await supabaseAdmin.from("listings").select("id").eq("company_id", companyId).eq("id", listingId).maybeSingle()
  );
  if (!listing) {
    throw new Error("Anuncio informado nao pertence a esta empresa");
  }
}
