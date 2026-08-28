import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { createNotification } from "../notifications/service.js";
import { getOnboardingCompany } from "../companies/service.js";
import type { CompanyRole } from "../../types.js";

type InvitableRole = Exclude<CompanyRole, "master">;

type AccessRequestRow = {
  id: string;
  user_id: string;
  company_id: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function mapAccessRequest(row: AccessRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at
  };
}

// Chamado a partir da tela de cadastro (login), logo apos criar a conta no
// Supabase Auth -- ninguem escolhe ou cria empresa no cadastro. Todo pedido
// cai automaticamente na empresa de onboarding; e o master de plataforma
// (users.is_platform_admin) quem decide, na revisao, pra qual empresa de
// verdade a pessoa vai (ver approveAccessRequest).
export async function createAccessRequest(input: { userId: string }) {
  const company = await getOnboardingCompany();

  const alreadyMember = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id")
      .eq("company_id", company.id)
      .eq("user_id", input.userId)
      .maybeSingle()
  );
  if (alreadyMember) throw new Error("Usuario ja pertence a esta empresa");

  // O unique index em access_requests so cobre status = 'pending' (permite
  // pedir de novo apos rejeicao), entao um upsert com ON CONFLICT(user_id,
  // company_id) simples nao bate com esse indice parcial -- checa e insere
  // em vez de upsert.
  const existingPending = unwrap(
    await supabaseAdmin
      .from("access_requests")
      .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
      .eq("user_id", input.userId)
      .eq("company_id", company.id)
      .eq("status", "pending")
      .maybeSingle()
  ) as AccessRequestRow | null;

  const request =
    existingPending ??
    (unwrap(
      await supabaseAdmin
        .from("access_requests")
        .insert({ user_id: input.userId, company_id: company.id, status: "pending" })
        .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
        .single()
    ) as AccessRequestRow);

  const requester = unwrap(await supabaseAdmin.from("users").select("full_name").eq("id", input.userId).maybeSingle());
  const reviewers = unwrap(
    await supabaseAdmin
      .from("users")
      .select("id")
      .eq("is_platform_admin", true)
  );
  for (const reviewer of reviewers ?? []) {
    await createNotification({
      companyId: company.id,
      userId: reviewer.id,
      type: "access_request",
      title: "Novo cadastro pendente",
      body: `${requester?.full_name ?? "Alguem"} se cadastrou e esta aguardando aprovacao.`,
      link: "/configuracoes"
    });
  }

  return mapAccessRequest(request);
}

export async function hasPendingAccessRequest(userId: string) {
  const row = unwrap(
    await supabaseAdmin.from("access_requests").select("id").eq("user_id", userId).eq("status", "pending").maybeSingle()
  );
  return row !== null;
}

// Master de plataforma ve pedidos pendentes de QUALQUER empresa (hoje,
// sempre a de onboarding); master/adm comum so ve os da propria empresa.
export async function listPendingAccessRequests(input: { companyId: string; allCompanies: boolean }) {
  // access_requests tem duas FKs pra users (user_id e reviewed_by) -- embed
  // sem qualificar fica ambiguo pro PostgREST (mesmo bug de team/service.ts).
  let query = supabaseAdmin
    .from("access_requests")
    .select(
      "id, user_id, company_id, status, reviewed_by, reviewed_at, created_at, users!access_requests_user_id_fkey ( full_name, email ), companies ( name )"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!input.allCompanies) {
    query = query.eq("company_id", input.companyId);
  }

  const rows = unwrap(await query);

  return (rows ?? []).map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return {
      ...mapAccessRequest(row as AccessRequestRow),
      fullName: user?.full_name ?? null,
      email: user?.email ?? null,
      companyName: company?.name ?? null
    };
  });
}

async function getPendingRequest(requestId: string, scope: { companyId: string; isPlatformAdmin: boolean }) {
  let query = supabaseAdmin
    .from("access_requests")
    .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
    .eq("id", requestId);

  if (!scope.isPlatformAdmin) {
    query = query.eq("company_id", scope.companyId);
  }

  const request = unwrap(await query.maybeSingle()) as AccessRequestRow | null;

  if (!request) throw new Error("Pedido de acesso nao encontrado");
  if (request.status !== "pending") throw new Error("Este pedido ja foi revisado");
  return request;
}

export async function approveAccessRequest(input: {
  companyId: string;
  requestId: string;
  reviewedBy: string;
  role: InvitableRole;
  isPlatformAdmin: boolean;
  targetCompanyId?: string;
}) {
  const request = await getPendingRequest(input.requestId, { companyId: input.companyId, isPlatformAdmin: input.isPlatformAdmin });

  // So o master de plataforma pode mandar a pessoa pra uma empresa diferente
  // de onde o pedido foi aberto -- master/adm comum so aprova pra propria
  // empresa (comportamento antigo, preservado).
  const destinationCompanyId = input.isPlatformAdmin && input.targetCompanyId ? input.targetCompanyId : request.company_id;

  if (destinationCompanyId !== request.company_id) {
    const destination = unwrap(await supabaseAdmin.from("companies").select("id").eq("id", destinationCompanyId).maybeSingle());
    if (!destination) throw new Error("Empresa de destino nao encontrada");
  }

  const membershipResult = await supabaseAdmin.from("company_users").upsert(
    { company_id: destinationCompanyId, user_id: request.user_id, role: input.role, is_active: true, invited_by: input.reviewedBy },
    { onConflict: "company_id,user_id" }
  );
  if (membershipResult.error) {
    throw new Error(`Falha ao conceder acesso: ${membershipResult.error.message}`);
  }

  const updated = unwrap(
    await supabaseAdmin
      .from("access_requests")
      .update({ status: "approved", reviewed_by: input.reviewedBy, reviewed_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
      .single()
  ) as AccessRequestRow;

  const company = unwrap(await supabaseAdmin.from("companies").select("name").eq("id", destinationCompanyId).maybeSingle());
  await createNotification({
    companyId: destinationCompanyId,
    userId: request.user_id,
    type: "access_request_approved",
    title: "Acesso aprovado",
    body: `Seu acesso a ${company?.name ?? "empresa"} foi aprovado.`
  });

  return mapAccessRequest(updated);
}

export async function rejectAccessRequest(input: { companyId: string; requestId: string; reviewedBy: string; isPlatformAdmin: boolean }) {
  const request = await getPendingRequest(input.requestId, { companyId: input.companyId, isPlatformAdmin: input.isPlatformAdmin });

  const updated = unwrap(
    await supabaseAdmin
      .from("access_requests")
      .update({ status: "rejected", reviewed_by: input.reviewedBy, reviewed_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
      .single()
  ) as AccessRequestRow;

  return mapAccessRequest(updated);
}
