export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2f4fc0" />
      <path
        d="M8 21l5-6 4 4 7-9"
        stroke="#ffffff"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="2" fill="#ffffff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Logo className="h-8 w-8" />
      <span className="text-lg font-semibold text-slate-900">Go Metriks</span>
    </div>
  );
}
