"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
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
  const [tab, setTab] = useState<TabId>("atividades");

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

  return (
    <div className="space-y-6">
      <PageHeader title="Operacional" />

      <div className="flex gap-1 border-b border-slate-200">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === item.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "atividades" && <AtividadesPanel />}
      {tab === "alertas" && <AlertasPanel />}
      {tab === "metas" && <GoalsPanel />}
    </div>
  );
}
