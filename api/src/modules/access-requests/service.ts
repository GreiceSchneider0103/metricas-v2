import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { createNotification } from "../notifications/service.js";
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
// Supabase Auth -- o usuario ainda nao pertence a nenhuma empresa nesse
// ponto. Nao concede nenhum acesso; so registra o pedido para o
// master/adm da empresa escolhida aprovar.
export async function createAccessRequest(input: { userId: string; companyId: string }) {
  const company = unwrap(
    await supabaseAdmin.from("companies").select("id, name").eq("id", input.companyId).maybeSingle()
  );
  if (!company) throw new Error("Empresa nao encontrada");

  const alreadyMember = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("id")
      .eq("company_id", input.companyId)
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
      .eq("company_id", input.companyId)
      .eq("status", "pending")
      .maybeSingle()
  ) as AccessRequestRow | null;

  const request =
    existingPending ??
    (unwrap(
      await supabaseAdmin
        .from("access_requests")
        .insert({ user_id: input.userId, company_id: input.companyId, status: "pending" })
        .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
        .single()
    ) as AccessRequestRow);

  const requester = unwrap(await supabaseAdmin.from("users").select("full_name").eq("id", input.userId).maybeSingle());
  const reviewers = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("company_id", input.companyId)
      .eq("is_active", true)
      .in("role", ["master", "adm"])
  );
  for (const reviewer of reviewers ?? []) {
    await createNotification({
      companyId: input.companyId,
      userId: reviewer.user_id,
      type: "access_request",
      title: "Novo pedido de acesso",
      body: `${requester?.full_name ?? "Alguem"} pediu acesso a ${company.name}.`,
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

export async function listPendingAccessRequests(companyId: string) {
  // access_requests tem duas FKs pra users (user_id e reviewed_by) -- embed
  // sem qualificar fica ambiguo pro PostgREST (mesmo bug de team/service.ts).
  const rows = unwrap(
    await supabaseAdmin
      .from("access_requests")
      .select(
        "id, user_id, company_id, status, reviewed_by, reviewed_at, created_at, users!access_requests_user_id_fkey ( full_name, email )"
      )
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
  );

  return (rows ?? []).map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      ...mapAccessRequest(row as AccessRequestRow),
      fullName: user?.full_name ?? null,
      email: user?.email ?? null
    };
  });
}

async function getPendingRequestForCompany(companyId: string, requestId: string) {
  const request = unwrap(
    await supabaseAdmin
      .from("access_requests")
      .select("id, user_id, company_id, status, reviewed_by, reviewed_at, created_at")
      .eq("id", requestId)
      .eq("company_id", companyId)
      .maybeSingle()
  ) as AccessRequestRow | null;

  if (!request) throw new Error("Pedido de acesso nao encontrado");
  if (request.status !== "pending") throw new Error("Este pedido ja foi revisado");
  return request;
}

export async function approveAccessRequest(input: {
  companyId: string;
  requestId: string;
  reviewedBy: string;
  role: InvitableRole;
}) {
  const request = await getPendingRequestForCompany(input.companyId, input.requestId);

  const membershipResult = await supabaseAdmin.from("company_users").upsert(
    { company_id: input.companyId, user_id: request.user_id, role: input.role, is_active: true, invited_by: input.reviewedBy },
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

  const company = unwrap(await supabaseAdmin.from("companies").select("name").eq("id", input.companyId).maybeSingle());
  await createNotification({
    companyId: input.companyId,
    userId: request.user_id,
    type: "access_request_approved",
    title: "Acesso aprovado",
    body: `Seu acesso a ${company?.name ?? "empresa"} foi aprovado.`
  });

  return mapAccessRequest(updated);
}

export async function rejectAccessRequest(input: { companyId: string; requestId: string; reviewedBy: string }) {
  const request = await getPendingRequestForCompany(input.companyId, input.requestId);

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
