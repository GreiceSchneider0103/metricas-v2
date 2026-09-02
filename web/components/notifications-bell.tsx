"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/auth-context";
import type { NotificationItem, Paginated } from "@/lib/types";

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const PAGE_SIZE = 10;

export function NotificationsBell() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api<{ count: number }>("/api/v1/notifications/unread-count")
      .then((result) => setUnreadCount(result.count))
      .catch(() => {});
  }, [api]);

  async function handleOpen() {
    setOpen((value) => !value);
    if (!loaded) {
      try {
        const result = await api<Paginated<NotificationItem>>("/api/v1/notifications", { query: { page: 1, pageSize: PAGE_SIZE } });
        setItems(result.items);
        setHasMore(result.pagination.page * result.pagination.pageSize < result.pagination.total);
        setPage(1);
        setLoaded(true);
      } catch {
        // silencioso -- o sino continua clicável, só não populam itens
      }
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await api<Paginated<NotificationItem>>("/api/v1/notifications", { query: { page: nextPage, pageSize: PAGE_SIZE } });
      setItems((current) => [...current, ...result.items]);
      setHasMore(result.pagination.page * result.pagination.pageSize < result.pagination.total);
      setPage(nextPage);
    } catch {
      // silencioso -- tenta de novo no proximo clique
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleMarkAllRead() {
    try {
      await api("/api/v1/notifications/read-all", { method: "PATCH" });
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silencioso -- o sino continua clicável, só não marcam como lidas
    }
  }

  // Marca como lida ao clicar (link ou não) -- não bloqueia a navegação em
  // si, só dispara a chamada em paralelo.
  function handleItemClick(item: NotificationItem) {
    if (item.isRead) return;
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));
    setUnreadCount((count) => Math.max(0, count - 1));
    api(`/api/v1/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => {});
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notificações"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2a1 1 0 00-1 1v.1A6.002 6.002 0 004 9v3.586l-1.293 1.293A1 1 0 003.414 15.5h13.172a1 1 0 00.707-1.707L16 12.586V9a6.002 6.002 0 00-5-5.9V2a1 1 0 00-1-1z" />
          <path d="M8.5 17a1.5 1.5 0 003 0h-3z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-medium text-slate-800">Notificações</span>
            <button onClick={handleMarkAllRead} className="text-xs font-medium text-brand-600 hover:underline">
              Marcar todas como lidas
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Sem notificações</p>}
            {items.map((item) => {
              const rowClasses = `block border-b border-slate-50 px-4 py-3 text-sm transition-colors hover:bg-slate-50 ${
                item.isRead ? "text-slate-400" : "text-slate-700"
              }`;
              const content = (
                <>
                  <p className="font-medium">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-xs">{item.body}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{dateTimeFormat.format(new Date(item.createdAt))}</p>
                </>
              );

              if (!item.link) {
                return (
                  <div key={item.id} className={rowClasses} onClick={() => handleItemClick(item)}>
                    {content}
                  </div>
                );
              }

              // Link externo (ex: anuncio no Mercado Livre) abre em nova aba;
              // link interno (ex: /operacional) navega dentro do proprio app.
              if (item.link.startsWith("http")) {
                return (
                  <a
                    key={item.id}
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className={rowClasses}
                    onClick={() => handleItemClick(item)}
                  >
                    {content}
                  </a>
                );
              }

              return (
                <Link key={item.id} href={item.link} className={rowClasses} onClick={() => handleItemClick(item)}>
                  {content}
                </Link>
              );
            })}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="block w-full px-4 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50 hover:underline disabled:opacity-60"
              >
                {loadingMore ? "Carregando…" : "Carregar mais"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
