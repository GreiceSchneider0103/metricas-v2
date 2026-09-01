import { supabase } from "./supabase-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  companyId?: string | null;
  query?: Record<string, string | number | boolean | undefined>;
};

function buildQueryString(query?: RequestOptions["query"]) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Fina camada sobre fetch: sempre manda o access_token do Supabase Auth como
// Bearer e a empresa ativa via x-company-id (ver api/src/plugins/auth.ts --
// "o frontend guarda a empresa ativa localmente e manda em toda chamada").
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return performRequest<T>(path, options, true);
}

// Uma aba deixada aberta em segundo plano por muito tempo (ex.: a conta
// compartilhada em Configuracoes > Integrações, ligando contas do Mercado
// Livre uma a uma) throttla o timer de auto-refresh do supabase-js -- o
// access_token guardado no estado do React fica vencido e toda chamada
// passa a voltar 401 silenciosamente. Em vez de deixar a pessoa presa
// vendo erro generico pra sempre, tenta renovar a sessao e repetir a
// chamada UMA vez; se nem isso resolver, desloga -- o layout ja redireciona
// pro login sozinho quando a sessao fica nula (ver DashboardLayout).
async function performRequest<T>(path: string, options: RequestOptions, allowRefresh: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  // So manda Content-Type quando ha corpo de fato -- o Fastify rejeita com
  // 400 (FST_ERR_CTP_EMPTY_JSON_BODY) uma request "application/json" com
  // corpo vazio, antes mesmo de rodar o handler (nao e um erro de auth nem
  // de logica, e so o parser recusando a request antes de chegar la).
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.companyId) headers["x-company-id"] = options.companyId;

  const response = await fetch(`${API_URL}${path}${buildQueryString(options.query)}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401 && allowRefresh && options.accessToken) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) {
      return performRequest<T>(path, { ...options, accessToken: refreshed.session.access_token }, false);
    }
    await supabase.auth.signOut();
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const rawMessage = data && typeof data === "object" && "message" in data ? (data as { message: unknown }).message : null;
    const message = Array.isArray(rawMessage) ? JSON.stringify(rawMessage) : rawMessage ? String(rawMessage) : response.statusText || "Erro inesperado";
    throw new ApiError(message, response.status);
  }

  return data as T;
}
