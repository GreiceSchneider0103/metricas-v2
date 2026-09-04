import { createConcurrencyLimiter } from "../../../lib/concurrency-limiter.js";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONCURRENT_REQUESTS = 15;

const limiter = createConcurrencyLimiter(MAX_CONCURRENT_REQUESTS);

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await limiter.run(() => fetch(url, { ...init, signal: controller.signal }));
  } catch (error) {
    throw error instanceof Error && error.name === "AbortError"
      ? new Error(`Magalu request timeout after ${REQUEST_TIMEOUT_MS}ms`)
      : error instanceof Error
        ? error
        : new Error("Magalu request failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message =
      typeof body?.message === "string" ? body.message : `Magalu request failed with status ${response.status}`;
    const error = new Error(message);
    // "message" sozinho (ex: "Unauthorized") nao diz se falta escopo, se o
    // token expirou, ou outra coisa -- guarda o corpo inteiro da resposta e
    // o header WWW-Authenticate (onde servidores OAuth costumam mandar
    // error="insufficient_scope"/error_description=...) pra aparecer
    // completo no log de erro (request.log.error ja loga qualquer campo
    // extra do Error, ver magalu/routes.ts).
    (error as Error & { status?: number; body?: unknown; wwwAuthenticate?: string | null }).status = response.status;
    (error as Error & { status?: number; body?: unknown; wwwAuthenticate?: string | null }).body = body;
    (error as Error & { status?: number; body?: unknown; wwwAuthenticate?: string | null }).wwwAuthenticate =
      response.headers.get("www-authenticate");
    throw error;
  }

  return body as T;
}

export async function magaluGet<T>(apiBaseUrl: string, accessToken: string, path: string) {
  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" }
  });
  return parseResponse<T>(response);
}

// Troca de codigo por token: JSON. Renovacao (refresh_token): form-urlencoded.
// Formatos diferentes mesmo, confirmados na doc oficial -- nao e inconsistencia.
export async function magaluPostJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  return parseResponse<T>(response);
}

export async function magaluPostForm<T>(url: string, body: URLSearchParams) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body
  });
  return parseResponse<T>(response);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry com backoff para 429/5xx -- os demais 4xx (400/401/403/404) sao
// definitivos e nao adianta tentar de novo. Mesmo padrao do client do ML.
export async function magaluGetWithRetry<T>(
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await magaluGet<T>(apiBaseUrl, accessToken, path);
    } catch (error) {
      const status = (error as { status?: number }).status;
      lastError = error;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || attempt === maxRetries) {
        throw error;
      }
      await delay(500 * 2 ** attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Magalu request failed");
}
