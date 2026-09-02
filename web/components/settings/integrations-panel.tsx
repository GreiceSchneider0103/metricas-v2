"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/auth-context";
import type { IntegrationStatus } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInput, fieldLabel } from "@/lib/ui";

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  connected: "Conectada",
  syncing: "Sincronizando",
  sync_failed: "Falha na sincronização",
  disconnected: "Desconectada"
};

const CONNECT_STEPS = [
  "No topo da tela, selecione a empresa correta no menu suspenso.",
  'Clique em "Configurações" no menu.',
  'Abra a aba "Integrações" (você já está aqui).',
  'Clique em "Conectar conta Mercado Livre" (ou Magalu) abaixo e faça login com a conta da loja.',
  "Aguarde a sincronização automática dos anúncios (roda sozinha a cada poucos minutos).",
  'Após a sincronização concluída, clique em "Carregar histórico do período" (já vem preenchido com os últimos 90 dias).'
];

// Pedido explicito: guia passo a passo pra quem so tem acesso a essa aba
// (conta compartilhada usada so pra conectar contas de varias empresas) --
// mas fica visivel pra qualquer um, e util de qualquer jeito.
function ConnectStepsGuide() {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Como conectar uma conta</h3>
      <ol className="space-y-2">
        {CONNECT_STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5 text-sm text-slate-600">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type ChannelConfig = {
  slug: "mercado-livre" | "magalu";
  label: string;
  connectLabel: string;
  emptyTitle: string;
  syncPath: string;
  backfillOrdersPath: string;
  // Visitas so existe pro Mercado Livre -- a API da Magalu nao tem
  // endpoint equivalente hoje.
  hasVisits: boolean;
};

const MERCADO_LIVRE_CONFIG: ChannelConfig = {
  slug: "mercado-livre",
  label: "Mercado Livre",
  connectLabel: "Conectar conta Mercado Livre",
  emptyTitle: "Nenhuma conta do Mercado Livre conectada ainda",
  syncPath: "/api/v1/jobs/ml-sync",
  backfillOrdersPath: "/api/v1/jobs/orders-backfill",
  hasVisits: true
};

const MAGALU_CONFIG: ChannelConfig = {
  slug: "magalu",
  label: "Magalu",
  connectLabel: "Conectar conta Magalu",
  emptyTitle: "Nenhuma conta da Magalu conectada ainda",
  syncPath: "/api/v1/jobs/magalu-sync",
  backfillOrdersPath: "/api/v1/jobs/magalu-orders-backfill",
  hasVisits: false
};

function IntegrationChannelCard({ channel }: { channel: ChannelConfig }) {
  const api = useApi();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillStage, setBackfillStage] = useState<string | null>(null);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Default: ultimos 90 dias, pra cobrir o que o grafico de "Evolução de
  // vendas" pode exibir.
  const [backfillFrom, setBackfillFrom] = useState(isoDaysAgo(90));
  const [backfillTo, setBackfillTo] = useState(todayIso());

  async function loadStatus() {
    try {
      const result = await api<IntegrationStatus>(`/api/v1/integrations/${channel.slug}`);
      setStatus(result);
    } catch {
      setError(`Não foi possível carregar o status da integração com ${channel.label}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const result = await api<{ authorizationUrl: string }>(`/api/v1/integrations/${channel.slug}/authorize`);
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Não foi possível gerar o link de autorização (${channel.label}).`);
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await api(channel.syncPath, { method: "POST" });
      await loadStatus();
    } catch {
      setError("Falha ao disparar a sincronização.");
    } finally {
      setSyncing(false);
    }
  }

  // Desconectar NAO apaga o historico ja sincronizado -- so para de
  // sincronizar essa conta (limpa os tokens no backend). Reconectar a mesma
  // loja depois reaproveita a mesma conta/historico.
  async function handleDisconnect(accountId: string, nickname: string) {
    if (!window.confirm(`Desconectar a conta "${nickname}"? O histórico já sincronizado é mantido -- você pode reconectar depois.`)) return;
    setError(null);
    try {
      await api(`/api/v1/integrations/${channel.slug}/${accountId}/disconnect`, { method: "POST" });
      await loadStatus();
    } catch {
      setError("Não foi possível desconectar essa conta.");
    }
  }

  // Carga retroativa completa de um periodo escolhido: pedidos -> agregacao
  // diaria (listing_daily_snapshot, que e o que o mapa de vendas/graficos
  // realmente leem) -> visitas (so Mercado Livre).
  async function handleBackfillHistory() {
    setBackfilling(true);
    setBackfillMessage(null);
    setError(null);
    try {
      setBackfillStage("Carregando pedidos…");
      const orders = await api<{ ordersUpserted: number; orderItemsUpserted: number }>(channel.backfillOrdersPath, {
        method: "POST",
        body: { from: backfillFrom, to: backfillTo }
      });
      setBackfillStage("Recalculando métricas diárias…");
      await api("/api/v1/jobs/listing-daily-snapshot-aggregate-range", {
        method: "POST",
        body: { from: backfillFrom, to: backfillTo }
      });
      let visitsSuffix = "";
      if (channel.hasVisits) {
        setBackfillStage("Carregando visitas…");
        const visits = await api<{ listingsUpdated: number }>("/api/v1/jobs/visits-backfill", {
          method: "POST",
          body: { from: backfillFrom, to: backfillTo }
        });
        visitsSuffix = `, ${visits.listingsUpdated} atualizações de visitas`;
      }
      setBackfillMessage(`Período carregado: ${orders.ordersUpserted} pedidos, ${orders.orderItemsUpserted} itens${visitsSuffix}.`);
    } catch {
      setError("Falha ao carregar o histórico do período. Algumas etapas podem ter sido concluídas -- tente de novo.");
    } finally {
      setBackfilling(false);
      setBackfillStage(null);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">{channel.label}</h3>
        <Button onClick={handleConnect} disabled={connecting} size="sm">
          {connecting ? "Gerando link…" : channel.connectLabel}
        </Button>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : !status || status.accounts.length === 0 ? (
        <EmptyState title={channel.emptyTitle} hint="Conecte uma conta para começar a sincronizar." />
      ) : (
        <>
          <Card className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={fieldLabel}>De</label>
                <input type="date" value={backfillFrom} onChange={(e) => setBackfillFrom(e.target.value)} className={fieldInput} />
              </div>
              <div>
                <label className={fieldLabel}>Até</label>
                <input type="date" value={backfillTo} onChange={(e) => setBackfillTo(e.target.value)} className={fieldInput} />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleBackfillHistory}
                disabled={backfilling}
                title="Busca pedidos, recalcula métricas diárias e busca visitas do período -- pode demorar alguns minutos"
              >
                {backfilling ? (backfillStage ?? "Carregando…") : "Carregar histórico do período"}
              </Button>
            </div>
            <button onClick={handleSync} disabled={syncing} className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60">
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </button>
          </Card>
          {backfillMessage && <p className="text-sm text-emerald-600">{backfillMessage}</p>}
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Conta</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Anúncios</th>
                  <th className="px-4 py-2.5 font-medium">Última sincronização</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {status.accounts.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{account.nickname}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge value={account.status} label={ACCOUNT_STATUS_LABELS[account.status]} />
                    </td>
                    <td className="px-4 py-2.5">{account.listingsCount}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {account.status !== "disconnected" && (
                        <button
                          onClick={() => handleDisconnect(account.id, account.nickname)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Desconectar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

export function IntegrationsPanel() {
  return (
    <div className="space-y-6">
      <ConnectStepsGuide />
      <div className="grid gap-6 lg:grid-cols-2">
        <IntegrationChannelCard channel={MERCADO_LIVRE_CONFIG} />
        <IntegrationChannelCard channel={MAGALU_CONFIG} />
      </div>
    </div>
  );
}
