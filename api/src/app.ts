import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config, getCorsAllowedOrigins } from "./config.js";
import { registerRoutes } from "./routes/index.js";
import { supabaseAdmin } from "./lib/supabase.js";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  const allowedOrigins = getCorsAllowedOrigins();

  await app.register(cors, {
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "x-company-id"],
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin.trim().replace(/\/+$/, "").toLowerCase())) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"), false);
    }
  });
  await app.register(sensible);

  // Fastify recusa por padrao um corpo vazio quando Content-Type e
  // application/json (FST_ERR_CTP_EMPTY_JSON_BODY), antes mesmo do handler
  // rodar -- isso ja derrubou POST/PATCH sem corpo (ex.: /jobs/ml-sync,
  // /access-requests) com 400 instantaneo, sem log de auth nem de negocio.
  // Trata corpo vazio como objeto vazio em vez de erro (padrao documentado
  // do proprio Fastify pra esse caso).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    if (body === "" || body === undefined) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.setErrorHandler((rawError, _request, reply) => {
    if (rawError instanceof ZodError) {
      return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: rawError.errors });
    }
    const error = rawError as Error & { statusCode?: number };
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || "Error",
      message: error.message ?? "Unexpected error"
    });
  });

  app.get("/health", async () => ({ status: "ok", service: "metricas-api" }));

  app.get("/ready", async (_request, reply) => {
    try {
      await withTimeout(
        (async () => {
          const result = await supabaseAdmin.from("companies").select("id", { count: "exact", head: true }).limit(1);
          if (result.error) throw new Error(result.error.message);
        })(),
        3000,
        "supabase"
      );
      return { status: "ok", service: "metricas-api", environment: config.NODE_ENV };
    } catch {
      return reply.code(503).send({ status: "degraded", service: "metricas-api", environment: config.NODE_ENV });
    }
  });

  await registerRoutes(app);

  return app;
}
