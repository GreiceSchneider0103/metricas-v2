"use client";

import { useEffect, useState } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { Alert } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

const STATUS_FILTERS = ["open", "resolved", "muted", ""] as const;

export default function AlertasPage() {
  const api = useApi();
  const { activeCompany } = useAuth();
  const canManage = activeCompany?.role === "master" || activeCompany?.role === "adm";

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAlerts() {
    setLoading(true);
    try {
      const result = await api<{ items: Alert[] }>("/api/v1/alerts", { query: { status: statusFilter || undefined } });
      setAlerts(result.items);
    } catch {
      setError("Nao foi possivel carregar os alertas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleUpdateStatus(alert: Alert, status: Alert["status"]) {
    try {
      await api(`/api/v1/alerts/${alert.id}`, { method: "PATCH", body: { status } });
      await loadAlerts();
    } catch {
      setError("Nao foi possivel atualizar esse alerta.");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Alertas</h1>

      <div className="flex items-center gap-2 text-sm">
        {STATUS_FILTERS.map((option) => (
          <button
            key={option || "all"}
            onClick={() => setStatusFilter(option)}
            className={`rounded-full px-3 py-1 ${statusFilter === option ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}
          >
            {option === "" ? "Todos" : option}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Carregando...</p>}
        {!loading && alerts.length === 0 && <p className="text-sm text-slate-400">Nenhum alerta encontrado.</p>}
        {!loading &&
          alerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-800">{alert.title}</p>
                  <StatusBadge value={alert.severity} />
                </div>
                {alert.description && <p className="mt-1 text-sm text-slate-500">{alert.description}</p>}
                <p className="mt-1 text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString("pt-BR")}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge value={alert.status} />
                {canManage && alert.status !== "resolved" && (
                  <button onClick={() => handleUpdateStatus(alert, "resolved")} className="text-xs font-medium text-brand-600 hover:underline">
                    Resolver
                  </button>
                )}
                {canManage && alert.status === "open" && (
                  <button onClick={() => handleUpdateStatus(alert, "muted")} className="text-xs font-medium text-slate-500 hover:underline">
                    Silenciar
                  </button>
                )}
                {canManage && alert.status !== "open" && (
                  <button onClick={() => handleUpdateStatus(alert, "open")} className="text-xs font-medium text-slate-500 hover:underline">
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
