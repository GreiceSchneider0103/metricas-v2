import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().url().optional());

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JOB_EXECUTION_MODE: z.literal("direct").default("direct"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  APP_WEB_URL: optionalUrl,
  CRON_SECRET: optionalNonEmptyString,
  // Segundo segredo valido pras rotas /cron/*, independente do CRON_SECRET
  // usado pelo GitHub Actions -- permite o pg_cron do Supabase (gatilho
  // redundante e mais confiavel, ver cron-routes.ts) chamar as mesmas rotas
  // sem precisar reusar/rotacionar o secret do workflow existente.
  SUPABASE_CRON_SECRET: optionalNonEmptyString,

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  MERCADO_LIVRE_CLIENT_ID: z.string().min(1),
  MERCADO_LIVRE_CLIENT_SECRET: z.string().min(1),
  MERCADO_LIVRE_REDIRECT_URI: z.string().url(),
  MERCADO_LIVRE_AUTH_BASE_URL: z.string().url().default("https://auth.mercadolivre.com.br"),
  MERCADO_LIVRE_API_BASE_URL: z.string().url().default("https://api.mercadolibre.com"),

  // Opcionais (nao obrigatorios como os do ML): o cliente OAuth da Magalu
  // ainda nao foi criado (precisa do IDM CLI, feito manualmente por um
  // humano -- ver modules/integrations/magalu/README.md). Ate isso existir,
  // a API sobe normalmente e a rota /integrations/magalu/authorize responde
  // 503 em vez de derrubar o boot inteiro por falta de env var.
  MAGALU_CLIENT_ID: optionalNonEmptyString,
  MAGALU_CLIENT_SECRET: optionalNonEmptyString,
  MAGALU_REDIRECT_URI: optionalUrl,
  MAGALU_AUTH_BASE_URL: z.string().url().default("https://id.magalu.com"),
  MAGALU_API_BASE_URL: z.string().url().default("https://api.magalu.com")
});

export const config = envSchema.parse(process.env);

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

export function getCorsAllowedOrigins() {
  const configured = config.CORS_ALLOWED_ORIGINS?.split(",").map(normalizeOrigin).filter(Boolean) ?? [];
  const additional = config.APP_WEB_URL ? [normalizeOrigin(config.APP_WEB_URL)] : [];
  const allowed = Array.from(new Set([...configured, ...additional]));

  if (allowed.length > 0) {
    return allowed;
  }

  return config.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000"];
}
