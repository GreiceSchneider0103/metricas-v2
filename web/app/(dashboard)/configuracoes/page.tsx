"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { PasswordInput } from "@/components/password-input";
import { TeamPanel } from "@/components/settings/team-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { GoalsPanel } from "@/components/settings/goals-panel";

type CompanyDetail = { id: string; name: string; slug: string; created_at: string };

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "equipe", label: "Equipe" },
  { id: "metas", label: "Metas" },
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

      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (password !== confirmPassword) {
      setError("As senhas nao coincidem.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError("Nao foi possivel atualizar a senha.");
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Alterar senha</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Nova senha</label>
          <PasswordInput
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Confirmar senha</label>
          <PasswordInput
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-600">Senha atualizada.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
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
      {tab === "metas" && <GoalsPanel />}
      {tab === "integracoes" && <IntegrationsPanel />}
    </div>
  );
}
