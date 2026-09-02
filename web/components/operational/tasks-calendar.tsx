"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/lib/types";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  critical: "bg-red-500"
};

const MAX_VISIBLE_PER_DAY = 3;

// Grade completa (sempre 6 semanas x 7 dias, domingo primeiro) cobrindo o
// mes inteiro + dias de preenchimento do mes anterior/seguinte -- mesmo
// layout do Google Agenda em visao de mes.
function monthGridDates(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftMonth(date: Date, deltaMonths: number) {
  return new Date(date.getFullYear(), date.getMonth() + deltaMonths, 1);
}

export const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

// Atrasada = prazo no passado e ainda nao concluida/cancelada -- usado tanto
// na lista quanto no calendario, mesma regra dos dois lugares.
export function isTaskOverdue(task: Task) {
  if (!task.dueDate || task.status === "done" || task.status === "cancelled") return false;
  return task.dueDate < toIsoDate(new Date());
}

export function TasksCalendar({
  tasks,
  monthDate,
  onSelectTask,
  onRescheduleTask
}: {
  tasks: Task[];
  monthDate: Date;
  onSelectTask: (task: Task) => void;
  onRescheduleTask: (task: Task, isoDate: string) => void;
}) {
  const days = useMemo(() => monthGridDates(monthDate), [monthDate]);
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate) ?? [];
      list.push(task);
      map.set(task.dueDate, list);
    }
    return map;
  }, [tasks]);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const currentMonth = monthDate.getMonth();
  const todayIso = toIsoDate(new Date());

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const iso = toIsoDate(date);
          const dayTasks = tasksByDate.get(iso) ?? [];
          const isCurrentMonth = date.getMonth() === currentMonth;
          const isToday = iso === todayIso;
          const isDragOver = dragOverIso === iso;

          return (
            <div
              key={iso}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverIso(iso);
              }}
              onDragLeave={() => setDragOverIso((current) => (current === iso ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/plain");
                const task = tasks.find((item) => item.id === taskId);
                if (task && task.dueDate !== iso) onRescheduleTask(task, iso);
                setDraggingTaskId(null);
                setDragOverIso(null);
              }}
              className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 transition-colors ${
                isDragOver ? "bg-brand-50" : isCurrentMonth ? "bg-white" : "bg-slate-50/60"
              }`}
            >
              <div
                className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-brand-600 font-semibold text-white" : isCurrentMonth ? "text-slate-600" : "text-slate-300"
                }`}
              >
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, MAX_VISIBLE_PER_DAY).map((task) => {
                  const overdue = isTaskOverdue(task);
                  return (
                  <button
                    key={task.id}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", task.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingTaskId(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggingTaskId(null);
                      setDragOverIso(null);
                    }}
                    onClick={() => onSelectTask(task)}
                    title={overdue ? `${task.title} (atrasada)` : task.title}
                    className={`flex w-full cursor-grab items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:bg-slate-100 active:cursor-grabbing ${
                      overdue ? "bg-red-50 text-red-700" : "text-slate-700"
                    } ${draggingTaskId === task.id ? "opacity-40" : ""}`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-red-500" : PRIORITY_DOT[task.priority]}`} />
                    <span className="truncate">{task.title}</span>
                  </button>
                  );
                })}
                {dayTasks.length > MAX_VISIBLE_PER_DAY && (
                  <p className="px-1.5 text-[10px] text-slate-400">+{dayTasks.length - MAX_VISIBLE_PER_DAY} mais</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
