"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { Goal, GoalProgress } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
          goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} progress={progressByGoal[goal.id]} canManage={canManage} onChanged={loadGoals} />
          ))}
      </div>
    </div>
  );
}

// Edicao e exclusao de uma meta ja criada -- o form do topo so cria. Pedido
// explicito do usuario ("editar, excluir"), backend ja suportava os dois
// (PATCH e DELETE /goals/:id), so faltava a UI.
function GoalCard({
  goal,
  progress,
  canManage,
  onChanged
}: {
  goal: Goal;
  progress?: GoalProgress;
  canManage: boolean;
  onChanged: () => void;
}) {
  const api = useApi();
  const confirm = useConfirm();
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(goal.name);
  const [targetValue, setTargetValue] = useState(String(goal.targetValue));
  const [periodStart, setPeriodStart] = useState(goal.periodStart);
  const [periodEnd, setPeriodEnd] = useState(goal.periodEnd);
  const [status, setStatus] = useState<Goal["status"]>(goal.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const percent = progress?.progressPercent ?? 0;

  function startEditing() {
    setName(goal.name);
    setTargetValue(String(goal.targetValue));
    setPeriodStart(goal.periodStart);
    setPeriodEnd(goal.periodEnd);
    setStatus(goal.status);
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/v1/goals/${goal.id}`, {
        method: "PATCH",
        body: { name, targetValue: Number(targetValue), periodStart, periodEnd, status }
      });
      setEditing(false);
      onChanged();
    } catch {
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = await confirm({
      message: `Excluir a meta "${goal.name}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      danger: true
    });
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/v1/goals/${goal.id}`, { method: "DELETE" });
      showToast("Meta excluída.", "success");
      onChanged();
    } catch {
      setError("Não foi possível excluir essa meta.");
      showToast("Não foi possível excluir essa meta.", "error");
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <Card as="form" onSubmit={handleSave} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className={fieldLabel}>Nome</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
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
          <div>
            <label className={fieldLabel}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])} className={fieldInput}>
              {Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{goal.name}</p>
          <p className="text-xs text-slate-400">
            {METRIC_LABELS[goal.metricCode]} · {goal.periodStart} a {goal.periodEnd}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge value={goal.status} label={GOAL_STATUS_LABELS[goal.status]} />
          {canManage && (
            <>
              <button onClick={startEditing} className="text-xs font-medium text-brand-600 hover:underline">
                Editar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                {deleting ? "Excluindo…" : "Excluir"}
              </button>
            </>
          )}
        </div>
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
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
