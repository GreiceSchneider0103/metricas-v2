"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { Alert } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ALERT_CODE_LABELS } from "@/lib/labels";

const STATUS_FILTERS = ["open", "resolved", "muted", ""] as const;

const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  open: "Aberto",
  resolved: "Resolvido",
  muted: "Silenciado",
  "": "Todos"
};

const SEVERITY_LABELS: Record<Alert["severity"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica"
};

const ALERT_STATUS_LABELS: Record<Alert["status"], string> = {
  open: "Aberto",
  resolved: "Resolvido",
  muted: "Silenciado"
};

export function AlertasPanel({ onDataChanged }: { onDataChanged?: () => void } = {}) {
  const api = useApi();
  const showToast = useToast();
  const { activeCompany } = useAuth();
  const canManage = activeCompany?.role === "master" || activeCompany?.role === "adm";

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkResolving, setBulkResolving] = useState<Set<string>>(new Set());

  async function loadAlerts() {
    setLoading(true);
    try {
      const result = await api<{ items: Alert[] }>("/api/v1/alerts", { query: { status: statusFilter || undefined } });
      setAlerts(result.items);
      onDataChanged?.();
    } catch {
      setError("Não foi possível carregar os alertas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, api]);

  function toggleGroup(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const groups = useMemo(() => {
    const byCode = new Map<string, Alert[]>();
    for (const alert of alerts) {
      const list = byCode.get(alert.code) ?? [];
      list.push(alert);
      byCode.set(alert.code, list);
    }
    return Array.from(byCode.entries()).map(([code, items]) => ({ code, items }));
  }, [alerts]);

  async function handleUpdateStatus(alert: Alert, status: Alert["status"]) {
    try {
      await api(`/api/v1/alerts/${alert.id}`, { method: "PATCH", body: { status } });
      await loadAlerts();
    } catch {
      setError("Não foi possível atualizar esse alerta.");
    }
  }

  // Resolve em lote os alertas ainda abertos/silenciados de um grupo -- util
  // quando o mesmo problema (ex: "estoque zerado") gerou dezenas de alertas
  // e a pessoa ja resolveu a causa raiz, um por um seria inviavel.
  async function handleBulkResolve(group: { code: string; items: Alert[] }) {
    const pending = group.items.filter((alert) => alert.status !== "resolved");
    if (pending.length === 0) return;
    setBulkResolving((prev) => new Set(prev).add(group.code));
    try {
      await Promise.all(pending.map((alert) => api(`/api/v1/alerts/${alert.id}`, { method: "PATCH", body: { status: "resolved" } })));
      await loadAlerts();
      showToast(`${pending.length} alertas resolvidos.`, "success");
    } catch {
      setError("Não foi possível resolver todos os alertas desse grupo.");
      showToast("Não foi possível resolver todos os alertas desse grupo.", "error");
    } finally {
      setBulkResolving((prev) => {
        const next = new Set(prev);
        next.delete(group.code);
        return next;
      });
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-1 text-sm">
        {STATUS_FILTERS.map((option) => (
          <button
            key={option || "all"}
            onClick={() => setStatusFilter(option)}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              statusFilter === option ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {STATUS_FILTER_LABELS[option]}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        {!loading && groups.length === 0 && <EmptyState title="Nenhum alerta encontrado" hint="Tudo certo por aqui." />}
        {!loading &&
          groups.map((group) => {
            const isOpen = expanded.has(group.code);
            const pendingCount = group.items.filter((alert) => alert.status !== "resolved").length;
            const isBulkResolving = bulkResolving.has(group.code);
            return (
              <div key={group.code} className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
                <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
                  <button type="button" onClick={() => toggleGroup(group.code)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="font-medium text-slate-800">{ALERT_CODE_LABELS[group.code] ?? group.code}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{group.items.length}</span>
                    <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {canManage && pendingCount > 1 && (
                    <button
                      type="button"
                      onClick={() => handleBulkResolve(group)}
                      disabled={isBulkResolving}
                      className="shrink-0 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                    >
                      {isBulkResolving ? "Resolvendo…" : `Resolver todos (${pendingCount})`}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-2 border-t border-slate-100 p-3">
                    {group.items.map((alert) => (
                      <Card key={alert.id} className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800">{alert.title}</p>
                            <StatusBadge value={alert.severity} label={SEVERITY_LABELS[alert.severity]} />
                          </div>
                          {alert.description && <p className="mt-1 text-sm text-slate-500">{alert.description}</p>}
                          {(alert.listingExternalId || alert.listingSku) && (
                            <p className="mt-1 text-xs text-slate-400">
                              {alert.listingExternalId && <>MLB: {alert.listingExternalId}</>}
                              {alert.listingExternalId && alert.listingSku && " · "}
                              {alert.listingSku && <>SKU: {alert.listingSku}</>}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString("pt-BR")}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge value={alert.status} label={ALERT_STATUS_LABELS[alert.status]} />
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
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
