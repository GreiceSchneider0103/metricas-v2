"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import type { CalendarListing, LinkedListing } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function ListingDrawer({
  listing,
  month,
  onClose,
  onGoalSaved
}: {
  listing: CalendarListing;
  month: string;
  onClose: () => void;
  onGoalSaved: () => void;
}) {
  const api = useApi();
  const [linked, setLinked] = useState<LinkedListing[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(true);
  const [targetValue, setTargetValue] = useState(String(listing.goal?.monthlyTargetUnits ?? ""));
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ items: LinkedListing[] }>(`/api/v1/sales-map/${listing.listingId}/linked`)
      .then((result) => {
        if (active) setLinked(result.items);
      })
      .catch(() => {
        if (active) setLinked([]);
      })
      .finally(() => {
        if (active) setLoadingLinked(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.listingId]);

  async function handleSaveGoal(event: FormEvent) {
    event.preventDefault();
    setGoalError(null);
    const value = Number(targetValue);
    if (!Number.isFinite(value) || value <= 0) {
      setGoalError("Informe uma meta mensal valida.");
      return;
    }
    setSavingGoal(true);
    try {
      if (listing.goal) {
        await api(`/api/v1/goals/${listing.goal.id}`, { method: "PATCH", body: { targetValue: value } });
      } else {
        await api("/api/v1/goals", {
          method: "POST",
          body: {
            name: `Meta mensal - ${listing.title} - ${month}`,
            metricCode: "units_sold",
            targetValue: value,
            periodStart: `${month}-01`,
            periodEnd: lastDayOfMonth(month),
            listingId: listing.listingId
          }
        });
      }
      onGoalSaved();
    } catch {
      setGoalError("Nao foi possivel salvar a meta.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setCreatingTask(true);
    try {
      await api("/api/v1/tasks", { method: "POST", body: { title: taskTitle, relatedListingId: listing.listingId } });
      setTaskTitle("");
      setTaskCreated(true);
    } catch {
      // silencioso -- botao permanece disponivel pra tentar de novo
    } finally {
      setCreatingTask(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{listing.title}</h2>
            <p className="text-xs text-slate-400">{listing.externalId}</p>
            {listing.sku && <p className="text-xs text-slate-400">SKU: {listing.sku}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge value={listing.status} />
          {listing.abcCurve && <StatusBadge value={`Curva ${listing.abcCurve}`} />}
          {listing.permalink && (
            <a href={listing.permalink} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
              Ver anuncio
            </a>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Pedidos</div>
            <div className="font-semibold text-slate-800">{listing.totals.ordersCount}</div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Unidades</div>
            <div className="font-semibold text-slate-800">{listing.totals.unitsSold}</div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Estoque</div>
            <div className="font-semibold text-slate-800">{listing.currentStock}</div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Dias de estoque</div>
            <div className="font-semibold text-slate-800">{listing.daysOfStock !== null ? listing.daysOfStock.toFixed(1) : "-"}</div>
          </div>
        </div>

        <form onSubmit={handleSaveGoal} className="mb-6 space-y-2 rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Meta mensal (unidades)</h3>
          <p className="text-xs text-slate-400">
            Distribuida igualmente pelos dias do mes -- meta diaria atual:{" "}
            {listing.goal ? listing.goal.dailyTargetUnits.toFixed(1) : "nenhuma"}
          </p>
          <input
            type="number"
            min="1"
            step="1"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          {goalError && <p className="text-xs text-red-600">{goalError}</p>}
          <button
            type="submit"
            disabled={savingGoal}
            className="w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {savingGoal ? "Salvando..." : listing.goal ? "Atualizar meta" : "Definir meta"}
          </button>
        </form>

        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Anuncios vinculados (mesmo SKU)</h3>
          {loadingLinked && <p className="text-xs text-slate-400">Carregando...</p>}
          {!loadingLinked && linked.length === 0 && (
            <p className="text-xs text-slate-400">
              Nenhum vinculo encontrado. Grupos de catalogo/variacoes do Mercado Livre ainda nao sao sincronizados -- so
              anuncios com o mesmo SKU cadastrado aparecem aqui.
            </p>
          )}
          {!loadingLinked && linked.length > 0 && (
            <ul className="space-y-1">
              {linked.map((item) => (
                <li key={item.listingId} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <span className="truncate">{item.title}</span>
                  <StatusBadge value={item.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleCreateTask} className="space-y-2 rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Nova tarefa para este anuncio</h3>
          {taskCreated && <p className="text-xs text-emerald-600">Tarefa criada.</p>}
          <input
            placeholder="Titulo da tarefa"
            value={taskTitle}
            onChange={(e) => {
              setTaskTitle(e.target.value);
              setTaskCreated(false);
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creatingTask || !taskTitle.trim()}
            className="w-full rounded-md border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-60"
          >
            {creatingTask ? "Criando..." : "Criar tarefa"}
          </button>
        </form>
      </div>
    </div>
  );
}
