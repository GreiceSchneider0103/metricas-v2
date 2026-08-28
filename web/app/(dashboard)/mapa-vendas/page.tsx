"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { SalesMapResponse } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function MapaVendasPage() {
  const api = useApi();
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("revenue");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SalesMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api<SalesMapResponse>("/api/v1/sales-map", {
      query: { from, to, search: search || undefined, status: status || undefined, sort, page, pageSize: 20 }
    })
      .then(setData)
      .catch(() => setError("Nao foi possivel carregar o mapa de vendas."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, search, status, sort, page, api]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize));
  }, [data]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Mapa de vendas</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Ate</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Buscar</label>
          <input
            placeholder="Titulo ou codigo do anuncio"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
            <option value="closed">Fechado</option>
            <option value="under_review">Em revisao</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Ordenar por</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            <option value="revenue">Receita</option>
            <option value="unitsSold">Unidades vendidas</option>
            <option value="ordersCount">Pedidos</option>
            <option value="avgTicket">Ticket medio</option>
            <option value="title">Titulo</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Receita" value={currency.format(data.summary.revenue)} />
          <SummaryCard label="Unidades vendidas" value={String(data.summary.unitsSold)} />
          <SummaryCard label="Pedidos" value={String(data.summary.ordersCount)} />
          <SummaryCard label="Anuncios" value={String(data.summary.listingsCount)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Anuncio</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Preco</th>
              <th className="px-4 py-2 text-right">Estoque</th>
              <th className="px-4 py-2 text-right">Pedidos</th>
              <th className="px-4 py-2 text-right">Unidades</th>
              <th className="px-4 py-2 text-right">Receita</th>
              <th className="px-4 py-2 text-right">Ticket medio</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Nenhum anuncio no periodo selecionado.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((item) => (
                <tr key={item.listingId} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    {item.permalink ? (
                      <a href={item.permalink} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
                        {item.title}
                      </a>
                    ) : (
                      <span className="font-medium">{item.title}</span>
                    )}
                    <div className="text-xs text-slate-400">{item.externalId}</div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge value={item.status} />
                  </td>
                  <td className="px-4 py-2 text-right">{currency.format(item.currentPrice)}</td>
                  <td className="px-4 py-2 text-right">{item.currentStock}</td>
                  <td className="px-4 py-2 text-right">{item.ordersCount}</td>
                  <td className="px-4 py-2 text-right">{item.unitsSold}</td>
                  <td className="px-4 py-2 text-right">{currency.format(item.revenue)}</td>
                  <td className="px-4 py-2 text-right">{item.avgTicket !== null ? currency.format(item.avgTicket) : "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && data.pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Pagina {data.pagination.page} de {totalPages} ({data.pagination.total} anuncios)
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">
              Anterior
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">
              Proxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
