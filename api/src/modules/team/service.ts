import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { CompanyRole } from "../../types.js";

type InvitableRole = Exclude<CompanyRole, "master">;

type CompanyUserRow = {
  id: string;
  user_id: string;
  role: CompanyRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

// Cria o usuario no Supabase Auth via convite por email (dispara o email de
// convite padrao do Supabase) se ele ainda nao existir. O trigger
// handle_new_auth_user (migration 0001) roda dentro da mesma insert e ja
// deixa a linha em public.users pronta antes desta funcao retornar.
async function findOrInviteAuthUser(email: string, fullName?: string) {
  const existing = unwrap(
    await supabaseAdmin.from("users").select("id").eq("email", email).maybeSingle()
  );
  if (existing) return existing.id;

  const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined
  });
  if (invited.error || !invited.data.user) {
    throw new Error(`Falha ao convidar usuario: ${invited.error?.message ?? "erro desconhecido"}`);
  }
  return invited.data.user.id;
}

// Convida (ou reativa) um membro da empresa. "master" nao e um papel
// convidavel -- e atribuido automaticamente a quem cria a empresa
// (companies/service.ts) e nao existe fluxo de promocao no MVP.
export async function inviteTeamMember(input: {
  companyId: string;
  invitedBy: string;
  email: string;
  role: InvitableRole;
  fullName?: string;
}) {
  const userId = await findOrInviteAuthUser(input.email, input.fullName);

  return unwrap(
    await supabaseAdmin
      .from("company_users")
      .upsert(
        { company_id: input.companyId, user_id: userId, role: input.role, is_active: true, invited_by: input.invitedBy },
        { onConflict: "company_id,user_id" }
      )
      .select("id, user_id, role, is_active, created_at")
      .single()
  );
}

export async function listTeamMembers(companyId: string) {
  const rows = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id, user_id, role, is_active, created_at, users ( id, full_name, email )")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
  );

  return (rows ?? []).map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      membershipId: row.id,
      userId: row.user_id,
      fullName: user?.full_name ?? null,
      email: user?.email ?? null,
      role: row.role as CompanyRole,
      isActive: row.is_active,
      createdAt: row.created_at
    };
  });
}

// adm so gerencia quem ja e "agente" (nunca outro adm nem o master, mesmo
// que a request tenha passado por assertAdmOrMaster na rota). Alterar o
// papel de um master nao e suportado por este endpoint -- so isActive.
export async function updateTeamMember(input: {
  companyId: string;
  requesterRole: CompanyRole;
  targetUserId: string;
  role?: InvitableRole;
  isActive?: boolean;
}) {
  const target = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id, role, is_active")
      .eq("company_id", input.companyId)
      .eq("user_id", input.targetUserId)
      .maybeSingle()
  ) as CompanyUserRow | null;

  if (!target) {
    throw new Error("Usuario nao pertence a esta empresa");
  }
  if (input.requesterRole === "adm" && target.role !== "agente") {
    throw new Error("adm so pode gerenciar usuarios com papel agente");
  }

  if (target.role === "master") {
    if (input.role) {
      throw new Error("Alterar o papel de um master nao e suportado por este endpoint");
    }
    if (input.isActive === false) {
      const { count, error } = await supabaseAdmin
        .from("company_users")
        .select("id", { count: "exact", head: true })
        .eq("company_id", input.companyId)
        .eq("role", "master")
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      if ((count ?? 0) <= 1) {
        throw new Error("Nao e possivel desativar o unico master ativo da empresa");
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.role) updates.role = input.role;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  return unwrap(
    await supabaseAdmin
      .from("company_users")
      .update(updates)
      .eq("id", target.id)
      .select("id, user_id, role, is_active, created_at, updated_at")
      .single()
  );
}
