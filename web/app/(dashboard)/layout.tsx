"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApi, useAuth } from "@/lib/auth-context";
import { NotificationsBell } from "@/components/notifications-bell";

const NAV_ITEMS = [
  { href: "/mapa-vendas", label: "Mapa de vendas" },
  { href: "/integracoes", label: "Integracoes" },
  { href: "/equipe", label: "Equipe" },
  { href: "/atividades", label: "Atividades" },
  { href: "/metas", label: "Metas" },
  { href: "/alertas", label: "Alertas" },
  { href: "/configuracoes", label: "Configuracoes" }
];

const PENDING_COMPANY_KEY = "metricas.pendingCompanyRequest";

// Decide o que mostrar pra quem ainda nao pertence a nenhuma empresa: se ja
// tem um pedido de acesso pendente, mostra a tela de espera; se veio da
// tela de cadastro mas o pedido nao pode ser criado na hora (projeto exige
// confirmacao de email, sem sessao ainda), cria agora que ja ha sessao; caso
// contrario, cai no fluxo original de criar a propria empresa.
function PendingAccessGate() {
  const api = useApi();
  const { signOut } = useAuth();
  const [status, setStatus] = useState<"loading" | "pending" | "none">("loading");
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolve() {
      try {
        const pendingCheck = await api<{ hasPending: boolean }>("/api/v1/access-requests/mine");
        if (!active) return;
        if (pendingCheck.hasPending) {
          setStatus("pending");
          return;
        }
      } catch {
        // segue para tentar o fallback do localStorage mesmo se a checagem falhar
      }

      const stored = typeof window !== "undefined" ? window.localStorage.getItem(PENDING_COMPANY_KEY) : null;
      if (stored) {
        try {
          const { id, name } = JSON.parse(stored) as { id: string; name: string };
          await api("/api/v1/access-requests", { method: "POST", body: { companyId: id } });
          window.localStorage.removeItem(PENDING_COMPANY_KEY);
          if (!active) return;
          setCompanyName(name);
          setStatus("pending");
          return;
        } catch {
          window.localStorage.removeItem(PENDING_COMPANY_KEY);
        }
      }

      if (active) setStatus("none");
    }

    resolve();
    return () => {
      active = false;
    };
  }, [api]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center text-slate-400">Carregando...</div>;
  }

  if (status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Aguardando aprovacao</h1>
          <p className="text-sm text-slate-500">
            Seu pedido de acesso {companyName ? `a ${companyName} ` : ""}foi enviado. Um administrador precisa aprova-lo
            antes de voce conseguir entrar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Verificar novamente
          </button>
          <button type="button" onClick={() => signOut()} className="w-full text-center text-xs text-slate-400 hover:underline">
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <CreateCompanyGate />;
}

function CreateCompanyGate() {
  const api = useApi();
  const { refreshCompanies, signOut } = useAuth();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api("/api/v1/companies", { method: "POST", body: { name } });
      await refreshCompanies();
    } catch {
      setError("Nao foi possivel criar a empresa. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Crie sua empresa</h1>
        <p className="text-sm text-slate-500">Voce ainda nao faz parte de nenhuma empresa no Go Metriks.</p>
        <input
          required
          placeholder="Nome da empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Criando..." : "Criar empresa"}
        </button>
        <button type="button" onClick={() => signOut()} className="w-full text-center text-xs text-slate-400 hover:underline">
          Sair
        </button>
      </form>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, session, companies, activeCompany, setActiveCompanyId, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Carregando...</div>;
  }

  if (companies.length === 0) {
    return <PendingAccessGate />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-8 px-2 text-lg font-semibold text-brand-600">Go Metriks</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                pathname?.startsWith(item.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            {companies.length > 1 ? (
              <select
                value={activeCompany?.id ?? ""}
                onChange={(e) => setActiveCompanyId(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-slate-700">{activeCompany?.name}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <NotificationsBell />
            <span className="text-sm text-slate-500">{session.user.email}</span>
            <button onClick={() => signOut()} className="text-sm font-medium text-slate-500 hover:text-slate-800">
              Sair
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
