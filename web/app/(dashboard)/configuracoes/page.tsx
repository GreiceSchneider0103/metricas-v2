"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { PasswordInput } from "@/components/password-input";
import { TeamPanel } from "@/components/settings/team-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { GoalsPanel } from "@/components/settings/goals-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel } from "@/lib/ui";

type CompanyDetail = { id: string; name: string; slug: string; created_at: string };

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "equipe", label: "Equipe" },
  { id: "metas", label: "Metas" },
  { id: "integracoes", label: "Integrações" }
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
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Empresa</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Nome</dt>
            <dd className="font-medium text-slate-800">{company?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Identificador</dt>
            <dd className="font-medium text-slate-800">{company?.slug ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Seu papel</dt>
            <dd className="font-medium capitalize text-slate-800">{activeCompany?.role ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Sua conta</h2>
        <p className="text-sm text-slate-600">{session?.user.email}</p>
      </Card>

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
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError("Não foi possível atualizar a senha.");
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <Card as="form" onSubmit={handleSubmit}>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Alterar senha</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Nova senha</label>
          <PasswordInput required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel}>Confirmar senha</label>
          <PasswordInput
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={fieldInput}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-600">Senha atualizada.</p>}
      <Button type="submit" size="sm" disabled={submitting} className="mt-3">
        {submitting ? "Salvando…" : "Alterar senha"}
      </Button>
    </Card>
  );
}

export default function ConfiguracoesPage() {
  const { activeCompany, isPlatformAdmin } = useAuth();
  const [tab, setTab] = useState<TabId>("geral");

  // Pedido explicito: uma conta cujo acesso foi restrito so a "Configurações"
  // no todo (ex.: login compartilhado so pra conectar contas do Mercado
  // Livre) tambem so deve ver a sub-aba Integrações aqui dentro -- nao faz
  // sentido essa pessoa enxergar Geral/Equipe/Metas.
  const isConfigOnlyUser =
    !isPlatformAdmin && activeCompany?.allowedTabs?.length === 1 && activeCompany.allowedTabs[0] === "configuracoes";
  const visibleTabs = isConfigOnlyUser ? TABS.filter((item) => item.id === "integracoes") : TABS;

  useEffect(() => {
    if (isConfigOnlyUser && tab !== "integracoes") setTab("integracoes");
  }, [isConfigOnlyUser, tab]);

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" />

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

      {!isConfigOnlyUser && tab === "geral" && <GeralPanel />}
      {!isConfigOnlyUser && tab === "equipe" && <TeamPanel />}
      {!isConfigOnlyUser && tab === "metas" && <GoalsPanel />}
      {tab === "integracoes" && <IntegrationsPanel />}
    </div>
  );
}
