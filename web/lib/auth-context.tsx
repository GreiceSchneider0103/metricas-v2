"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";
import { apiFetch, type RequestOptions } from "./api-client";
import type { Company } from "./types";

const ACTIVE_COMPANY_KEY = "metricas.activeCompanyId";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  const loadCompanies = useCallback(async (accessToken: string) => {
    try {
      const result = await apiFetch<{ items: Company[] }>("/api/v1/companies/mine", { accessToken });
      setCompanies(result.items);
      return result.items;
    } catch {
      setCompanies([]);
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        const items = await loadCompanies(data.session.access_token);
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_COMPANY_KEY) : null;
        setActiveCompanyIdState(items.find((company) => company.id === stored)?.id ?? items[0]?.id ?? null);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        const items = await loadCompanies(newSession.access_token);
        setActiveCompanyIdState((current) => current ?? items[0]?.id ?? null);
      } else {
        setCompanies([]);
        setActiveCompanyIdState(null);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadCompanies]);

  const setActiveCompanyId = useCallback((companyId: string) => {
    setActiveCompanyIdState(companyId);
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
  }, []);

  const refreshCompanies = useCallback(async () => {
    if (session) {
      const items = await loadCompanies(session.access_token);
      setActiveCompanyIdState((current) => current ?? items[0]?.id ?? null);
    }
  }, [session, loadCompanies]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  );

  const value: AuthContextValue = {
    loading,
    session,
    companies,
    activeCompany,
    setActiveCompanyId,
    refreshCompanies,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

// Fecha o token/empresa ativa sobre apiFetch automaticamente -- toda pagina
// chama a API por aqui, nunca precisa passar accessToken/companyId na mao.
export function useApi() {
  const { session, activeCompany } = useAuth();

  return useCallback(
    function apiCall<T>(path: string, options: Omit<RequestOptions, "accessToken" | "companyId"> = {}): Promise<T> {
      return apiFetch<T>(path, {
        ...options,
        accessToken: session?.access_token ?? null,
        companyId: activeCompany?.id ?? null
      });
    },
    [session, activeCompany]
  );
}
