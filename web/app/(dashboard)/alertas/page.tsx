"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { Alert } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

export default function AlertasPage() {
  const api = useApi();
  const { activeCompany } = useAuth();
  const canManage = activeCompany?.role === "master" || activeCompany?.role === "adm";

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function loadAlerts() {
    setLoading(true);
    try {
      const result = await api<{ items: Alert[] }>("/api/v1/alerts", { query: { status: statusFilter || undefined } });
      setAlerts(result.items);
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

  // Cada topico (codigo de alerta) comeca aberto por padrao -- so fecha os
  // que ja existiam quando o usuario clicar pra colapsar. Um topico novo que
  // apareca depois (ex: troca de filtro de status) volta a comecar aberto.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const alert of alerts) next.add(alert.code);
      return next;
    });
  }, [alerts]);

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

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Alertas" description="Sinais automáticos sobre os seus anúncios que precisam de atenção." />

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
        {loading && <p className="text-sm text-slate-400">Carregando…</p>}
        {!loading && groups.length === 0 && <EmptyState title="Nenhum alerta encontrado" hint="Tudo certo por aqui." />}
        {!loading &&
          groups.map((group) => {
            const isOpen = expanded.has(group.code);
            return (
              <div key={group.code} className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.code)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{ALERT_CODE_LABELS[group.code] ?? group.code}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{group.items.length}</span>
                  </span>
                  <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                </button>

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
