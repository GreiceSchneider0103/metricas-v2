"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Sem isso, qualquer excecao nao tratada durante o render (bug de codigo,
// dado inesperado da API) derrubava a tela inteira sem nenhuma UI de
// recuperacao -- so um retangulo em branco, exigindo reload manual.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <p className="text-sm font-medium text-slate-700">Algo deu errado.</p>
      <p className="max-w-sm text-sm text-slate-500">
        Tente de novo -- se o problema continuar, atualize a página ou entre em contato com o suporte.
      </p>
      <Button onClick={reset} size="sm">
        Tentar de novo
      </Button>
    </div>
  );
}
