"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import type { AppTab, CompanySearchResult, TeamMember, UserMembership } from "@/lib/types";
import { TabCheckboxes } from "@/components/tab-checkboxes";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel } from "@/lib/ui";

export function UserDrawer({
  member,
  isPlatformAdmin,
  canManage,
  onClose,
  onUpdated
}: {
  member: TeamMember;
  isPlatformAdmin: boolean;
  canManage: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const api = useApi();
  const [fullName, setFullName] = useState(member.fullName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [memberships, setMemberships] = useState<UserMembership[] | null>(null);
  const [loadingMemberships, setLoadingMemberships] = useState(isPlatformAdmin);
  const [error, setError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let active = true;
    setLoadingMemberships(true);
    api<{ items: UserMembership[] }>(`/api/v1/team/users/${member.userId}/memberships`)
      .then((result) => {
        if (active) setMemberships(result.items);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as empresas desse usuário.");
      })
      .finally(() => {
        if (active) setLoadingMemberships(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.userId, isPlatformAdmin]);

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    setError(null);
    try {
      await api(`/api/v1/team/users/${member.userId}/profile`, { method: "PATCH", body: { fullName } });
      setNameSaved(true);
      onUpdated();
    } catch {
      setError("Não foi possível salvar o nome.");
    } finally {
      setSavingName(false);
    }
  }

  // Pedido explicito: master/adm poder disparar a redefinicao de senha de
  // outro usuario, sem precisar pedir pra pessoa clicar em "Esqueci minha
  // senha" ela mesma. resetPasswordForEmail e a mesma chamada publica que
  // ja roda na tela de login -- nao precisa de rota nova no backend nem
  // permissao especial, so manda o e-mail de redefinicao de novo.
  async function handleSendPasswordReset() {
    if (!member.email) return;
    setSendingReset(true);
    setError(null);
    setResetSent(false);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(member.email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch {
      setError("Não foi possível enviar o link de redefinição de senha.");
    } finally {
      setSendingReset(false);
    }
  }

  async function updateMembership(
    companyId: string | undefined,
    changes: { role?: "adm" | "agente"; isActive?: boolean; allowedTabs?: AppTab[] }
  ) {
    setError(null);
    try {
      await api(`/api/v1/team/${member.userId}`, { method: "PATCH", body: { ...changes, companyId } });
      if (isPlatformAdmin) {
        const result = await api<{ items: UserMembership[] }>(`/api/v1/team/users/${member.userId}/memberships`);
        setMemberships(result.items);
      }
      onUpdated();
    } catch {
      setError("Não foi possível salvar essa alteração.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose}>
      <div className="animate-drawer-in h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{member.fullName ?? member.email ?? "Usuário"}</h2>
            <p className="text-xs text-slate-400">{member.email}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        {(canManage || isPlatformAdmin) && member.email && (
          <div className="mb-4 flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={handleSendPasswordReset} disabled={sendingReset}>
              {sendingReset ? "Enviando…" : "Enviar redefinição de senha"}
            </Button>
            {resetSent && <span className="text-xs text-emerald-600">Link enviado por e-mail.</span>}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {isPlatformAdmin && (
          <form onSubmit={handleSaveName} className="mb-6 flex items-end gap-2 rounded-lg border border-slate-200 p-4">
            <div className="flex-1">
              <label className={fieldLabel}>Nome</label>
              <input
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setNameSaved(false);
                }}
                className={fieldInput}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingName || fullName === (member.fullName ?? "")}>
              {savingName ? "Salvando…" : "Salvar"}
            </Button>
            {nameSaved && <span className="pb-2 text-xs text-emerald-600">Salvo.</span>}
          </form>
        )}

        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          {isPlatformAdmin ? "Empresas" : "Acesso nesta empresa"}
        </h3>

        {isPlatformAdmin ? (
          <PlatformMembershipsEditor
            memberships={memberships}
            loading={loadingMemberships}
            userEmail={member.email}
            onChange={updateMembership}
            onAdded={async () => {
              const result = await api<{ items: UserMembership[] }>(`/api/v1/team/users/${member.userId}/memberships`);
              setMemberships(result.items);
              onUpdated();
            }}
          />
        ) : (
          <SingleMembershipEditor member={member} canManage={canManage} onChange={(changes) => updateMembership(undefined, changes)} />
        )}
      </div>
    </div>
  );
}

function SingleMembershipEditor({
  member,
  canManage,
  onChange
}: {
  member: TeamMember;
  canManage: boolean;
  onChange: (changes: { role?: "adm" | "agente"; isActive?: boolean; allowedTabs?: AppTab[] }) => void;
}) {
  const [role, setRole] = useState<"adm" | "agente">(member.role === "master" ? "agente" : member.role);
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>(member.allowedTabs);
  const [saving, setSaving] = useState(false);

  const isMaster = member.role === "master";
  const dirty = !isMaster && (role !== member.role || allowedTabs.join(",") !== member.allowedTabs.join(","));

  async function handleSave() {
    setSaving(true);
    try {
      await onChange({ role, allowedTabs });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setSaving(true);
    try {
      await onChange({ isActive: !member.isActive });
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Papel: <span className="font-medium capitalize text-slate-700">{member.role}</span>. Só um admin ou master pode
        editar o acesso de outra pessoa.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <StatusBadge value={member.isActive ? "active" : "closed"} label={member.isActive ? "Ativo" : "Inativo"} />
        {!isMaster && (
          <button onClick={handleToggleActive} disabled={saving} className="text-xs font-medium text-brand-600 hover:underline">
            {member.isActive ? "Desativar" : "Reativar"}
          </button>
        )}
      </div>
      {isMaster ? (
        <p className="text-xs text-slate-400">O papel e as abas de um master não são editáveis por aqui.</p>
      ) : (
        <>
          <div>
            <label className={fieldLabel}>Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "adm" | "agente")} className={fieldInput}>
              <option value="agente">Agente</option>
              <option value="adm">Admin</option>
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Abas liberadas</label>
            <TabCheckboxes value={allowedTabs} onChange={setAllowedTabs} />
          </div>
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </>
      )}
    </div>
  );
}

function PlatformMembershipsEditor({
  memberships,
  loading,
  userEmail,
  onChange,
  onAdded
}: {
  memberships: UserMembership[] | null;
  loading: boolean;
  userEmail: string | null;
  onChange: (companyId: string, changes: { role?: "adm" | "agente"; isActive?: boolean; allowedTabs?: AppTab[] }) => void;
  onAdded: () => void;
}) {
  if (loading) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="space-y-3">
      {(memberships ?? []).map((membership) => (
        <PlatformMembershipCard key={membership.membershipId} membership={membership} onChange={onChange} />
      ))}
      <AddMembershipForm userEmail={userEmail} onAdded={onAdded} />
    </div>
  );
}

function PlatformMembershipCard({
  membership,
  onChange
}: {
  membership: UserMembership;
  onChange: (companyId: string, changes: { role?: "adm" | "agente"; isActive?: boolean; allowedTabs?: AppTab[] }) => void;
}) {
  const [role, setRole] = useState<"adm" | "agente">(membership.role === "master" ? "agente" : membership.role);
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>(membership.allowedTabs);
  const [saving, setSaving] = useState(false);

  const isMaster = membership.role === "master";
  const dirty = !isMaster && (role !== membership.role || allowedTabs.join(",") !== membership.allowedTabs.join(","));

  async function handleSave() {
    setSaving(true);
    try {
      await onChange(membership.companyId, { role, allowedTabs });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setSaving(true);
    try {
      await onChange(membership.companyId, { isActive: !membership.isActive });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-slate-800">{membership.companyName ?? "—"}</p>
        <div className="flex items-center gap-2">
          <StatusBadge value={membership.isActive ? "active" : "closed"} label={membership.isActive ? "Ativo" : "Inativo"} />
          {!isMaster && (
            <button onClick={handleToggleActive} disabled={saving} className="text-xs font-medium text-brand-600 hover:underline">
              {membership.isActive ? "Remover" : "Reativar"}
            </button>
          )}
        </div>
      </div>
      {isMaster ? (
        <p className="text-xs text-slate-400">O papel e as abas de um master não são editáveis por aqui.</p>
      ) : (
        <>
          <div>
            <label className={fieldLabel}>Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "adm" | "agente")} className={fieldInput}>
              <option value="agente">Agente</option>
              <option value="adm">Admin</option>
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Abas liberadas</label>
            <TabCheckboxes value={allowedTabs} onChange={setAllowedTabs} />
          </div>
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </>
      )}
    </div>
  );
}

function AddMembershipForm({ userEmail, onAdded }: { userEmail: string | null; onAdded: () => void }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState<CompanySearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null);
  const [role, setRole] = useState<"adm" | "agente">("agente");
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>(["mapa_vendas", "atividades", "alertas", "configuracoes"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const result = await api<{ items: CompanySearchResult[] }>("/api/v1/companies/search", {
          query: { q: companyQuery || undefined }
        });
        if (active) setCompanyResults(result.items);
      } catch {
        if (active) setCompanyResults([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyQuery, open]);

  async function handleAdd() {
    if (!selectedCompany || !userEmail) return;
    setSubmitting(true);
    setError(null);
    try {
      await api("/api/v1/team/invite", {
        method: "POST",
        body: { email: userEmail, role, allowedTabs, companyId: selectedCompany.id }
      });
      setOpen(false);
      setSelectedCompany(null);
      setCompanyQuery("");
      onAdded();
    } catch {
      setError("Não foi possível adicionar a essa empresa.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        + Adicionar a outra empresa
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
      <div>
        <label className={fieldLabel}>Empresa</label>
        {selectedCompany ? (
          <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm">
            <span className="truncate text-slate-700">{selectedCompany.name}</span>
            <button type="button" onClick={() => setSelectedCompany(null)} className="text-xs font-medium text-brand-700 hover:underline">
              Trocar
            </button>
          </div>
        ) : (
          <div className="relative">
            <input placeholder="Buscar empresa" value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} className={fieldInput} />
            {companyResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-card">
                {companyResults.map((company) => (
                  <li key={company.id}>
                    <button type="button" onClick={() => setSelectedCompany(company)} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">
                      {company.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div>
        <label className={fieldLabel}>Papel</label>
        <select value={role} onChange={(e) => setRole(e.target.value as "adm" | "agente")} className={fieldInput}>
          <option value="agente">Agente</option>
          <option value="adm">Admin</option>
        </select>
      </div>
      <div>
        <label className={fieldLabel}>Abas liberadas</label>
        <TabCheckboxes value={allowedTabs} onChange={setAllowedTabs} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!selectedCompany || submitting} onClick={handleAdd}>
          {submitting ? "Adicionando…" : "Adicionar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
