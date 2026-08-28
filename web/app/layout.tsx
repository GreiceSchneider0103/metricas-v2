import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Go Metriks",
  description: "Inteligência comercial para vendedores do Mercado Livre"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
