"use client";

import { useEffect, useState } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import { TeamPanel } from "@/components/settings/team-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";

type CompanyDetail = { id: string; name: string; slug: string; created_at: string };

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "equipe", label: "Equipe" },
  { id: "integracoes", label: "Integracoes" }
] as const;

type TabId = (typeof TABS)[number]["id"];

function GeralPanel() {
  const api = useApi();
  const { activeCompany, session } = useAuth();
  const [company, setCompany] = useState<CompanyDetail | null>(null);

  useEffect(() => {
    api<CompanyDetail>("/api/v1/companies/current")
      .then(setCompany)
      .catch(() => {});
  }, [api, activeCompany?.id]);

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Empresa</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Nome</dt>
            <dd className="font-medium text-slate-800">{company?.name ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Identificador</dt>
            <dd className="font-medium text-slate-800">{company?.slug ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Seu papel</dt>
            <dd className="font-medium capitalize text-slate-800">{activeCompany?.role ?? "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Sua conta</h2>
        <p className="text-sm text-slate-600">{session?.user.email}</p>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const [tab, setTab] = useState<TabId>("geral");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Configuracoes</h1>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === item.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "geral" && <GeralPanel />}
      {tab === "equipe" && <TeamPanel />}
      {tab === "integracoes" && <IntegrationsPanel />}
    </div>
  );
}
