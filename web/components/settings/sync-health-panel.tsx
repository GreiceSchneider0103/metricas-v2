"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { SyncHealth } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";

const PROVIDER_LABELS: Record<SyncHealth["accounts"][number]["provider"], string> = {
  mercado_livre: "Mercado Livre",
  magalu: "Magalu"
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  connected: "Conectada",
  syncing: "Sincronizando",
  sync_failed: "Falha na sincronização",
  disconnected: "Desconectada"
};

const JOB_NAME_LABELS: Record<string, string> = {
  "ml.sync.account": "Sync Mercado Livre",
  "magalu.sync.account": "Sync Magalu",
  "listing_daily_snapshot.aggregate": "Agregação diária",
  "orders.backfill": "Carga de pedidos",
  "magalu.orders.backfill": "Carga de pedidos (Magalu)",
  "alerts.evaluate": "Avaliação de alertas",
  "visits.sync": "Sync de visitas",
  "visits.backfill": "Carga de visitas"
};

const STALE_THRESHOLD_HOURS = 3;
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function freshness(lastSyncedAt: string | null): { label: string; tone: "ok" | "warn" | "bad" } {
  if (!lastSyncedAt) return { label: "Nunca sincronizou", tone: "bad" };
  const ageMs = Date.now() - new Date(lastSyncedAt).getTime();
  const ageMinutes = Math.round(ageMs / 60_000);
  const tone: "ok" | "warn" | "bad" = ageMs >= STALE_THRESHOLD_HOURS * 3_600_000 ? "bad" : ageMinutes > 30 ? "warn" : "ok";
  const label =
    ageMinutes < 1
      ? "agora mesmo"
      : ageMinutes < 60
        ? `há ${ageMinutes} min`
        : ageMinutes < 24 * 60
          ? `há ${Math.round(ageMinutes / 60)}h`
          : `há ${Math.round(ageMinutes / (24 * 60))}d`;
  return { label, tone };
}

const TONE_CLASSES: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600"
};

export function SyncHealthPanel() {
  const api = useApi();
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<SyncHealth>("/api/v1/integrations/sync-health")
      .then((result) => {
        if (active) setHealth(result);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar a saúde da sincronização.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Contas conectadas</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Sincronização automática a cada ~15 min. Uma conta parada há mais de {STALE_THRESHOLD_HOURS}h também gera um alerta em
          Operacional.
        </p>
        <div className="mt-3 space-y-2">
          {loading &&
            Array.from({ length: 2 }).map((_, index) => (
              <Card key={index}>
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          {!loading && error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && health?.accounts.length === 0 && (
            <EmptyState title="Nenhuma conta conectada" hint="Conecte uma conta na aba Integrações." />
          )}
          {!loading &&
            !error &&
            health?.accounts.map((account) => {
              const fresh = freshness(account.lastSyncedAt);
              return (
                <Card key={account.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{account.nickname}</p>
                    <p className="text-xs text-slate-400">{PROVIDER_LABELS[account.provider]}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-xs font-medium ${TONE_CLASSES[fresh.tone]}`}>{fresh.label}</span>
                    <StatusBadge value={account.status} label={ACCOUNT_STATUS_LABELS[account.status] ?? account.status} />
                  </div>
                </Card>
              );
            })}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700">Falhas recentes (últimas 48h)</h2>
        <div className="mt-3 space-y-2">
          {!loading && !error && health?.failures.length === 0 && (
            <EmptyState title="Nenhuma falha registrada" hint="Tudo certo por aqui." />
          )}
          {!loading &&
            !error &&
            health?.failures.map((failure, index) => (
              <Card key={index}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800">{JOB_NAME_LABELS[failure.jobName] ?? failure.jobName}</span>
                  <span className="text-xs text-slate-400">{dateTimeFormat.format(new Date(failure.createdAt))}</span>
                </div>
                {failure.errorMessage && <p className="mt-1 text-xs text-red-600">{failure.errorMessage}</p>}
              </Card>
            ))}
        </div>
      </div>
    </div>
  );
}
