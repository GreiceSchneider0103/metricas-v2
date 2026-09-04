import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../../config.js";
import { assertAdmOrMaster, assertTabAllowed, getAuthContext } from "../../../plugins/auth.js";
import { disconnectAccount, getAuthorizationUrl, getIntegrationStatus, handleOAuthCallback } from "./service.js";
import { isMagaluConfigured } from "./oauth.js";

function callbackHtml(status: "success" | "error", message: string) {
  const returnUrl = status === "success" && config.APP_WEB_URL ? `${config.APP_WEB_URL.replace(/\/+$/, "")}/configuracoes` : null;

  return `<!DOCTYPE html>
<html>
<head><title>Magalu - Integracao</title>
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

export async function magaluRoutes(app: FastifyInstance) {
  app.get("/integrations/magalu/authorize", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    assertAdmOrMaster(request, context);
    if (!isMagaluConfigured()) {
      throw request.server.httpErrors.serviceUnavailable(
        "Integração com Magalu ainda não configurada (client_id/client_secret pendentes)."
      );
    }
    return getAuthorizationUrl(context.companyId, context.userId);
  });

  app.get("/integrations/magalu", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    return getIntegrationStatus(context.companyId);
  });

  app.post("/integrations/magalu/:accountId/disconnect", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "configuracoes");
    assertAdmOrMaster(request, context);
    const params = z.object({ accountId: z.string().uuid() }).parse(request.params);
    await disconnectAccount(context.companyId, params.accountId);
    return { ok: true };
  });
}

// Sem auth por bearer token -- mesmo motivo do callback do ML: a Magalu
// redireciona o navegador direto pra ca apos o consentimento OAuth. A
// identidade (companyId/userId) vem do "state" assinado, nao de um header.
export async function magaluPublicRoutes(app: FastifyInstance) {
  app.get("/integrations/magalu/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        error: z.string().min(1).optional()
      })
      .parse(request.query);

    if (query.error) {
      return reply.code(400).type("text/html; charset=utf-8").send(callbackHtml("error", query.error));
    }
    if (!query.code || !query.state) {
      return reply.code(400).type("text/html; charset=utf-8").send(callbackHtml("error", "Callback da Magalu sem code/state validos."));
    }

    try {
      const result = await handleOAuthCallback({ code: query.code, state: query.state });
      return reply
        .type("text/html; charset=utf-8")
        .send(callbackHtml("success", `Conta ${result.account.nickname} conectada! Sincronizando produtos em segundo plano...`));
    } catch (error) {
      request.log.error({ err: error }, "[magalu-integration] callback OAuth falhou");
      const message = error instanceof Error ? error.message : "Falha ao concluir OAuth da Magalu.";
      return reply.code(400).type("text/html; charset=utf-8").send(callbackHtml("error", message));
    }
  });
}
