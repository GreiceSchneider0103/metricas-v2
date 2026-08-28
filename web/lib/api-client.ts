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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.companyId) headers["x-company-id"] = options.companyId;

  const response = await fetch(`${API_URL}${path}${buildQueryString(options.query)}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const rawMessage = data && typeof data === "object" && "message" in data ? (data as { message: unknown }).message : null;
    const message = Array.isArray(rawMessage) ? JSON.stringify(rawMessage) : rawMessage ? String(rawMessage) : response.statusText || "Erro inesperado";
    throw new ApiError(message, response.status);
  }

  return data as T;
}
