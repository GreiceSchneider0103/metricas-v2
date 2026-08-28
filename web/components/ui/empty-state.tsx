export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      <svg className="h-8 w-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" strokeLinecap="round" />
        <path d="M8 14h8" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
