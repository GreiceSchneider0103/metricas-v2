"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/auth-context";
import type { Task, TaskComment, TeamMember } from "@/lib/types";
import { fieldInput, fieldLabel } from "@/lib/ui";
import { Button } from "@/components/ui/button";

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

// Drawer de detalhe/edicao de uma tarefa -- mesmo padrao visual do
// ListingDrawer (painel lateral fixo). Backend ja suportava edicao completa
// e comentarios (PATCH /tasks/:id, GET/POST /tasks/:id/comments); so faltava
// essa UI.
export function TaskDrawer({
  task,
  members,
  onClose,
  onUpdated
}: {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<Task["status"]>(task.status);
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [assignedTo, setAssignedTo] = useState(task.assignedTo ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingComments(true);
    api<{ items: TaskComment[] }>(`/api/v1/tasks/${task.id}/comments`)
      .then((result) => {
        if (active) setComments(result.items);
      })
      .catch(() => {
        if (active) setComments([]);
      })
      .finally(() => {
        if (active) setLoadingComments(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const dirty =
    title !== task.title ||
    description !== (task.description ?? "") ||
    status !== task.status ||
    priority !== task.priority ||
    dueDate !== (task.dueDate ?? "") ||
    assignedTo !== (task.assignedTo ?? "");

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        body: {
          title,
          description: description.trim() ? description : null,
          status,
          priority,
          dueDate: dueDate || null,
          assignedTo: assignedTo || null
        }
      });
      setSaved(true);
      onUpdated();
    } catch {
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment(event: FormEvent) {
    event.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const comment = await api<TaskComment>(`/api/v1/tasks/${task.id}/comments`, {
        method: "POST",
        body: { body: commentBody }
      });
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
    } catch {
      setError("Não foi possível adicionar o comentário.");
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="animate-drawer-in h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Detalhes da tarefa</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        {task.relatedListing && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">Anúncio vinculado</p>
            <p className="truncate font-medium text-slate-700">{task.relatedListing.title}</p>
            <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
              <span>{task.relatedListing.externalId}</span>
              {task.relatedListing.permalink && (
                <a href={task.relatedListing.permalink} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
                  Ver anúncio
                </a>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className={fieldLabel}>Título</label>
            <input
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              className={fieldInput}
            />
          </div>

          <div>
            <label className={fieldLabel}>Descrição</label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSaved(false);
              }}
              rows={3}
              className={fieldInput}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as Task["status"]);
                  setSaved(false);
                }}
                className={fieldInput}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Prioridade</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as Task["priority"]);
                  setSaved(false);
                }}
                className={fieldInput}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {PRIORITY_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Prazo de conclusão</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setSaved(false);
                }}
                className={fieldInput}
              />
            </div>
            <div>
              <label className={fieldLabel}>Responsável</label>
              <select
                value={assignedTo}
                onChange={(e) => {
                  setAssignedTo(e.target.value);
                  setSaved(false);
                }}
                className={fieldInput}
              >
                <option value="">Sem responsável</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName ?? member.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {saved && !dirty && <p className="text-xs text-emerald-600">Alterações salvas.</p>}

          <Button type="submit" size="sm" disabled={saving || !dirty} className="w-full">
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Comentários</h3>

          {loadingComments && <p className="text-xs text-slate-400">Carregando…</p>}
          {!loadingComments && comments.length === 0 && <p className="text-xs text-slate-400">Nenhum comentário ainda.</p>}
          {!loadingComments && comments.length > 0 && (
            <ul className="mb-3 space-y-2">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">{comment.authorName ?? "Usuário"}</span>
                    <span className="text-[11px] text-slate-400">{new Date(comment.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddComment} className="space-y-2">
            <textarea
              placeholder="Escreva um comentário…"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={2}
              className={fieldInput}
            />
            <Button type="submit" variant="secondary" size="sm" disabled={postingComment || !commentBody.trim()} className="w-full">
              {postingComment ? "Enviando…" : "Comentar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
