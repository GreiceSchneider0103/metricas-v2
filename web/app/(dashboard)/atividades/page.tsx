"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import type { Task, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

const STATUS_OPTIONS: Task["status"][] = ["todo", "in_progress", "waiting", "done", "cancelled"];
const PRIORITY_OPTIONS: Task["priority"][] = ["low", "medium", "high", "critical"];

const STATUS_LABELS: Record<Task["status"], string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  done: "Concluida",
  cancelled: "Cancelada"
};

const PRIORITY_LABELS: Record<Task["priority"], string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  critical: "Critica"
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
      setError("Nao foi possivel carregar as tarefas.");
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
      setError("Nao foi possivel criar a tarefa.");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(task: Task, status: Task["status"]) {
    try {
      await api(`/api/v1/tasks/${task.id}`, { method: "PATCH", body: { status } });
      await loadTasks();
    } catch {
      setError("Nao foi possivel atualizar essa tarefa.");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Atividades</h1>

      <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Titulo</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {PRIORITY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setShowMore((v) => !v)} className="text-xs font-medium text-brand-600 hover:underline">
            {showMore ? "Menos opcoes" : "Mais opcoes"}
          </button>
        </div>

        {showMore && (
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Prazo</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Responsavel</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="">Sem responsavel</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName ?? member.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">Anuncio vinculado</label>
              {selectedListing ? (
                <div className="flex items-center justify-between rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-sm">
                  <span className="truncate">{selectedListing.title}</span>
                  <button type="button" onClick={() => setSelectedListing(null)} className="text-xs text-brand-700 hover:underline">
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <input
                    placeholder="Buscar por titulo ou MLB"
                    value={listingQuery}
                    onChange={(e) => setListingQuery(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  {listingResults.length > 0 && (
                    <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-slate-200 text-sm">
                      {listingResults.map((listing) => (
                        <li key={listing.listingId}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedListing(listing);
                              setListingQuery("");
                            }}
                            className="block w-full px-2 py-1 text-left hover:bg-slate-50"
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
              <label className="mb-1 block text-xs font-medium text-slate-500">Descricao</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {creating ? "Criando..." : "Nova tarefa"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Filtrar:</span>
        <button onClick={() => setStatusFilter("")} className={`rounded-full px-3 py-1 ${statusFilter === "" ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}>
          Todas
        </button>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => setStatusFilter(option)}
            className={`rounded-full px-3 py-1 ${statusFilter === option ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}
          >
            {STATUS_LABELS[option]}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Carregando...</p>}
        {!loading && tasks.length === 0 && <p className="text-sm text-slate-400">Nenhuma tarefa encontrada.</p>}
        {!loading &&
          tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
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
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
          ))}
      </div>
    </div>
  );
}
