"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { NotificationItem, Paginated } from "@/lib/types";

export function NotificationsBell() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ count: number }>("/api/v1/notifications/unread-count")
      .then((result) => setUnreadCount(result.count))
      .catch(() => {});
  }, [api]);

  async function handleOpen() {
    setOpen((value) => !value);
    if (!loaded) {
      try {
        const result = await api<Paginated<NotificationItem>>("/api/v1/notifications", { query: { pageSize: 10 } });
        setItems(result.items);
        setLoaded(true);
      } catch {
        // silencioso -- o sino continua clicavel, so nao populam itens
      }
    }
  }

  async function handleMarkAllRead() {
    await api("/api/v1/notifications/read-all", { method: "PATCH" });
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  }

  return (
    <div className="relative">
      <button onClick={handleOpen} className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Notificacoes">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-sm font-medium">Notificacoes</span>
            <button onClick={handleMarkAllRead} className="text-xs text-brand-600 hover:underline">
              Marcar todas como lidas
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Sem notificacoes</p>}
            {items.map((item) => (
              <div key={item.id} className={`border-b border-slate-50 px-4 py-3 text-sm ${item.isRead ? "text-slate-400" : "text-slate-700"}`}>
                <p className="font-medium">{item.title}</p>
                {item.body && <p className="text-xs">{item.body}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
