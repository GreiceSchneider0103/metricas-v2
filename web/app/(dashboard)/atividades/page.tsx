"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import type { Task } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

const STATUS_OPTIONS: Task["status"][] = ["todo", "in_progress", "waiting", "done", "cancelled"];
const PRIORITY_OPTIONS: Task["priority"][] = ["low", "medium", "high", "critical"];

export default function AtividadesPage() {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, api]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api("/api/v1/tasks", { method: "POST", body: { title, priority } });
      setTitle("");
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

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Titulo</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Prioridade</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
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
            {option}
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
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge value={task.status} />
                  <StatusBadge value={task.priority} />
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
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
      </div>
    </div>
  );
}
