"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApi, useAuth } from "@/lib/auth-context";
import { NotificationsBell } from "@/components/notifications-bell";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/header-menu";
import type { AppTab } from "@/lib/types";

const ALL_TABS: AppTab[] = ["mapa_vendas", "atividades", "alertas", "configuracoes"];

// Equipe e Integrações viraram abas dentro de Configurações; Atividades,
// Alertas e Metas viraram abas dentro de Operacional -- nenhuma delas tem
// mais rota propria (ver components/settings/* e components/operational/*).
// "tabs" tem mais de um valor pra Operacional porque ele agrupa duas
// permissoes (atividades/alertas): basta ter uma das duas pra ver a aba.
const NAV_ITEMS: { href: string; label: string; tabs: AppTab[] }[] = [
  { href: "/mapa-vendas", label: "Mercado Livre", tabs: ["mapa_vendas"] },
  { href: "/operacional", label: "Operacional", tabs: ["atividades", "alertas"] },
  { href: "/configuracoes", label: "Configurações", tabs: ["configuracoes"] }
];

const PRECIFICACAO_URL = "https://precificacao-app.vercel.app/";
const GO_TICKETS_URL = "https://lessul-go-atendimento-2p7t.onrender.com/dashboard";

const APP_NAV_ITEMS = [
  { href: PRECIFICACAO_URL, label: "Precificação" },
  { href: GO_TICKETS_URL, label: "Go Tickets" }
];

// Decide o que mostrar pra quem ainda não pertence a nenhuma empresa: ninguém
// cria ou escolhe empresa por conta própria -- todo cadastro cai
// automaticamente como pendente na empresa de onboarding (ver
// access-requests/service.ts no backend). Se por algum motivo ainda não
// existe um pedido pendente (ex.: sessão retomada após confirmar e-mail),
// cria um agora; só um master de plataforma pode de fato liberar o acesso.
function PendingAccessGate() {
  const api = useApi();
  const { signOut } = useAuth();
  const [status, setStatus] = useState<"loading" | "pending" | "none">("loading");

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
        await api("/api/v1/access-requests", { method: "POST" });
        if (!active) return;
        setStatus("pending");
      } catch {
        if (active) setStatus("none");
      }
    }

    resolve();
    return () => {
      active = false;
    };
  }, [api]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-400">Carregando…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 text-center shadow-card">
        <Logo className="mx-auto h-10 w-10" />
        <h1 className="text-lg font-semibold text-slate-900">Aguardando aprovação</h1>
        <p className="text-sm leading-relaxed text-slate-500">
          {status === "pending"
            ? "Seu acesso foi enviado para revisão. Um administrador precisa aprová-lo antes de você conseguir entrar."
            : "Não foi possível confirmar seu acesso agora. Tente novamente em instantes ou fale com um administrador."}
        </p>
        <Button onClick={() => window.location.reload()} className="w-full">
          Verificar novamente
        </Button>
        <button type="button" onClick={() => signOut()} className="w-full text-center text-xs text-slate-400 hover:text-slate-600 hover:underline">
          Sair
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, session, companies, activeCompany, isPlatformAdmin, setActiveCompanyId, signOut, activeChannel, setActiveChannel } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowedTabs = isPlatformAdmin ? ALL_TABS : (activeCompany?.allowedTabs ?? ALL_TABS);
  const visibleNavItems = NAV_ITEMS.filter((item) => item.tabs.some((tab) => allowedTabs.includes(tab)));
  // Mercado Livre/Magalu virou um seletor ao lado da logo, nao uma pilula de
  // navegacao -- fica de fora da lista renderizada como pilulas, mas segue
  // valendo pra guarda de acesso acima (visibleNavItems).
  const pillNavItems = visibleNavItems.filter((item) => item.href !== "/mapa-vendas");
  const showChannelSelector = allowedTabs.includes("mapa_vendas");

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  // Se a aba atual nao estiver mais liberada (ex.: um master tirou o acesso
  // enquanto a pessoa estava na tela), manda pra primeira aba que ainda
  // esta liberada -- nao deixa a pessoa presa numa tela sem acesso.
  useEffect(() => {
    if (loading || !session || companies.length === 0) return;
    const current = NAV_ITEMS.find((item) => pathname?.startsWith(item.href));
    if (current && !current.tabs.some((tab) => allowedTabs.includes(tab)) && visibleNavItems[0]) {
      router.replace(visibleNavItems[0].href);
    }
  }, [loading, session, companies.length, pathname, allowedTabs, visibleNavItems, router]);

  if (loading || !session) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-400">Carregando…</div>;
  }

  if (companies.length === 0) {
    return <PendingAccessGate />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <Link href="/mapa-vendas" className="flex items-center gap-2.5 transition-opacity hover:opacity-75">
              <Logo className="h-8 w-8" />
              <span className="hidden text-base font-semibold tracking-tight text-slate-900 sm:inline">Go Metriks</span>
            </Link>
            {showChannelSelector && (
              <HeaderMenu
                label={activeChannel === "magalu" ? "Magalu" : "Mercado Livre"}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
              >
                <HeaderMenuItem
                  selected={activeChannel === "mercado_livre"}
                  onClick={() => {
                    setActiveChannel("mercado_livre");
                    router.push("/mapa-vendas");
                  }}
                >
                  Mercado Livre
                </HeaderMenuItem>
                <HeaderMenuItem
                  selected={activeChannel === "magalu"}
                  onClick={() => {
                    setActiveChannel("magalu");
                    router.push("/mapa-vendas");
                  }}
                >
                  Magalu
                </HeaderMenuItem>
              </HeaderMenu>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-4">
            {/* Sempre seletor, mesmo com 1 empresa só -- um usuário pode
                pertencer a múltiplas empresas e precisa poder trocar. */}
            <HeaderMenu
              align="right"
              label={<span className="max-w-[160px] truncate">{activeCompany?.name ?? "Selecionar empresa"}</span>}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
            >
              {companies.map((company) => (
                <HeaderMenuItem key={company.id} selected={company.id === activeCompany?.id} onClick={() => setActiveCompanyId(company.id)}>
                  {company.name}
                </HeaderMenuItem>
              ))}
            </HeaderMenu>
            <NotificationsBell />
            <span className="hidden text-sm text-slate-500 md:inline">{session.user.email}</span>
            <button onClick={() => signOut()} className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">
              Sair
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2.5">
          {pillNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                pathname?.startsWith(item.href) ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mx-1.5 my-1 h-4 w-px bg-slate-200" />
          {APP_NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              {item.label}
              <svg className="h-3 w-3 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M12.5 3a.75.75 0 000 1.5h2.19l-6.72 6.72a.75.75 0 101.06 1.06L15.75 5.56v2.19a.75.75 0 001.5 0v-4a.75.75 0 00-.75-.75h-4z" />
                <path d="M4.5 5.5A1.5 1.5 0 006 4h4a.75.75 0 000-1.5H6A3 3 0 003 5.5v8A3 3 0 006 16.5h8a3 3 0 003-3v-4a.75.75 0 00-1.5 0v4a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 13.5v-8z" />
              </svg>
            </a>
          ))}
        </nav>
      </header>
      {/* max-w mais largo (era 1600px) -- o mapa de vendas tem ~46 colunas
          (anuncio/ABC/status/tipo + ate 31 dias + 11 metricas) e precisava
          de mais espaco horizontal pra caber sem rolagem lateral. Paginas
          mais estreitas (Atividades, Alertas etc.) ja se auto-limitam com
          seu proprio max-w interno, entao isso nao afeta o layout delas. */}
      <main className="mx-auto w-full max-w-[1920px] flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
