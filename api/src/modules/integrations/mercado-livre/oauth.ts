import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../../config.js";
import { mlPostForm } from "./client.js";

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
};

type AuthorizationState = {
  companyId: string;
  userId: string;
  issuedAt: string;
};

function validateRedirectUri(redirectUri: string) {
  const parsed = new URL(redirectUri);
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase());

  if (!isLocalhost && parsed.protocol !== "https:") {
    throw new Error(`MERCADO_LIVRE_REDIRECT_URI precisa usar HTTPS fora de localhost: ${redirectUri}`);
  }
  if (config.NODE_ENV === "production" && isLocalhost) {
    throw new Error("MERCADO_LIVRE_REDIRECT_URI nao pode apontar para localhost em producao");
  }
}

validateRedirectUri(config.MERCADO_LIVRE_REDIRECT_URI);

function encodeState(value: AuthorizationState) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signState(payload: string) {
  return createHmac("sha256", config.MERCADO_LIVRE_CLIENT_SECRET).update(payload).digest("base64url");
}

export function buildOAuthState(companyId: string, userId: string) {
  const payload = encodeState({ companyId, userId, issuedAt: new Date().toISOString() });
  return `${payload}.${signState(payload)}`;
}

export function decodeOAuthState(state: string): AuthorizationState {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expected = signState(payload);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("Invalid OAuth state signature");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as AuthorizationState;
  if (!parsed.companyId || !parsed.userId || !parsed.issuedAt) {
    throw new Error("Invalid OAuth state payload");
  }
  return parsed;
}

export function buildAuthorizationUrl(companyId: string, userId: string) {
  const state = buildOAuthState(companyId, userId);
  const url = new URL(`${config.MERCADO_LIVRE_AUTH_BASE_URL}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.MERCADO_LIVRE_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.MERCADO_LIVRE_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string) {
  return mlPostForm<OAuthTokenResponse>(`${config.MERCADO_LIVRE_API_BASE_URL}/oauth/token`, new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.MERCADO_LIVRE_CLIENT_ID,
    client_secret: config.MERCADO_LIVRE_CLIENT_SECRET,
    code,
    redirect_uri: config.MERCADO_LIVRE_REDIRECT_URI
  }));
}

export async function refreshAccessToken(refreshToken: string) {
  return mlPostForm<OAuthTokenResponse>(`${config.MERCADO_LIVRE_API_BASE_URL}/oauth/token`, new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.MERCADO_LIVRE_CLIENT_ID,
    client_secret: config.MERCADO_LIVRE_CLIENT_SECRET,
    refresh_token: refreshToken
  }));
}

export function tokenExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

// Sinais de que o token foi de fato revogado pelo Mercado Livre (erro
// definitivo, exige reconexao manual). Qualquer outro erro (timeout, rede,
// 429, 5xx) e transitorio: a conta continua "connected" para o proximo ciclo
// tentar de novo, em vez de cair como "sync_failed" por instabilidade passageira.
const DEFINITIVE_AUTH_ERROR_PATTERNS = ["invalid_grant", "invalid_token", "invalid_client", "unauthorized_client"];

export function isDefinitiveAuthError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return DEFINITIVE_AUTH_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}
