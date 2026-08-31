"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "@/lib/auth-context";
import type { CalendarListing, LinkedListing, ListingTimeseriesResponse, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { VarianceBadge } from "@/components/variance-badge";
import { Button } from "@/components/ui/button";
import { fieldInput } from "@/lib/ui";
import { LISTING_STATUS_LABELS } from "@/lib/labels";

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

const RANGE_OPTIONS = [
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 }
];

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  const [taskAssignedTo, setTaskAssignedTo] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [rangeDays, setRangeDays] = useState(30);
  const [timeseries, setTimeseries] = useState<ListingTimeseriesResponse | null>(null);
  const [loadingTimeseries, setLoadingTimeseries] = useState(true);

  useEffect(() => {
    let active = true;
    api<{ items: LinkedListing[] }>(`/api/v1/sales-map/${listing.listingId}/linked`, {
      query: { from: `${month}-01`, to: lastDayOfMonth(month) }
    })
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
  }, [listing.listingId, month]);

  useEffect(() => {
    let active = true;
    setLoadingTimeseries(true);
    api<ListingTimeseriesResponse>(`/api/v1/sales-map/${listing.listingId}/timeseries`, {
      query: { from: isoDaysAgo(rangeDays), to: todayIso() }
    })
      .then((result) => {
        if (active) setTimeseries(result);
      })
      .catch(() => {
        if (active) setTimeseries(null);
      })
      .finally(() => {
        if (active) setLoadingTimeseries(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.listingId, rangeDays]);

  useEffect(() => {
    api<{ items: TeamMember[] }>("/api/v1/team")
      .then((result) => setMembers(result.items))
      .catch(() => setMembers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveGoal(event: FormEvent) {
    event.preventDefault();
    setGoalError(null);
    const value = Number(targetValue);
    if (!Number.isFinite(value) || value <= 0) {
      setGoalError("Informe uma meta mensal válida.");
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
      setGoalError("Não foi possível salvar a meta.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setCreatingTask(true);
    try {
      await api("/api/v1/tasks", {
        method: "POST",
        body: { title: taskTitle, relatedListingId: listing.listingId, assignedTo: taskAssignedTo || undefined }
      });
      setTaskTitle("");
      setTaskAssignedTo("");
      setTaskCreated(true);
    } catch {
      // silencioso -- botão permanece disponível pra tentar de novo
    } finally {
      setCreatingTask(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="animate-drawer-in h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{listing.title}</h2>
            <p className="text-xs text-slate-400">{listing.externalId}</p>
            {listing.sku && <p className="text-xs text-slate-400">SKU: {listing.sku}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge value={listing.status} label={LISTING_STATUS_LABELS[listing.status]} />
          {listing.abcCurve && <StatusBadge value={`Curva ${listing.abcCurve}`} />}
          {listing.permalink && (
            <a href={listing.permalink} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
              Ver anúncio
            </a>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Pedidos</div>
            <div className="font-semibold text-slate-800">{listing.totals.ordersCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Unidades</div>
            <div className="font-semibold text-slate-800">{listing.totals.unitsSold}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Estoque</div>
            <div className="font-semibold text-slate-800">{listing.currentStock}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Dias de estoque</div>
            <div className="font-semibold text-slate-800">{listing.daysOfStock !== null ? listing.daysOfStock.toFixed(1) : "—"}</div>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Evolução de vendas</h3>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setRangeDays(option.days)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                    rangeDays === option.days ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loadingTimeseries && <p className="text-xs text-slate-400">Carregando…</p>}

          {!loadingTimeseries && timeseries && (
            <>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries.series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="listingUnitsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2f4fc0" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2f4fc0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value: string) => value.slice(-2)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={24} />
                    <Tooltip
                      labelFormatter={(value) => `Dia ${String(value)}`}
                      formatter={(value) => [String(value), "Vendas"]}
                    />
                    <Area type="monotone" dataKey="unitsSold" stroke="#2f4fc0" fill="url(#listingUnitsGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-slate-400">Vendas</div>
                  <div className="font-medium text-slate-700">{timeseries.totals.unitsSold}</div>
                  <VarianceBadge percent={timeseries.variance.unitsSoldPercent} />
                </div>
                <div>
                  <div className="text-slate-400">Receita</div>
                  <div className="font-medium text-slate-700">{currency.format(timeseries.totals.revenue)}</div>
                  <VarianceBadge percent={timeseries.variance.revenuePercent} />
                </div>
                <div>
                  <div className="text-slate-400">Pedidos</div>
                  <div className="font-medium text-slate-700">{timeseries.totals.ordersCount}</div>
                  <VarianceBadge percent={timeseries.variance.ordersCountPercent} />
                </div>
                <div>
                  <div className="text-slate-400">Visitas</div>
                  <div className="font-medium text-slate-700">{timeseries.totals.visits}</div>
                  <VarianceBadge percent={timeseries.variance.visitsPercent} />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Vs. período anterior ({timeseries.previousPeriod.from} a {timeseries.previousPeriod.to})
              </p>
            </>
          )}
        </div>

        <form onSubmit={handleSaveGoal} className="mb-6 space-y-2 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Meta mensal (unidades)</h3>
          <p className="text-xs text-slate-400">
            Distribuída igualmente pelos dias do mês — meta diária atual:{" "}
            {listing.goal ? listing.goal.dailyTargetUnits.toFixed(1) : "nenhuma"}
          </p>
          <input
            type="number"
            min="1"
            step="1"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className={fieldInput}
          />
          {goalError && <p className="text-xs text-red-600">{goalError}</p>}
          <Button type="submit" size="sm" disabled={savingGoal} className="w-full">
            {savingGoal ? "Salvando…" : listing.goal ? "Atualizar meta" : "Definir meta"}
          </Button>
        </form>

        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Anúncios vinculados (mesmo SKU)</h3>
          {loadingLinked && <p className="text-xs text-slate-400">Carregando…</p>}
          {!loadingLinked && linked.length === 0 && (
            <p className="text-xs leading-relaxed text-slate-400">
              Nenhum vínculo encontrado. Grupos de catálogo/variações do Mercado Livre ainda não são sincronizados — só
              anúncios com o mesmo SKU cadastrado aparecem aqui.
            </p>
          )}
          {!loadingLinked && linked.length > 0 && (
            <ul className="space-y-1.5">
              {linked.map((item) => (
                <li key={item.listingId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-700">{item.title}</span>
                    <StatusBadge value={item.status} label={LISTING_STATUS_LABELS[item.status]} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {item.externalId} · {item.unitsSold} {item.unitsSold === 1 ? "venda" : "vendas"}
                    </span>
                    {item.permalink && (
                      <a href={item.permalink} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
                        Ver anúncio
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleCreateTask} className="space-y-2 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Nova tarefa para este anúncio</h3>
          {taskCreated && <p className="text-xs text-emerald-600">Tarefa criada.</p>}
          <input
            placeholder="Título da tarefa"
            value={taskTitle}
            onChange={(e) => {
              setTaskTitle(e.target.value);
              setTaskCreated(false);
            }}
            className={fieldInput}
          />
          <select
            value={taskAssignedTo}
            onChange={(e) => {
              setTaskAssignedTo(e.target.value);
              setTaskCreated(false);
            }}
            className={fieldInput}
          >
            <option value="">Sem responsável</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName ?? member.email}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" size="sm" disabled={creatingTask || !taskTitle.trim()} className="w-full">
            {creatingTask ? "Criando…" : "Criar tarefa"}
          </Button>
        </form>
      </div>
    </div>
  );
}
