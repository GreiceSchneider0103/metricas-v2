export function VarianceBadge({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-xs text-slate-400">-</span>;

  const rounded = Math.round(percent * 10) / 10;
  const color = rounded > 0 ? "text-emerald-600" : rounded < 0 ? "text-red-600" : "text-slate-400";
  const arrow = rounded > 0 ? "▲" : rounded < 0 ? "▼" : "→";

  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(rounded).toFixed(1)}%
    </span>
  );
}
