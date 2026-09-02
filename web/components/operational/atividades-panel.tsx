"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import type { Task, TeamMember } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskDrawer } from "@/components/task-drawer";
import { TasksCalendar, MONTH_LABEL_FORMAT, shiftMonth, isTaskOverdue } from "@/components/operational/tasks-calendar";
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

const PRIORITY_RANK: Record<Task["priority"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

type SortOption = "created" | "dueDate" | "priority";

type ListingOption = { listingId: string; externalId: string; title: string };

export function AtividadesPanel({ onDataChanged }: { onDataChanged?: () => void } = {}) {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("created");

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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  async function loadTasks() {
    setLoading(true);
    try {
      const result = await api<{ items: Task[] }>("/api/v1/tasks", { query: { status: statusFilter || undefined } });
      setTasks(result.items);
      onDataChanged?.();
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

  // Filtro por responsavel e ordenacao sao so client-side (a lista ja vem
  // inteira do backend pro filtro de status atual) -- sem tarefa sem prazo
  // no meio da ordenacao por prazo, essas ficam sempre por ultimo.
  const visibleTasks = useMemo(() => {
    const filtered = assigneeFilter ? tasks.filter((task) => task.assignedTo === assigneeFilter) : tasks;
    const sorted = [...filtered];
    if (sortBy === "priority") {
      sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    } else if (sortBy === "dueDate") {
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    }
    return sorted;
  }, [tasks, assigneeFilter, sortBy]);

  // Arrastar uma tarefa pra outro dia no calendario reagenda o prazo direto
  // -- mesmo endpoint que o drawer usa pra editar dueDate.
  async function handleReschedule(task: Task, isoDate: string) {
    try {
      await api(`/api/v1/tasks/${task.id}`, { method: "PATCH", body: { dueDate: isoDate } });
      await loadTasks();
    } catch {
      setError("Não foi possível reagendar essa tarefa.");
    }
  }

  async function handleTaskUpdated(taskId: string) {
    await loadTasks();
    try {
      const fresh = await api<Task>(`/api/v1/tasks/${taskId}`);
      setSelectedTask(fresh);
    } catch {
      // segue com o que ja estava no drawer
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600"
          >
            <option value="">Todos os responsáveis</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName ?? member.email}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600"
          >
            <option value="created">Ordenar: mais recentes</option>
            <option value="dueDate">Ordenar: prazo</option>
            <option value="priority">Ordenar: prioridade</option>
          </select>
          <div className="flex items-center gap-1 rounded-full bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView("list")}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${view === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
          >
            Lista
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${view === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
          >
            Calendário
          </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {view === "calendar" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                ‹
              </button>
              <button
                onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                ›
              </button>
              <button
                onClick={() => setCalendarMonth(new Date())}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Hoje
              </button>
              <h3 className="ml-1 text-sm font-semibold capitalize text-slate-700">{MONTH_LABEL_FORMAT.format(calendarMonth)}</h3>
            </div>
            <p className="text-xs text-slate-400">Arraste uma tarefa pra outro dia pra reagendar.</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Carregando…</p>
          ) : (
            <TasksCalendar tasks={visibleTasks} monthDate={calendarMonth} onSelectTask={setSelectedTask} onRescheduleTask={handleReschedule} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">Carregando…</p>}
          {!loading && visibleTasks.length === 0 && <EmptyState title="Nenhuma tarefa encontrada" hint="Crie a primeira tarefa acima." />}
          {!loading &&
            visibleTasks.map((task) => {
              const overdue = isTaskOverdue(task);
              return (
              <Card key={task.id} className={`flex items-center justify-between gap-3 ${overdue ? "border-red-200 bg-red-50/40" : ""}`}>
                <button type="button" onClick={() => setSelectedTask(task)} className="min-w-0 flex-1 text-left">
                  <p className="font-medium text-slate-800 hover:underline">{task.title}</p>
                  {task.description && <p className="mt-1 truncate text-sm text-slate-500">{task.description}</p>}
                  {task.relatedListing && (
                    <p className="mt-1 truncate text-xs text-slate-500">
                      Anúncio: {task.relatedListing.title}{" "}
                      <span className="text-slate-400">({task.relatedListing.externalId})</span>
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge value={task.status} label={STATUS_LABELS[task.status]} />
                    <StatusBadge value={task.priority} label={PRIORITY_LABELS[task.priority]} />
                    {task.dueDate && (
                      <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>
                        Prazo: {task.dueDate}
                        {overdue ? " (atrasada)" : ""}
                      </span>
                    )}
                    {task.assignee && (
                      <span className="text-xs text-slate-400">Responsável: {task.assignee.fullName ?? task.assignee.email}</span>
                    )}
                  </div>
                </button>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task, e.target.value as Task["status"])}
                  className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {STATUS_LABELS[option]}
                    </option>
                  ))}
                </select>
              </Card>
              );
            })}
        </div>
      )}

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          members={members}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => handleTaskUpdated(selectedTask.id)}
        />
      )}
    </div>
  );
}
