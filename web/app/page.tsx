"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function RootPage() {
  const { loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? "/mapa-vendas" : "/login");
  }, [loading, session, router]);

  return <div className="flex h-screen items-center justify-center text-slate-400">Carregando...</div>;
}
