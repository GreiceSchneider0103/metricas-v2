const COLOR_MAP: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  connected: "bg-emerald-50 text-emerald-700",
  done: "bg-emerald-50 text-emerald-700",
  achieved: "bg-emerald-50 text-emerald-700",
  resolved: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  syncing: "bg-amber-50 text-amber-700",
  waiting: "bg-amber-50 text-amber-700",
  in_progress: "bg-sky-50 text-sky-700",
  todo: "bg-slate-100 text-slate-600",
  open: "bg-sky-50 text-sky-700",
  muted: "bg-slate-100 text-slate-500",
  closed: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
  missed: "bg-red-50 text-red-700",
  sync_failed: "bg-red-50 text-red-700",
  disconnected: "bg-red-50 text-red-700",
  under_review: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700"
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const classes = COLOR_MAP[value] ?? "bg-slate-100 text-slate-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{label ?? value}</span>;
}
