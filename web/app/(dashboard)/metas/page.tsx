"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { Goal, GoalProgress } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

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

export default function MetasPage() {
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
      setError("Nao foi possivel carregar as metas.");
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
      setError("Nao foi possivel criar a meta.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Metas</h1>

      {canManage && (
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nome</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Metrica</label>
            <select
              value={metricCode}
              onChange={(e) => setMetricCode(e.target.value as Goal["metricCode"])}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {Object.entries(METRIC_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Meta</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Inicio</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Fim</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {creating ? "Criando..." : "Nova meta"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-400">Carregando...</p>}
        {!loading && goals.length === 0 && <p className="text-sm text-slate-400">Nenhuma meta cadastrada.</p>}
        {!loading &&
          goals.map((goal) => {
            const progress = progressByGoal[goal.id];
            const percent = progress?.progressPercent ?? 0;
            return (
              <div key={goal.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{goal.name}</p>
                    <p className="text-xs text-slate-400">
                      {METRIC_LABELS[goal.metricCode]} - {goal.periodStart} a {goal.periodEnd}
                    </p>
                  </div>
                  <StatusBadge value={goal.status} />
                </div>
                {progress && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {progress.achievedValue.toLocaleString("pt-BR")} / {progress.targetValue.toLocaleString("pt-BR")} ({percent.toFixed(0)}%)
                    </p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
