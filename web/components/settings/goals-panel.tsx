"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { Goal, GoalProgress } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInput, fieldLabel } from "@/lib/ui";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function endOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

const METRIC_LABELS: Record<Goal["metricCode"], string> = {
  revenue: "Receita",
  units_sold: "Unidades vendidas",
  orders_count: "Pedidos",
  visits: "Visitas"
};

const GOAL_STATUS_LABELS: Record<Goal["status"], string> = {
  active: "Ativa",
  achieved: "Atingida",
  missed: "Não atingida",
  cancelled: "Cancelada"
};

export function GoalsPanel() {
  const api = useApi();
  const { activeCompany } = useAuth();
  const canManage = activeCompany?.role === "master" || activeCompany?.role === "adm";

  const [goals, setGoals] = useState<Goal[]>([]);
  const [progressByGoal, setProgressByGoal] = useState<Record<string, GoalProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [metricCode, setMetricCode] = useState<Goal["metricCode"]>("revenue");
  const [targetValue, setTargetValue] = useState("");
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(endOfMonthIso());
  const [creating, setCreating] = useState(false);

  async function loadGoals() {
    setLoading(true);
    try {
      const result = await api<{ items: Goal[] }>("/api/v1/goals");
      setGoals(result.items);
      const progressEntries = await Promise.all(
        result.items.map(async (goal) => {
          try {
            const progress = await api<GoalProgress>(`/api/v1/goals/${goal.id}/progress`);
            return [goal.id, progress] as const;
          } catch {
            return null;
          }
        })
      );
      setProgressByGoal(
        Object.fromEntries(progressEntries.filter((entry): entry is [string, GoalProgress] => entry !== null))
      );
    } catch {
      setError("Não foi possível carregar as metas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api("/api/v1/goals", {
        method: "POST",
        body: { name, metricCode, targetValue: Number(targetValue), periodStart, periodEnd }
      });
      setName("");
      setTargetValue("");
      await loadGoals();
    } catch {
      setError("Não foi possível criar a meta.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {canManage && (
        <Card as="form" onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className={fieldLabel}>Nome</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>Métrica</label>
            <select value={metricCode} onChange={(e) => setMetricCode(e.target.value as Goal["metricCode"])} className={fieldInput}>
              {Object.entries(METRIC_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Meta</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className={`w-28 ${fieldInput}`}
            />
          </div>
          <div>
            <label className={fieldLabel}>Início</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>Fim</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={fieldInput} />
          </div>
          <Button type="submit" size="sm" disabled={creating}>
            {creating ? "Criando…" : "Nova meta"}
          </Button>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-400">Carregando…</p>}
        {!loading && goals.length === 0 && <EmptyState title="Nenhuma meta cadastrada" hint="Crie a primeira meta acima." />}
        {!loading &&
          goals.map((goal) => {
            const progress = progressByGoal[goal.id];
            const percent = progress?.progressPercent ?? 0;
            return (
              <Card key={goal.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{goal.name}</p>
                    <p className="text-xs text-slate-400">
                      {METRIC_LABELS[goal.metricCode]} · {goal.periodStart} a {goal.periodEnd}
                    </p>
                  </div>
                  <StatusBadge value={goal.status} label={GOAL_STATUS_LABELS[goal.status]} />
                </div>
                {progress && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {progress.achievedValue.toLocaleString("pt-BR")} / {progress.targetValue.toLocaleString("pt-BR")} ({percent.toFixed(0)}%)
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
