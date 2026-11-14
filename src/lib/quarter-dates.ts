/**
 * Retorna as datas de início e fim de um quarter específico (UTC).
 * Q1 = Jan–Mar, Q2 = Abr–Jun, Q3 = Jul–Set, Q4 = Out–Dez
 */
export function getQuarterDates(
  year: number,
  quarter: 1 | 2 | 3 | 4
): { startDate: Date; endDate: Date } {
  const startMonth = (quarter - 1) * 3; // 0, 3, 6, 9
  const startDate = new Date(Date.UTC(year, startMonth, 1));
  const endDate = new Date(Date.UTC(year, startMonth + 3, 0)); // dia 0 do próximo mês = último dia do mês atual
  return { startDate, endDate };
}

/**
 * Formata o período de um quarter em pt-BR.
 * Ex: "1 de abril – 30 de junho de 2026"
 */
export function formatQuarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): string {
  const { startDate, endDate } = getQuarterDates(year, quarter);
  const fmtStart = startDate.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const fmtEnd = endDate.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${fmtStart} – ${fmtEnd}`;
}
