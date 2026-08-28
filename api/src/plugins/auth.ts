import type { FastifyRequest } from "fastify";
import type { AuthContext, CompanyRole } from "../types.js";
import { unwrap } from "../lib/db.js";
import { supabaseAdmin } from "../lib/supabase.js";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

function getBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization) {
    throw request.server.httpErrors.unauthorized("Missing authorization bearer token");
  }
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw request.server.httpErrors.unauthorized("Invalid authorization header");
  }
  return token;
}

function getRequestedCompanyIdFromHeader(request: FastifyRequest) {
  const header = request.headers["x-company-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// bearer token -> Supabase Auth -> company_users -> { userId, companyId, role }.
// Um usuario pode pertencer a mais de uma empresa (ex.: agencia); qual empresa
// vale para a request vem do header x-company-id (o frontend guarda a empresa
// ativa localmente e manda em toda chamada). Sem header, cai na primeira
// membership ativa do usuario.
export async function getAuthContext(request: FastifyRequest): Promise<AuthContext> {
  if (request.authContext) {
    return request.authContext;
  }

  const token = getBearerToken(request);
  const authResult = await supabaseAdmin.auth.getUser(token);

  if (authResult.error || !authResult.data.user) {
    request.log.warn({ err: authResult.error ?? null }, "[AUTH] Supabase getUser failed");
    throw request.server.httpErrors.unauthorized("Invalid or expired token");
  }

  const userId = authResult.data.user.id;
  const requestedCompanyId = getRequestedCompanyIdFromHeader(request);

  let membershipQuery = supabaseAdmin
    .from("company_users")
    .select("company_id, role, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1);

  if (requestedCompanyId) {
    membershipQuery = membershipQuery.eq("company_id", requestedCompanyId);
  }

  const membership = unwrap(await membershipQuery.maybeSingle());

  if (!membership) {
    throw request.server.httpErrors.forbidden("Authenticated user does not have access to any active company");
  }

  request.authContext = {
    userId,
    companyId: membership.company_id,
    role: membership.role as CompanyRole
  };

  return request.authContext;
}

// Para rotas que so precisam de "e um usuario Supabase Auth valido", sem
// exigir membership em nenhuma empresa -- caso de criar/pedir acesso a uma
// empresa (companies/service.ts, access-requests/service.ts), quando o
// usuario ainda pode nao pertencer a nenhuma.
export async function getAuthenticatedUserId(request: FastifyRequest) {
  const token = getBearerToken(request);
  const authResult = await supabaseAdmin.auth.getUser(token);
  if (authResult.error || !authResult.data.user) {
    throw request.server.httpErrors.unauthorized("Invalid or expired token");
  }
  return authResult.data.user.id;
}

export function assertRole(request: FastifyRequest, context: AuthContext, allowed: CompanyRole[]) {
  if (!allowed.includes(context.role)) {
    throw request.server.httpErrors.forbidden("Insufficient role for this operation");
  }
}

// master tem todas as permissoes de adm; helper para rotas que hoje so
// checam "ADM" no repo antigo e devem continuar liberadas para master.
export function assertAdmOrMaster(request: FastifyRequest, context: AuthContext) {
  assertRole(request, context, ["master", "adm"]);
}
