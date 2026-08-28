"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { PasswordInput } from "@/components/password-input";

// Link de "Enviar link de redefinicao" (login) chega aqui com um token na
// URL -- o client do Supabase (detectSessionInUrl: true por padrao) ja
// consome esse token e abre uma sessao temporaria de recuperacao sozinho,
// sem precisarmos ler a URL na mao. So falta o form pra definir a nova
// senha e checar se essa sessao de fato existe (link expirado/invalido cai
// no estado de erro).
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) setReady("valid");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady("valid");
    });

    const timeout = setTimeout(() => {
      if (active) setReady((current) => (current === "checking" ? "invalid" : current));
    }, 3000);

    return () => {
      active = false;
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("As senhas nao coincidem.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError("Nao foi possivel atualizar a senha. Solicite um novo link.");
      return;
    }
    setDone(true);
  }

  if (ready === "checking") {
    return <p className="text-sm text-slate-400">Verificando link...</p>;
  }

  if (ready === "invalid") {
    return (
      <div className="space-y-4 text-sm text-slate-600">
        <p>Este link de redefinicao e invalido ou expirou.</p>
        <button onClick={() => router.replace("/login")} className="font-medium text-brand-600 hover:underline">
          Voltar para o login
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Senha atualizada com sucesso.</p>
        <button
          onClick={() => router.replace("/mapa-vendas")}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-500">Defina sua nova senha.</p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nova senha</label>
        <PasswordInput
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Confirmar nova senha</label>
        <PasswordInput
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? "Salvando..." : "Atualizar senha"}
      </button>
    </form>
  );
}
