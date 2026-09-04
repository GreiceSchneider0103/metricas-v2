import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { config } from "../../config.js";
import type { AppTab, CompanyRole } from "../../types.js";

type InvitableRole = Exclude<CompanyRole, "master">;

const DEFAULT_TABS: AppTab[] = ["mapa_vendas", "atividades", "alertas", "configuracoes"];

type CompanyUserRow = {
  id: string;
  user_id: string;
  role: CompanyRole;
  is_active: boolean;
  allowed_tabs: AppTab[];
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
    data: fullName ? { full_name: fullName } : undefined,
    // Sem isso o link do e-mail de convite cai no Site URL padrao do
    // projeto Supabase (nao necessariamente esta app), e o usuario convidado
    // nunca chega numa tela que aceite a sessao do convite e peca senha.
    redirectTo: config.APP_WEB_URL ? `${config.APP_WEB_URL}/reset-password` : undefined
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
  allowedTabs?: AppTab[];
}) {
  const userId = await findOrInviteAuthUser(input.email, input.fullName);

  return unwrap(
    await supabaseAdmin
      .from("company_users")
      .upsert(
        {
          company_id: input.companyId,
          user_id: userId,
          role: input.role,
          is_active: true,
          invited_by: input.invitedBy,
          allowed_tabs: input.allowedTabs ?? DEFAULT_TABS
        },
        { onConflict: "company_id,user_id" }
      )
      .select("id, user_id, role, is_active, allowed_tabs, created_at")
      .single()
  );
}

export async function listTeamMembers(companyId: string) {
  // company_users tem duas FKs pra users (user_id e invited_by) -- o embed
  // "users ( ... )" sem qualificar fica ambiguo pro PostgREST (erro em
  // runtime, sempre, nao so quando invited_by esta preenchido). Precisa
  // apontar explicitamente a constraint do relacionamento que queremos.
  const rows = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id, user_id, role, is_active, allowed_tabs, created_at, users!company_users_user_id_fkey ( id, full_name, email )")
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
      allowedTabs: (row.allowed_tabs ?? DEFAULT_TABS) as AppTab[],
      createdAt: row.created_at
    };
  });
}

// Todas as memberships de um usuario, em qualquer empresa -- so faz sentido
// pro master de plataforma (ver assertPlatformAdmin na rota), que precisa
// enxergar/editar o acesso de alguem em empresas que ele mesmo nao
// necessariamente administra.
export async function listUserMemberships(userId: string) {
  const rows = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id, company_id, role, is_active, allowed_tabs, created_at, companies ( name )")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
  );

  return (rows ?? []).map((row) => {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return {
      membershipId: row.id,
      companyId: row.company_id,
      companyName: company?.name ?? null,
      role: row.role as CompanyRole,
      isActive: row.is_active,
      allowedTabs: (row.allowed_tabs ?? DEFAULT_TABS) as AppTab[],
      createdAt: row.created_at
    };
  });
}

export async function updateUserFullName(userId: string, fullName: string) {
  return unwrap(
    await supabaseAdmin.from("users").update({ full_name: fullName }).eq("id", userId).select("id, full_name, email").single()
  );
}

// adm so gerencia quem ja e "agente" (nunca outro adm nem o master, mesmo
// que a request tenha passado por assertAdmOrMaster na rota) -- essa
// restricao nao vale pro master de plataforma, que pode editar qualquer
// membership em qualquer empresa. Alterar o papel de um master nao e
// suportado por este endpoint -- so isActive/allowedTabs.
export async function updateTeamMember(input: {
  companyId: string;
  requesterRole: CompanyRole;
  isPlatformAdmin: boolean;
  targetUserId: string;
  role?: InvitableRole;
  isActive?: boolean;
  allowedTabs?: AppTab[];
}) {
  const target = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id, role, is_active, allowed_tabs")
      .eq("company_id", input.companyId)
      .eq("user_id", input.targetUserId)
      .maybeSingle()
  ) as CompanyUserRow | null;

  if (!target) {
    throw new Error("Usuario nao pertence a esta empresa");
  }
  if (!input.isPlatformAdmin && input.requesterRole === "adm" && target.role !== "agente") {
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
  if (input.allowedTabs) updates.allowed_tabs = input.allowedTabs;

  return unwrap(
    await supabaseAdmin
      .from("company_users")
      .update(updates)
      .eq("id", target.id)
      .select("id, user_id, role, is_active, allowed_tabs, created_at, updated_at")
      .single()
  );
}
