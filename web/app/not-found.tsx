import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <p className="text-sm font-medium text-slate-700">Página não encontrada.</p>
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        Voltar para o início
      </Link>
    </div>
  );
}
