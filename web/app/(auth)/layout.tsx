import { Wordmark } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px circle at 50% 0%, rgba(47,79,192,0.08), transparent 60%)"
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-8 shadow-card">
        <div className="mb-7 flex justify-center">
          <Wordmark className="h-7" />
        </div>
        {children}
      </div>
    </div>
  );
}
