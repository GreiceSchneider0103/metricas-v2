"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { IntegrationStatus } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export function IntegrationsPanel() {
  const api = useApi();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const result = await api<IntegrationStatus>("/api/v1/integrations/mercado-livre");
      setStatus(result);
    } catch {
      setError("Nao foi possivel carregar o status da integracao.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const result = await api<{ authorizationUrl: string }>("/api/v1/integrations/mercado-livre/authorize");
      window.location.href = result.authorizationUrl;
    } catch {
      setError("Nao foi possivel gerar o link de autorizacao do Mercado Livre.");
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await api("/api/v1/jobs/ml-sync", { method: "POST" });
      await loadStatus();
    } catch {
      setError("Falha ao disparar a sincronizacao.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {connecting ? "Gerando link..." : "Conectar conta Mercado Livre"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : !status || status.accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma conta do Mercado Livre conectada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <button onClick={handleSync} disabled={syncing} className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60">
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Conta</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Anuncios</th>
                  <th className="px-4 py-2">Ultima sync</th>
                </tr>
              </thead>
              <tbody>
                {status.accounts.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{account.nickname}</td>
                    <td className="px-4 py-2">
                      <StatusBadge value={account.status} />
                    </td>
                    <td className="px-4 py-2">{account.listingsCount}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("pt-BR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
