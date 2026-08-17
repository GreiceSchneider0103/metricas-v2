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
      ? new Error(`Mercado Livre request timeout after ${REQUEST_TIMEOUT_MS}ms`)
      : error instanceof Error
        ? error
        : new Error("Mercado Livre request failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error_description === "string"
          ? body.error_description
          : typeof body?.error === "string"
            ? body.error
            : `Mercado Livre request failed with status ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return body as T;
}

export async function mlGet<T>(apiBaseUrl: string, accessToken: string, path: string, headers?: Record<string, string>) {
  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json", ...headers }
  });
  return parseResponse<T>(response);
}

export async function mlPostForm<T>(url: string, body: URLSearchParams) {
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
// definitivos e nao adianta tentar de novo.
export async function mlGetWithRetry<T>(
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await mlGet<T>(apiBaseUrl, accessToken, path);
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

  throw lastError instanceof Error ? lastError : new Error("Mercado Livre request failed");
}
