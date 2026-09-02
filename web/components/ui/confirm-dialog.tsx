"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmContextValue = { confirm: (options: ConfirmOptions) => Promise<boolean> };

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Substitui window.confirm por um modal com o visual do resto do app --
// mantem a mesma assinatura (promessa que resolve true/false) pra trocar o
// call site sem reescrever a logica em volta.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(next);
    });
  }, []);

  function resolve(value: boolean) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => resolve(false)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            {options.title && <h3 className="text-sm font-semibold text-slate-800">{options.title}</h3>}
            <p className={`text-sm text-slate-600 ${options.title ? "mt-1.5" : ""}`}>{options.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => resolve(false)}>
                {options.cancelLabel ?? "Cancelar"}
              </Button>
              <Button variant={options.danger ? "danger" : "primary"} size="sm" onClick={() => resolve(true)}>
                {options.confirmLabel ?? "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm precisa estar dentro de ConfirmProvider");
  return context.confirm;
}
