"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { AccessRequest, CompanySearchResult, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel } from "@/lib/ui";

function NewCompanyForm({ onCreated }: { onCreated: () => void }) {
  const api = useApi();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api("/api/v1/companies", { method: "POST", body: { name } });
      setName("");
      setOpen(false);
      onCreated();
    } catch {
      setError("Não foi possível criar a empresa.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        + Nova empresa
      </button>
    );
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label className={fieldLabel}>Nome da nova empresa</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
      </div>
      <Button type="submit" size="sm" disabled={creating}>
        {creating ? "Criando…" : "Criar empresa"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </Card>
  );
}

// Aprovacao de um pedido pelo master de plataforma: escolhe pra qual empresa
// de verdade a pessoa vai (nao fica preso a empresa de onboarding onde o
// pedido caiu). Master/adm comum nunca ve isso -- so aprova pra propria
// empresa (ver PendingRequestCard).
function PlatformAdminApproval({ request, onDone }: { request: AccessRequest; onDone: () => void }) {
  const api = useApi();
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState<CompanySearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null);
  const [role, setRole] = useState<"adm" | "agente">("agente");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [companyQuery]);

  async function handleApprove() {
    if (!selectedCompany) {
      setError("Escolha a empresa de destino.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/v1/team/access-requests/${request.id}/approve`, {
        method: "POST",
        body: { role, companyId: selectedCompany.id }
      });
      onDone();
    } catch {
      setError("Não foi possível aprovar esse pedido.");
      setSubmitting(false);
    }
  }

  async function handleReject() {
    setSubmitting(true);
    try {
      await api(`/api/v1/team/access-requests/${request.id}/reject`, { method: "POST" });
      onDone();
    } catch {
      setError("Não foi possível rejeitar esse pedido.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[180px]">
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
            <input
              placeholder="Buscar empresa"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              className={fieldInput}
            />
            {companyResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-card">
                {companyResults.map((company) => (
                  <li key={company.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCompany(company)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
                    >
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
      <Button size="sm" disabled={submitting} onClick={handleApprove}>
        Aprovar
      </Button>
      <Button variant="ghost" size="sm" disabled={submitting} onClick={handleReject}>
        Rejeitar
      </Button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PendingRequestCard({
  request,
  isPlatformAdmin,
  onApprove,
  onReject,
  onDone,
  reviewing
}: {
  request: AccessRequest;
  isPlatformAdmin: boolean;
  onApprove: (request: AccessRequest, role: "adm" | "agente") => void;
  onReject: (request: AccessRequest) => void;
  onDone: () => void;
  reviewing: boolean;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">{request.fullName ?? "—"}</p>
          <p className="text-xs text-slate-500">{request.email}</p>
        </div>
        {isPlatformAdmin && request.companyName && (
          <span className="text-xs text-slate-400">Pedido em: {request.companyName}</span>
        )}
      </div>
      {isPlatformAdmin ? (
        <PlatformAdminApproval request={request} onDone={onDone} />
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={reviewing} onClick={() => onApprove(request, "agente")}>
            Aprovar como agente
          </Button>
          <Button variant="secondary" size="sm" disabled={reviewing} onClick={() => onApprove(request, "adm")}>
            Aprovar como admin
          </Button>
          <Button variant="ghost" size="sm" disabled={reviewing} onClick={() => onReject(request)}>
            Rejeitar
          </Button>
        </div>
      )}
    </Card>
  );
}

export function TeamPanel() {
  const api = useApi();
  const { activeCompany, isPlatformAdmin } = useAuth();
  const canManage = activeCompany?.role === "master" || activeCompany?.role === "adm";
  const canSeeRequests = canManage || isPlatformAdmin;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"adm" | "agente">("agente");
  const [inviting, setInviting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    try {
      const result = await api<{ items: TeamMember[] }>("/api/v1/team");
      setMembers(result.items);
      if (canSeeRequests) {
        const pending = await api<{ items: AccessRequest[] }>("/api/v1/team/access-requests");
        setRequests(pending.items);
      }
    } catch {
      setError("Não foi possível carregar a equipe.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, canSeeRequests]);

  async function handleApprove(request: AccessRequest, requestedRole: "adm" | "agente") {
    setReviewingId(request.id);
    try {
      await api(`/api/v1/team/access-requests/${request.id}/approve`, { method: "POST", body: { role: requestedRole } });
      await loadMembers();
    } catch {
      setError("Não foi possível aprovar esse pedido.");
    } finally {
      setReviewingId(null);
    }
  }

  async function handleReject(request: AccessRequest) {
    setReviewingId(request.id);
    try {
      await api(`/api/v1/team/access-requests/${request.id}/reject`, { method: "POST" });
    } catch {
      // no-op: se a rejeicao falhou, o recarregamento abaixo mantem o pedido visivel pra tentar de novo
    } finally {
      setReviewingId(null);
      await loadMembers();
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await api("/api/v1/team/invite", { method: "POST", body: { email, role } });
      setEmail("");
      await loadMembers();
    } catch {
      setError("Não foi possível convidar esse usuário.");
    } finally {
      setInviting(false);
    }
  }

  async function toggleActive(member: TeamMember) {
    try {
      await api(`/api/v1/team/${member.userId}`, { method: "PATCH", body: { isActive: !member.isActive } });
      await loadMembers();
    } catch {
      setError("Não foi possível atualizar esse membro.");
    }
  }

  return (
    <div className="space-y-6">
      {isPlatformAdmin && <NewCompanyForm onCreated={loadMembers} />}

      {canManage && (
        <Card as="form" onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className={fieldLabel}>E-mail</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "adm" | "agente")} className={fieldInput}>
              <option value="agente">Agente</option>
              <option value="adm">Admin</option>
            </select>
          </div>
          <Button type="submit" size="sm" disabled={inviting}>
            {inviting ? "Convidando…" : "Convidar"}
          </Button>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {canSeeRequests && requests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">
            {isPlatformAdmin ? "Cadastros pendentes" : "Solicitações pendentes"}
          </h2>
          {requests.map((request) => (
            <PendingRequestCard
              key={request.id}
              request={request}
              isPlatformAdmin={isPlatformAdmin}
              reviewing={reviewingId === request.id}
              onApprove={handleApprove}
              onReject={handleReject}
              onDone={loadMembers}
            />
          ))}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Nome</th>
              <th className="px-4 py-2.5 font-medium">E-mail</th>
              <th className="px-4 py-2.5 font-medium">Papel</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              {canManage && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading &&
              members.map((member) => (
                <tr key={member.membershipId} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">{member.fullName ?? "—"}</td>
                  <td className="px-4 py-2.5">{member.email ?? "—"}</td>
                  <td className="px-4 py-2.5 capitalize">{member.role}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge value={member.isActive ? "active" : "closed"} label={member.isActive ? "Ativo" : "Inativo"} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      {member.role !== "master" && (
                        <button onClick={() => toggleActive(member)} className="text-xs font-medium text-brand-600 hover:underline">
                          {member.isActive ? "Desativar" : "Reativar"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
