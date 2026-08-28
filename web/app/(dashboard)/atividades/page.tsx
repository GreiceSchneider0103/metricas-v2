"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import type { Task, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInput, fieldLabel } from "@/lib/ui";

const STATUS_OPTIONS: Task["status"][] = ["todo", "in_progress", "waiting", "done", "cancelled"];
const PRIORITY_OPTIONS: Task["priority"][] = ["low", "medium", "high", "critical"];

const STATUS_LABELS: Record<Task["status"], string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  done: "Concluída",
  cancelled: "Cancelada"
};

const PRIORITY_LABELS: Record<Task["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica"
};

type ListingOption = { listingId: string; externalId: string; title: string };

export default function AtividadesPage() {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [listingQuery, setListingQuery] = useState("");
  const [listingResults, setListingResults] = useState<ListingOption[]>([]);
  const [selectedListing, setSelectedListing] = useState<ListingOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [showMore, setShowMore] = useState(false);

  async function loadTasks() {
    setLoading(true);
    try {
      const result = await api<{ items: Task[] }>("/api/v1/tasks", { query: { status: statusFilter || undefined } });
      setTasks(result.items);
    } catch {
      setError("Não foi possível carregar as tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    api<{ items: TeamMember[] }>("/api/v1/team")
      .then((result) => setMembers(result.items))
      .catch(() => setMembers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, api]);

  useEffect(() => {
    if (selectedListing || listingQuery.trim().length < 2) {
      setListingResults([]);
      return;
    }
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const result = await api<{ items: ListingOption[] }>("/api/v1/sales-map/lookup", { query: { q: listingQuery } });
        if (active) setListingResults(result.items);
      } catch {
        if (active) setListingResults([]);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingQuery, selectedListing]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
    setAssignedTo("");
    setSelectedListing(null);
    setListingQuery("");
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api("/api/v1/tasks", {
        method: "POST",
        body: {
          title,
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          assignedTo: assignedTo || undefined,
          relatedListingId: selectedListing?.listingId
        }
      });
      resetForm();
      await loadTasks();
    } catch {
      setError("Não foi possível criar a tarefa.");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(task: Task, status: Task["status"]) {
    try {
      await api(`/api/v1/tasks/${task.id}`, { method: "PATCH", body: { status } });
      await loadTasks();
    } catch {
      setError("Não foi possível atualizar essa tarefa.");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Atividades" description="Tarefas do time para as contas e anúncios do Mercado Livre." />

      <Card>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className={fieldLabel}>Título</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className={fieldInput} />
            </div>
            <div>
              <label className={fieldLabel}>Prioridade</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className={fieldInput}>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {PRIORITY_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setShowMore((v) => !v)} className="pb-1.5 text-xs font-medium text-brand-600 hover:underline">
              {showMore ? "Menos opções" : "Mais opções"}
            </button>
          </div>

          {showMore && (
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabel}>Prazo</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldInput} />
              </div>
              <div>
                <label className={fieldLabel}>Responsável</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={fieldInput}>
                  <option value="">Sem responsável</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.fullName ?? member.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={fieldLabel}>Anúncio vinculado</label>
                {selectedListing ? (
                  <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm">
                    <span className="truncate text-slate-700">{selectedListing.title}</span>
                    <button type="button" onClick={() => setSelectedListing(null)} className="text-xs font-medium text-brand-700 hover:underline">
                      Trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      placeholder="Buscar por título ou MLB"
                      value={listingQuery}
                      onChange={(e) => setListingQuery(e.target.value)}
                      className={fieldInput}
                    />
                    {listingResults.length > 0 && (
                      <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 text-sm shadow-card">
                        {listingResults.map((listing) => (
                          <li key={listing.listingId}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedListing(listing);
                                setListingQuery("");
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
                            >
                              {listing.title} <span className="text-xs text-slate-400">({listing.externalId})</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={fieldLabel}>Descrição</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={fieldInput} />
              </div>
            </div>
          )}

          <Button type="submit" size="sm" disabled={creating}>
            {creating ? "Criando…" : "Nova tarefa"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 text-slate-500">Filtrar:</span>
        <button
          onClick={() => setStatusFilter("")}
          className={`rounded-full px-3 py-1.5 font-medium transition-colors ${statusFilter === "" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Todas
        </button>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => setStatusFilter(option)}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              statusFilter === option ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {STATUS_LABELS[option]}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Carregando…</p>}
        {!loading && tasks.length === 0 && <EmptyState title="Nenhuma tarefa encontrada" hint="Crie a primeira tarefa acima." />}
        {!loading &&
          tasks.map((task) => (
            <Card key={task.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{task.title}</p>
                {task.description && <p className="mt-1 text-sm text-slate-500">{task.description}</p>}
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge value={task.status} label={STATUS_LABELS[task.status]} />
                  <StatusBadge value={task.priority} label={PRIORITY_LABELS[task.priority]} />
                  {task.dueDate && <span className="text-xs text-slate-400">Prazo: {task.dueDate}</span>}
                </div>
              </div>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task, e.target.value as Task["status"])}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </Card>
          ))}
      </div>
    </div>
  );
}
