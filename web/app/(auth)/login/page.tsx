"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api-client";
import { PasswordInput } from "@/components/password-input";
import type { CompanySearchResult } from "@/lib/types";

const PENDING_COMPANY_KEY = "metricas.pendingCompanyRequest";

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setSubmitting(false);
    if (resetError) {
      setError("Nao foi possivel enviar o email de redefinicao. Tente novamente.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Se houver uma conta com o email <strong>{email}</strong>, enviamos um link para redefinir a senha.
        </p>
        <button type="button" onClick={onBack} className="text-sm font-medium text-brand-600 hover:underline">
          Voltar para o login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-500">Informe o email cadastrado para receber um link de redefinicao de senha.</p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? "Enviando..." : "Enviar link de redefinicao"}
      </button>
      <button type="button" onClick={onBack} className="w-full text-center text-xs text-slate-400 hover:underline">
        Voltar para o login
      </button>
    </form>
  );
}

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError("Email ou senha invalidos.");
      return;
    }
    router.replace("/mapa-vendas");
  }

  if (forgotPassword) {
    return <ForgotPasswordForm onBack={() => setForgotPassword(false)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">Senha</label>
          <button type="button" onClick={() => setForgotPassword(true)} className="text-xs font-medium text-brand-600 hover:underline">
            Esqueci minha senha
          </button>
        </div>
        <PasswordInput
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState<CompanySearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  useEffect(() => {
    if (selectedCompany || companyQuery.trim().length < 2) {
      setCompanyResults([]);
      return;
    }
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const result = await apiFetch<{ items: CompanySearchResult[] }>("/api/v1/companies/search", {
          query: { q: companyQuery }
        });
        if (active) setCompanyResults(result.items);
      } catch {
        if (active) setCompanyResults([]);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [companyQuery, selectedCompany]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selectedCompany) {
      setError("Selecione a empresa da qual voce quer participar.");
      return;
    }
    setSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (signUpError || !data.user) {
      setSubmitting(false);
      setError(signUpError?.message === "User already registered" ? "Ja existe uma conta com esse email." : "Nao foi possivel criar a conta.");
      return;
    }

    if (data.session) {
      try {
        await apiFetch("/api/v1/access-requests", {
          method: "POST",
          body: { companyId: selectedCompany.id },
          accessToken: data.session.access_token
        });
      } catch {
        // segue mesmo se falhar aqui -- o portao de espera no dashboard tenta de novo usando o localStorage abaixo.
      }
      window.localStorage.removeItem(PENDING_COMPANY_KEY);
      setSubmitting(false);
      router.replace("/mapa-vendas");
      return;
    }

    // Projeto exige confirmacao de email: ainda nao ha sessao para chamar a
    // API. Guarda a empresa escolhida para o portao de espera do dashboard
    // criar o pedido assim que o usuario confirmar o email e fizer login.
    window.localStorage.setItem(PENDING_COMPANY_KEY, JSON.stringify({ id: selectedCompany.id, name: selectedCompany.name }));
    setSubmitting(false);
    setPendingConfirmation(true);
  }

  if (pendingConfirmation) {
    return (
      <p className="text-sm text-slate-600">
        Enviamos um link de confirmacao para <strong>{email}</strong>. Confirme seu email e depois faca login -- seu pedido de
        acesso a <strong>{selectedCompany?.name}</strong> sera enviado automaticamente.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Senha</label>
        <PasswordInput
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Empresa</label>
        {selectedCompany ? (
          <div className="flex items-center justify-between rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm">
            <span>{selectedCompany.name}</span>
            <button type="button" onClick={() => setSelectedCompany(null)} className="text-xs text-brand-700 hover:underline">
              Trocar
            </button>
          </div>
        ) : (
          <>
            <input
              required
              placeholder="Buscar empresa pelo nome"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            {companyResults.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 text-sm">
                {companyResults.map((company) => (
                  <li key={company.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCompany(company);
                        setCompanyQuery("");
                      }}
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    >
                      {company.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="mt-1 text-xs text-slate-400">
          Seu acesso precisa ser aprovado por um administrador da empresa escolhida.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? "Enviando..." : "Pedir acesso"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState<"entrar" | "cadastrar">("entrar");

  return (
    <div>
      <div className="mb-6 flex rounded-md bg-slate-100 p-1 text-sm font-medium">
        <button
          onClick={() => setTab("entrar")}
          className={`flex-1 rounded px-3 py-1.5 ${tab === "entrar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          Entrar
        </button>
        <button
          onClick={() => setTab("cadastrar")}
          className={`flex-1 rounded px-3 py-1.5 ${tab === "cadastrar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          Cadastrar
        </button>
      </div>
      {tab === "entrar" ? <LoginForm /> : <SignupForm />}
    </div>
  );
}
