/** @type {import('next').NextConfig} */
const nextConfig = {
  // App inteiro e client-rendered (auth via Supabase no browser, dados via
  // fetch para a API externa) -- nao ha route handlers, middleware ou
  // server components com dados dinamicos. Export estatico evita que cada
  // rota vire uma serverless function na Vercel (plano Hobby limita a 12).
  output: "export"
};

export default nextConfig;
