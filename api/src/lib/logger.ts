import pino from "pino";

// Fastify({ logger: true }) cria seu proprio pino interno, escopado a "app" e
// so acessivel via request.log dentro de um handler. Jobs em background
// (sync detached, loop de contas, agregacoes por cron) nao tem request --
// esse logger standalone cobre esses casos com o mesmo formato estruturado,
// em vez de console.error/warn soltos que fogem do pipeline de log do Render.
export const logger = pino();
