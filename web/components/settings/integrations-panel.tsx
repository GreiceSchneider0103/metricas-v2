"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { IntegrationStatus } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  connected: "Conectada",
  syncing: "Sincronizando",
  sync_failed: "Falha na sincronização",
  disconnected: "Desconectada"
};

export function IntegrationsPanel() {
  const api = useApi();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [backfillingVisits, setBackfillingVisits] = useState(false);
  const [visitsBackfillMessage, setVisitsBackfillMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const result = await api<IntegrationStatus>("/api/v1/integrations/mercado-livre");
      setStatus(result);
    } catch {
      setError("Não foi possível carregar o status da integração.");
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
      setError("Não foi possível gerar o link de autorização do Mercado Livre.");
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
      setError("Falha ao disparar a sincronização.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleBackfillMonth() {
    setBackfilling(true);
    setBackfillMessage(null);
    setError(null);
    try {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const to = now.toISOString().slice(0, 10);
      const result = await api<{ ordersUpserted: number; orderItemsUpserted: number }>("/api/v1/jobs/orders-backfill", {
        method: "POST",
        body: { from, to }
      });
      setBackfillMessage(`Histórico carregado: ${result.ordersUpserted} pedidos, ${result.orderItemsUpserted} itens.`);
    } catch {
      setError("Falha ao carregar o histórico do mês.");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleBackfillVisits() {
    setBackfillingVisits(true);
    setVisitsBackfillMessage(null);
    setError(null);
    try {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const to = now.toISOString().slice(0, 10);
      const result = await api<{ listingsUpdated: number }>("/api/v1/jobs/visits-backfill", {
        method: "POST",
        body: { from, to }
      });
      setVisitsBackfillMessage(`Visitas carregadas: ${result.listingsUpdated} atualizações.`);
    } catch {
      setError("Falha ao carregar as visitas do mês.");
    } finally {
      setBackfillingVisits(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={handleConnect} disabled={connecting}>
          {connecting ? "Gerando link…" : "Conectar conta Mercado Livre"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : !status || status.accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta do Mercado Livre conectada ainda" hint="Conecte uma conta para começar a sincronizar." />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-4">
            {backfillMessage && <p className="text-sm text-emerald-600">{backfillMessage}</p>}
            {visitsBackfillMessage && <p className="text-sm text-emerald-600">{visitsBackfillMessage}</p>}
            <button
              onClick={handleBackfillMonth}
              disabled={backfilling}
              className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
            >
              {backfilling ? "Carregando histórico…" : "Carregar histórico do mês"}
            </button>
            <button
              onClick={handleBackfillVisits}
              disabled={backfillingVisits}
              title="Pode demorar alguns minutos -- busca visitas dia a dia na API do Mercado Livre"
              className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
            >
              {backfillingVisits ? "Carregando visitas…" : "Carregar visitas do mês"}
            </button>
            <button onClick={handleSync} disabled={syncing} className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60">
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </button>
          </div>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Conta</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Anúncios</th>
                  <th className="px-4 py-2.5 font-medium">Última sincronização</th>
                </tr>
              </thead>
              <tbody>
                {status.accounts.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{account.nickname}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge value={account.status} label={ACCOUNT_STATUS_LABELS[account.status]} />
                    </td>
                    <td className="px-4 py-2.5">{account.listingsCount}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
