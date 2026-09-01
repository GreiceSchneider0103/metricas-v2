"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { CalendarListing, SalesMapCalendarResponse, SalesMapResponse } from "@/lib/types";
import { StatusDot } from "@/components/status-badge";
import { ListingDrawer } from "@/components/listing-drawer";
import { VarianceBadge } from "@/components/variance-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel } from "@/lib/ui";
import { LISTING_STATUS_LABELS, LISTING_TYPE_LABELS, truncateWords } from "@/lib/labels";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

const TREND_ICON: Record<CalendarListing["trend"], string> = { up: "↑", down: "↓", flat: "→" };
const TREND_COLOR: Record<CalendarListing["trend"], string> = {
  up: "text-emerald-600",
  down: "text-red-600",
  flat: "text-slate-400"
};

const ABC_BADGE_COLOR: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-slate-100 text-slate-500"
};

function DayCell({ day }: { day: CalendarListing["days"][number] }) {
  const bg =
    day.targetStatus === "hit"
      ? "bg-emerald-500 text-white"
      : day.targetStatus === "miss"
        ? "bg-red-400 text-white"
        : day.unitsSold > 0
          ? "bg-brand-100 text-brand-800"
          : "bg-slate-50 text-slate-400";

  const tooltip = [
    day.date,
    `Vendas: ${day.unitsSold}`,
    `Visitas: ${day.visits}`,
    day.price !== null ? `Preço: ${currency.format(day.price)}` : "Preço: —"
  ].join("\n");

  return (
    <td className="p-0 text-center align-middle" title={tooltip}>
      {/* Retangulo estreito (nao quadrado) -- "esticado" na vertical em vez
          de largo, pra caber mais dias na largura da tela sem cortar os
          numeros de 2 digitos. */}
      <div className={`relative mx-auto flex h-7 w-4 items-center justify-center rounded text-[9px] font-medium transition-transform hover:scale-110 ${bg}`}>
        {/* Preta em vez de vermelho/verde -- essas cores sumiam em cima do
            fundo emerald-500 (meta batida) ou red-400 (meta perdida), que
            usam praticamente a mesma cor da seta. Preta tem contraste
            garantido em qualquer um dos fundos possíveis da célula. */}
        {day.priceChange === "up" && <span className="absolute -top-1 text-[7px] text-slate-900">&#9650;</span>}
        {day.priceChange === "down" && <span className="absolute -top-1 text-[7px] text-slate-900">&#9660;</span>}
        {day.unitsSold > 0 ? day.unitsSold : ""}
      </div>
    </td>
  );
}

export default function MapaVendasPage() {
  const api = useApi();
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [listingType, setListingType] = useState("");
  const [abcCurve, setAbcCurve] = useState("");
  const [sort, setSort] = useState("revenue");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<SalesMapCalendarResponse | null>(null);
  const [summary, setSummary] = useState<SalesMapResponse["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<CalendarListing | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStage, setRefreshStage] = useState<string | null>(null);

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        search: search || undefined,
        status: status || undefined,
        listingType: listingType || undefined,
        abcCurve: abcCurve || undefined
      };
      const [calendarResult, summaryResult] = await Promise.all([
        api<SalesMapCalendarResponse>("/api/v1/sales-map/calendar", {
          query: { month, sort, page, pageSize: 50, ...filters }
        }),
        api<SalesMapResponse>("/api/v1/sales-map", {
          query: { from: monthStart, to: monthEnd, sort, page: 1, pageSize: 1, ...filters }
        })
      ]);
      setData(calendarResult);
      setSummary(summaryResult.summary);
    } catch {
      setError("Não foi possível carregar o mapa de vendas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, month, search, status, listingType, abcCurve, sort, page]);

  // "Atualizar tudo": sincroniza anuncios (preco/estoque/status atual) e
  // reprocessa pedidos/metricas/visitas so do mes que esta sendo visto na
  // tela -- rapido, pra poder clicar quando quiser sem pesar. O historico de
  // meses anteriores e carga unica (feita uma vez em Configuracoes >
  // Integracoes e ja fica registrada no banco; nao precisa repetir aqui).
  async function handleRefreshAll() {
    setRefreshing(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const from = monthStart;
    const to = monthEnd < today ? monthEnd : today;
    try {
      setRefreshStage("Sincronizando anúncios…");
      await api("/api/v1/jobs/ml-sync", { method: "POST" });
      setRefreshStage("Atualizando pedidos do mês…");
      await api("/api/v1/jobs/orders-backfill", { method: "POST", body: { from, to } });
      setRefreshStage("Recalculando métricas do mês…");
      await api("/api/v1/jobs/listing-daily-snapshot-aggregate-range", { method: "POST", body: { from, to } });
      setRefreshStage("Buscando visitas…");
      await api("/api/v1/jobs/visits-backfill", { method: "POST", body: { from, to } });
      await load();
    } catch {
      setError("Falha ao atualizar os dados. Algumas etapas podem ter sido concluídas -- tente de novo.");
    } finally {
      setRefreshing(false);
      setRefreshStage(null);
    }
  }

  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth(month) }, (_, i) => i + 1), [month]);
  const totalPages = data ? Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize)) : 1;

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapa de vendas"
        description="Vendas, visitas e preço dia a dia por anúncio."
        actions={
          <div className="flex items-center gap-2">
            {refreshStage && <span className="text-xs text-slate-400">{refreshStage}</span>}
            <Button variant="secondary" size="sm" onClick={handleRefreshAll} disabled={refreshing}>
              {refreshing ? "Atualizando…" : "Atualizar tudo"}
            </Button>
          </div>
        }
      />

      <Card className="flex flex-wrap items-end gap-3">
        <div>
          <label className={fieldLabel}>Mês</label>
          <input type="month" value={month} onChange={(e) => resetPage(setMonth)(e.target.value)} className={fieldInput} />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className={fieldLabel}>Buscar</label>
          <input
            placeholder="Título, MLB ou SKU"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className={fieldInput}
          />
        </div>
        <div>
          <label className={fieldLabel}>Status</label>
          <select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} className={fieldInput}>
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
            <option value="closed">Fechado</option>
            <option value="under_review">Em revisão</option>
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Tipo</label>
          <select value={listingType} onChange={(e) => resetPage(setListingType)(e.target.value)} className={fieldInput}>
            <option value="">Todos</option>
            <option value="classic">Clássico</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Curva ABC</label>
          <select value={abcCurve} onChange={(e) => resetPage(setAbcCurve)(e.target.value)} className={fieldInput}>
            <option value="">Todas</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Ordenar por</label>
          <select value={sort} onChange={(e) => resetPage(setSort)(e.target.value)} className={fieldInput}>
            <option value="revenue">Receita</option>
            <option value="unitsSold">Unidades vendidas</option>
            <option value="ordersCount">Pedidos</option>
            <option value="avgTicket">Ticket médio</option>
            <option value="title">Título</option>
          </select>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Receita" value={currency.format(summary.revenue)} variance={summary.variance.revenuePercent} />
          <SummaryCard label="Unidades vendidas" value={String(summary.unitsSold)} variance={summary.variance.unitsSoldPercent} />
          <SummaryCard label="Pedidos" value={String(summary.ordersCount)} variance={summary.variance.ordersCountPercent} />
          <SummaryCard label="Visitas" value={String(summary.visits)} variance={summary.variance.visitsPercent} />
          <SummaryCard label="Conversão" value={summary.conversionRate !== null ? percent.format(summary.conversionRate) : "—"} />
          <SummaryCard label="Anúncios" value={String(summary.listingsCount)} />
        </div>
      )}
      {summary && (
        <p className="text-xs text-slate-400">
          Variação vs. período anterior ({summary.previousPeriod.from} a {summary.previousPeriod.to})
        </p>
      )}

      {/* Pedido explicito: caber tudo sem rolagem horizontal -- tabela bem
          mais compacta (fonte, paddings e celulas de dia menores) do que o
          resto do app, so aqui, porque sao ~46 colunas na mesma tela. */}
      <Card className="overflow-x-auto p-0">
        <table className="text-xs">
          <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-2 py-2 font-medium">Anúncio</th>
              {dayNumbers.map((day) => (
                <th key={day} className="px-0 py-2 text-center font-normal">
                  {day}
                </th>
              ))}
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Vendas</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Média</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Meta</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Pedidos</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Visitas</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Receita</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Ticket médio</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Estoque</th>
              <th className="px-0.5 py-2 text-right text-[11px] font-medium">Dias estoque</th>
              <th className="px-0.5 py-2 text-center text-[11px] font-medium">Tend.</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={dayNumbers.length + 11} className="px-4 py-6 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={dayNumbers.length + 11} className="px-4 py-6 text-center text-slate-400">
                  Nenhum anúncio encontrado.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((item) => (
                <tr key={item.listingId} className="group border-t border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1.5 group-hover:bg-slate-50">
                    <div className="flex items-center gap-1">
                      {item.hasOpenTask && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-orange-500"
                          title="Tem atividade/tarefa em aberto vinculada"
                        />
                      )}
                      {item.abcCurve && (
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold ${ABC_BADGE_COLOR[item.abcCurve] ?? "bg-slate-100 text-slate-500"}`}
                          title={`Curva ${item.abcCurve}`}
                        >
                          {item.abcCurve}
                        </span>
                      )}
                      <button
                        onClick={() => setSelectedListing(item)}
                        title={item.title}
                        className="block max-w-[140px] truncate text-left font-medium text-brand-700 hover:underline"
                      >
                        {truncateWords(item.title, 4)}
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                      <StatusDot value={item.status} label={LISTING_STATUS_LABELS[item.status]} />
                      <span
                        className="max-w-[150px] truncate"
                        title={`${item.externalId}${item.sku ? ` · SKU ${item.sku}` : ""}${item.listingType ? ` · ${LISTING_TYPE_LABELS[item.listingType] ?? item.listingType}` : ""}`}
                      >
                        {item.externalId}
                        {item.sku ? ` · SKU ${item.sku}` : ""}
                        {item.listingType ? ` · ${LISTING_TYPE_LABELS[item.listingType] ?? item.listingType}` : ""}
                      </span>
                    </div>
                  </td>
                  {item.days.map((day) => (
                    <DayCell key={day.date} day={day} />
                  ))}
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{item.totals.unitsSold}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{item.avgDailyUnits.toFixed(1)}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{item.goal ? item.goal.monthlyTargetUnits : "—"}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{item.totals.ordersCount}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{item.totals.visits}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{currency.format(item.totals.revenue)}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">
                    {item.avgTicket !== null ? currency.format(item.avgTicket) : "—"}
                  </td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">{item.currentStock}</td>
                  <td className="px-0.5 py-1.5 text-right text-[11px]">
                    {item.daysOfStock !== null ? item.daysOfStock.toFixed(1) : "—"}
                  </td>
                  <td className={`px-0.5 py-1.5 text-center text-[11px] font-semibold ${TREND_COLOR[item.trend]}`}>
                    {TREND_ICON[item.trend]}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      {data && data.pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Página {data.pagination.page} de {totalPages} ({data.pagination.total} anúncios)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      {selectedListing && (
        <ListingDrawer
          listing={selectedListing}
          month={month}
          onClose={() => setSelectedListing(null)}
          onGoalSaved={() => {
            setSelectedListing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, variance }: { label: string; value: string; variance?: number | null }) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight text-slate-900">{value}</span>
        {variance !== undefined && <VarianceBadge percent={variance} />}
      </div>
    </Card>
  );
}
