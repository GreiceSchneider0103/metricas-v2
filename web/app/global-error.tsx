"use client";

import { useEffect } from "react";

// Cobre o caso raro em que o proprio RootLayout (app/layout.tsx) lanca uma
// excecao -- app/error.tsx sozinho nao pega isso, porque ele fica DENTRO do
// layout. Precisa renderizar <html>/<body> proprios, ja que substitui a
// arvore inteira.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>Algo deu errado.</p>
          <p style={{ maxWidth: 360, fontSize: 14, color: "#64748b" }}>
            Tente de novo -- se o problema continuar, atualize a página ou entre em contato com o suporte.
          </p>
          <button
            onClick={reset}
            style={{ borderRadius: 8, backgroundColor: "#4f46e5", color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
