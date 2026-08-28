"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { AccessRequest, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel } from "@/lib/ui";

export function TeamPanel() {
  const api = useApi();
  const { activeCompany } = useAuth();
  const canManage = activeCompany?.role === "master" || activeCompany?.role === "adm";

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
      if (canManage) {
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
  }, [api, canManage]);

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
      await loadMembers();
    } catch {
      setError("Não foi possível rejeitar esse pedido.");
    } finally {
      setReviewingId(null);
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

      {canManage && requests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Solicitações pendentes</h2>
          {requests.map((request) => (
            <Card key={request.id} className="flex items-center justify-between border-amber-200 bg-amber-50/60">
              <div>
                <p className="font-medium text-slate-800">{request.fullName ?? "—"}</p>
                <p className="text-xs text-slate-500">{request.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={reviewingId === request.id} onClick={() => handleApprove(request, "agente")}>
                  Aprovar como agente
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={reviewingId === request.id}
                  onClick={() => handleApprove(request, "adm")}
                >
                  Aprovar como admin
                </Button>
                <Button variant="ghost" size="sm" disabled={reviewingId === request.id} onClick={() => handleReject(request)}>
                  Rejeitar
                </Button>
              </div>
            </Card>
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
