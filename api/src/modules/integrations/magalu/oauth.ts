import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../../config.js";
import { magaluPostForm, magaluPostJson } from "./client.js";

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
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
    throw new Error(`MAGALU_REDIRECT_URI precisa usar HTTPS fora de localhost: ${redirectUri}`);
  }
  if (config.NODE_ENV === "production" && isLocalhost) {
    throw new Error("MAGALU_REDIRECT_URI nao pode apontar para localhost em producao");
  }
}

// Diferente do modulo do ML, o client_id/secret/redirect_uri da Magalu sao
// OPCIONAIS (ver config.ts) -- o cliente OAuth ainda nao foi criado (passo
// manual via IDM CLI, feito por um humano). So valida o formato quando a
// env var de fato existe; getAuthorizationUrl() e quem barra a chamada com
// uma mensagem clara enquanto isso nao acontece.
if (config.MAGALU_REDIRECT_URI) validateRedirectUri(config.MAGALU_REDIRECT_URI);

function encodeState(value: AuthorizationState) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signState(payload: string) {
  const secret = config.MAGALU_CLIENT_SECRET ?? "unconfigured";
  return createHmac("sha256", secret).update(payload).digest("base64url");
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

// Escopos minimos pro que o Mapa de Vendas precisa: consultar SKUs, precos,
// estoques e pedidos. Nao inclui os de escrita nem os de logistica/SAC/chat
// (fora do escopo hoje). "open:portfolio:read" (perfil da loja) e separado
// dos escopos granulares de SKU/preco/estoque -- sem ele, GET
// /seller/v1/portfolios/me (usado pra descobrir o seller_id na conexao)
// responde 401 mesmo com token valido.
const REQUIRED_SCOPES = [
  "open:portfolio:read",
  "open:portfolio-skus-seller:read",
  "open:portfolio-prices-seller:read",
  "open:portfolio-stocks-seller:read",
  "open:order-order-seller:read"
].join(" ");

export function isMagaluConfigured() {
  return Boolean(config.MAGALU_CLIENT_ID && config.MAGALU_CLIENT_SECRET && config.MAGALU_REDIRECT_URI);
}

export function buildAuthorizationUrl(companyId: string, userId: string) {
  if (!isMagaluConfigured()) {
    throw new Error("Integração com Magalu ainda não configurada (falta client_id/client_secret/redirect_uri).");
  }
  const state = buildOAuthState(companyId, userId);
  const url = new URL(`${config.MAGALU_AUTH_BASE_URL}/login`);
  url.searchParams.set("client_id", config.MAGALU_CLIENT_ID!);
  url.searchParams.set("redirect_uri", config.MAGALU_REDIRECT_URI!);
  url.searchParams.set("scope", REQUIRED_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("choose_tenants", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string) {
  return magaluPostJson<OAuthTokenResponse>(`${config.MAGALU_AUTH_BASE_URL}/oauth/token`, {
    client_id: config.MAGALU_CLIENT_ID,
    client_secret: config.MAGALU_CLIENT_SECRET,
    redirect_uri: config.MAGALU_REDIRECT_URI,
    code,
    grant_type: "authorization_code"
  });
}

export async function refreshAccessToken(refreshToken: string) {
  return magaluPostForm<OAuthTokenResponse>(
    `${config.MAGALU_AUTH_BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.MAGALU_CLIENT_ID ?? "",
      client_secret: config.MAGALU_CLIENT_SECRET ?? "",
      refresh_token: refreshToken
    })
  );
}

export function tokenExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

// Mesmo raciocinio do ML: so trata como erro definitivo (exige reconexao
// manual) quando o problema e claramente de credencial invalida/revogada.
// Qualquer outro erro (timeout, rede, 429, 5xx) e transitorio.
const DEFINITIVE_AUTH_ERROR_PATTERNS = ["invalid_grant", "invalid_token", "invalid_client", "unauthorized"];

export function isDefinitiveAuthError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return DEFINITIVE_AUTH_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}
