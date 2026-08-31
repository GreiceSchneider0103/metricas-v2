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
    <td className="p-0.5 text-center align-middle" title={tooltip}>
      <div className={`relative flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium transition-transform hover:scale-110 ${bg}`}>
        {day.priceChange === "up" && <span className="absolute -top-1 text-[9px] text-red-600">&#9650;</span>}
        {day.priceChange === "down" && <span className="absolute -top-1 text-[9px] text-emerald-600">&#9660;</span>}
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
      <PageHeader title="Mapa de vendas" description="Vendas, visitas e preço dia a dia por anúncio." />

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

      <Card className="overflow-x-auto p-0">
        <table className="text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-4 py-2.5 font-medium">Anúncio</th>
              <th className="px-2 py-2.5 font-medium">ABC</th>
              <th className="px-2 py-2.5 font-medium">Status</th>
              <th className="px-2 py-2.5 font-medium">Tipo</th>
              {dayNumbers.map((day) => (
                <th key={day} className="px-0.5 py-2.5 text-center font-normal">
                  {day}
                </th>
              ))}
              <th className="px-2 py-2.5 text-right font-medium">Vendas</th>
              <th className="px-2 py-2.5 text-right font-medium">Média</th>
              <th className="px-2 py-2.5 text-right font-medium">Meta</th>
              <th className="px-2 py-2.5 text-right font-medium">%</th>
              <th className="px-2 py-2.5 text-right font-medium">Pedidos</th>
              <th className="px-2 py-2.5 text-right font-medium">Visitas</th>
              <th className="px-2 py-2.5 text-right font-medium">Receita</th>
              <th className="px-2 py-2.5 text-right font-medium">Ticket médio</th>
              <th className="px-2 py-2.5 text-right font-medium">Estoque</th>
              <th className="px-2 py-2.5 text-right font-medium">Dias estoque</th>
              <th className="px-2 py-2.5 text-center font-medium">Tend.</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={dayNumbers.length + 14} className="px-4 py-6 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={dayNumbers.length + 14} className="px-4 py-6 text-center text-slate-400">
                  Nenhum anúncio encontrado.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((item) => (
                <tr key={item.listingId} className="group border-t border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-2 group-hover:bg-slate-50">
                    <button
                      onClick={() => setSelectedListing(item)}
                      title={item.title}
                      className="block max-w-[220px] truncate text-left font-medium text-brand-700 hover:underline"
                    >
                      {truncateWords(item.title, 4)}
                    </button>
                    <div className="text-xs text-slate-400">
                      {item.externalId}
                      {item.sku ? ` · SKU ${item.sku}` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">{item.abcCurve ?? "—"}</td>
                  <td className="px-2 py-2">
                    <StatusDot value={item.status} label={LISTING_STATUS_LABELS[item.status]} />
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">
                    {item.listingType ? (LISTING_TYPE_LABELS[item.listingType] ?? item.listingType) : "—"}
                  </td>
                  {item.days.map((day) => (
                    <DayCell key={day.date} day={day} />
                  ))}
                  <td className="px-2 py-2 text-right">{item.totals.unitsSold}</td>
                  <td className="px-2 py-2 text-right">{item.avgDailyUnits.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">{item.goal ? item.goal.monthlyTargetUnits : "—"}</td>
                  <td className="px-2 py-2 text-right">
                    {item.goal?.progressPercent !== null && item.goal?.progressPercent !== undefined ? (
                      <span className={item.goal.progressPercent >= 100 ? "font-medium text-emerald-600" : "text-slate-600"}>
                        {item.goal.progressPercent.toFixed(0)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">{item.totals.ordersCount}</td>
                  <td className="px-2 py-2 text-right">{item.totals.visits}</td>
                  <td className="px-2 py-2 text-right">{currency.format(item.totals.revenue)}</td>
                  <td className="px-2 py-2 text-right">{item.avgTicket !== null ? currency.format(item.avgTicket) : "—"}</td>
                  <td className="px-2 py-2 text-right">{item.currentStock}</td>
                  <td className="px-2 py-2 text-right">{item.daysOfStock !== null ? item.daysOfStock.toFixed(1) : "—"}</td>
                  <td className={`px-2 py-2 text-center font-semibold ${TREND_COLOR[item.trend]}`}>{TREND_ICON[item.trend]}</td>
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
