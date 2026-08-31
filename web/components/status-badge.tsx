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

const DOT_COLOR_MAP: Record<string, string> = {
  active: "bg-emerald-500",
  connected: "bg-emerald-500",
  done: "bg-emerald-500",
  achieved: "bg-emerald-500",
  resolved: "bg-emerald-500",
  paused: "bg-amber-500",
  syncing: "bg-amber-500",
  waiting: "bg-amber-500",
  in_progress: "bg-sky-500",
  todo: "bg-slate-400",
  open: "bg-sky-500",
  muted: "bg-slate-400",
  closed: "bg-slate-400",
  cancelled: "bg-slate-400",
  missed: "bg-red-500",
  sync_failed: "bg-red-500",
  disconnected: "bg-red-500",
  under_review: "bg-amber-500",
  low: "bg-slate-400",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500"
};

// Versao compacta pra tabelas densas (mapa de vendas): so a bolinha colorida,
// com o rotulo completo no tooltip nativo em vez de ocupar espaco na celula.
export function StatusDot({ value, label }: { value: string; label?: string }) {
  const color = DOT_COLOR_MAP[value] ?? "bg-slate-400";
  return (
    <span className="inline-flex items-center justify-center" title={label ?? value}>
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}
