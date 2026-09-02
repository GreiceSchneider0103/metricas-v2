"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import { AtividadesPanel } from "@/components/operational/atividades-panel";
import { AlertasPanel } from "@/components/operational/alertas-panel";
import { GoalsPanel } from "@/components/settings/goals-panel";
import { PageHeader } from "@/components/ui/page-header";
import type { AppTab } from "@/lib/types";

const TABS = [
  { id: "atividades", label: "Atividades", tab: "atividades" as AppTab | null },
  { id: "alertas", label: "Alertas", tab: "alertas" as AppTab | null },
  { id: "metas", label: "Metas", tab: null }
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function OperacionalPage() {
  const { activeCompany, isPlatformAdmin } = useAuth();
  const api = useApi();
  const [tab, setTab] = useState<TabId>("atividades");
  const [openTasksCount, setOpenTasksCount] = useState<number | null>(null);
  const [openAlertsCount, setOpenAlertsCount] = useState<number | null>(null);

  // Atividades e Alertas seguem gated pela permissao de cada um
  // (allowedTabs); Metas nao tem permissao propria -- fica visivel sempre
  // que a pessoa consegue abrir a pagina Operacional (mesma regra que ja
  // valia quando Metas vivia dentro de Configuracoes).
  const allowedTabs = activeCompany?.allowedTabs;
  const visibleTabs = TABS.filter((item) => {
    if (!item.tab) return true;
    if (isPlatformAdmin) return true;
    return allowedTabs ? allowedTabs.includes(item.tab) : true;
  });

  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab) && visibleTabs[0]) {
      setTab(visibleTabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs.map((item) => item.id).join(",")]);

  // Contadores das sub-abas: leves (so um count exato, sem trazer linhas) e
  // recarregados sempre que a pessoa troca de aba, ja que as acoes que
  // mudam esses numeros (resolver tarefa/alerta) acontecem dentro delas.
  const reloadCounts = useCallback(() => {
    if (visibleTabs.some((item) => item.id === "atividades")) {
      api<{ count: number }>("/api/v1/tasks/open-count")
        .then((result) => setOpenTasksCount(result.count))
        .catch(() => setOpenTasksCount(null));
    }
    if (visibleTabs.some((item) => item.id === "alertas")) {
      api<{ pagination: { total: number } }>("/api/v1/alerts", { query: { status: "open", pageSize: 1 } })
        .then((result) => setOpenAlertsCount(result.pagination.total))
        .catch(() => setOpenAlertsCount(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    reloadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, api]);

  return (
    <div className="space-y-6">
      <PageHeader title="Operacional" />

      <div className="flex gap-1 border-b border-slate-200">
        {visibleTabs.map((item) => {
          const count = item.id === "atividades" ? openTasksCount : item.id === "alertas" ? openAlertsCount : null;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
              {!!count && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    tab === item.id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "atividades" && <AtividadesPanel onDataChanged={reloadCounts} />}
      {tab === "alertas" && <AlertasPanel onDataChanged={reloadCounts} />}
      {tab === "metas" && <GoalsPanel />}
    </div>
  );
}
