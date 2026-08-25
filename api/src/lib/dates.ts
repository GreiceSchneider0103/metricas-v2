// America/Sao_Paulo nao observa horario de verao desde 2019 (UTC-3 fixo),
// entao o "dia local" pode ser calculado sem depender de uma lib de timezone.
export function getSaoPauloTodayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function shiftIsoDate(date: string, deltaDays: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + deltaDays);
  return value.toISOString().slice(0, 10);
}
