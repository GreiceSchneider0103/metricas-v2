import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../../config.js";
import { assertAdmOrMaster, getAuthContext } from "../../../plugins/auth.js";
import { getAuthorizationUrl, getIntegrationStatus, handleOAuthCallback } from "./service.js";

function callbackHtml(status: "success" | "error", message: string) {
  const returnUrl = status === "success" && config.APP_WEB_URL
    ? `${config.APP_WEB_URL.replace(/\/+$/, "")}/integracoes`
    : null;

  return `<!DOCTYPE html>
<html>
<head><title>Mercado Livre - Integracao</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f4f4f9}
.card{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);text-align:center}
.success{color:#2e7d32}.error{color:#d32f2f}
.back{display:inline-block;margin-top:1rem;color:#2563eb;text-decoration:none;font-weight:600}</style></head>
<body><div class="card">
<h1 class="${status}">${message}</h1>
<p>Voce ja pode voltar ao sistema.</p>
${returnUrl ? `<a class="back" href="${returnUrl}">Voltar para o Metricas</a>` : ""}
</div>
<script>setTimeout(()=>window.close(),5000);${returnUrl ? `setTimeout(()=>{window.location.href=${JSON.stringify(returnUrl)};},2500);` : ""}</script>
</body></html>`;
}

export async function mercadoLivreRoutes(app: FastifyInstance) {
  app.get("/integrations/mercado-livre/authorize", async (request) => {
    const context = await getAuthContext(request);
    assertAdmOrMaster(request, context);
    return getAuthorizationUrl(context.companyId, context.userId);
  });

  app.get("/integrations/mercado-livre", async (request) => {
    const context = await getAuthContext(request);
    return getIntegrationStatus(context.companyId);
  });
}

// Sem auth por bearer token -- o Mercado Livre redireciona o navegador do
// usuario direto para esta URL apos o consentimento OAuth. A identidade e
// autorizacao (companyId/userId) vem do "state" assinado, nao de um header.
export async function mercadoLivrePublicRoutes(app: FastifyInstance) {
  app.get("/integrations/mercado-livre/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        error: z.string().min(1).optional(),
        error_description: z.string().min(1).optional()
      })
      .parse(request.query);

    if (query.error) {
      return reply.code(400).type("text/html; charset=utf-8").send(callbackHtml("error", query.error_description ?? query.error));
    }
    if (!query.code || !query.state) {
      return reply.code(400).type("text/html; charset=utf-8").send(callbackHtml("error", "Callback do Mercado Livre sem code/state validos."));
    }

    try {
      const result = await handleOAuthCallback({ code: query.code, state: query.state });
      return reply.type("text/html; charset=utf-8").send(
        callbackHtml("success", `Conta ${result.account.nickname} conectada! Sincronizando anuncios em segundo plano...`)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao concluir OAuth do Mercado Livre.";
      return reply.code(400).type("text/html; charset=utf-8").send(callbackHtml("error", message));
    }
  });
}
