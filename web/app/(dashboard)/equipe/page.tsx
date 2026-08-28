"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi, useAuth } from "@/lib/auth-context";
import type { AccessRequest, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export default function EquipePage() {
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
      setError("Nao foi possivel carregar a equipe.");
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
      setError("Nao foi possivel aprovar esse pedido.");
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
      setError("Nao foi possivel rejeitar esse pedido.");
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
      setError("Nao foi possivel convidar esse usuario.");
    } finally {
      setInviting(false);
    }
  }

  async function toggleActive(member: TeamMember) {
    try {
      await api(`/api/v1/team/${member.userId}`, { method: "PATCH", body: { isActive: !member.isActive } });
      await loadMembers();
    } catch {
      setError("Nao foi possivel atualizar esse membro.");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Equipe</h1>

      {canManage && (
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "adm" | "agente")} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="agente">Agente</option>
              <option value="adm">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {inviting ? "Convidando..." : "Convidar"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {canManage && requests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Solicitacoes pendentes</h2>
          {requests.map((request) => (
            <div key={request.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div>
                <p className="font-medium text-slate-800">{request.fullName ?? "-"}</p>
                <p className="text-xs text-slate-500">{request.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={reviewingId === request.id}
                  onClick={() => handleApprove(request, "agente")}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  Aprovar como agente
                </button>
                <button
                  disabled={reviewingId === request.id}
                  onClick={() => handleApprove(request, "adm")}
                  className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-60"
                >
                  Aprovar como admin
                </button>
                <button
                  disabled={reviewingId === request.id}
                  onClick={() => handleReject(request)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Status</th>
              {canManage && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading &&
              members.map((member) => (
                <tr key={member.membershipId} className="border-t border-slate-100">
                  <td className="px-4 py-2">{member.fullName ?? "-"}</td>
                  <td className="px-4 py-2">{member.email ?? "-"}</td>
                  <td className="px-4 py-2 capitalize">{member.role}</td>
                  <td className="px-4 py-2">
                    <StatusBadge value={member.isActive ? "active" : "closed"} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
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
      </div>
    </div>
  );
}
