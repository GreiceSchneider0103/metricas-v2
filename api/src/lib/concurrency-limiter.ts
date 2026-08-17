// Limitador de concorrencia generico (semaforo). Usado para evitar que
// multiplas syncs rodando ao mesmo tempo somem mais requisicoes simultaneas
// ao Mercado Livre do que o razoavel, mesmo sem coordenacao entre elas.
export function createConcurrencyLimiter(maxConcurrent: number) {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  async function acquire(): Promise<() => void> {
    if (active < limit) {
      active += 1;
      return release;
    }

    return new Promise<() => void>((resolve) => {
      queue.push(() => resolve(release));
    });
  }

  async function run<T>(task: () => Promise<T>): Promise<T> {
    const releaseSlot = await acquire();
    try {
      return await task();
    } finally {
      releaseSlot();
    }
  }

  return {
    run,
    acquire,
    get activeCount() {
      return active;
    },
    get queuedCount() {
      return queue.length;
    }
  };
}

export type ConcurrencyLimiter = ReturnType<typeof createConcurrencyLimiter>;
