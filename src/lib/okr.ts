import { OKRMeasurementType } from "@/generated/prisma/enums";

/**
 * Média dos meses preenchidos (ignora null/undefined).
 * Retorna null quando nenhum mês foi preenchido — o chamador decide o fallback (geralmente 0).
 */
export function computeMonthlyAverage(
  values: Array<number | null | undefined>
): number | null {
  const filled = values.filter(
    (v): v is number => v !== null && v !== undefined && !Number.isNaN(v)
  );
  if (filled.length === 0) return null;
  // Arredonda em 2 casas: (4,6 + 3,8) / 2 vira 4.199999999999999 em ponto
  // flutuante, e esse valor é gravado e impresso como está no card.
  const media = filled.reduce((sum, v) => sum + v, 0) / filled.length;
  return Math.round(media * 100) / 100;
}

/**
 * Fonte única de verdade para currentValue + progressPercent nos dois modos.
 *
 * - ACUMULADO: comportamento original, (current − initial) / (target − initial) × 100.
 * - MEDIA_MENSAL: currentValue = média dos meses preenchidos. O progresso é
 *   média ÷ meta, salvo quando há valor inicial acima da meta — aí o KR é de
 *   redução e vale a mesma conta do acumulado.
 */
export function computeProgress(params: {
  measurementType: OKRMeasurementType;
  targetValue: number;
  initialValue: number;
  currentValue: number;
  monthValues?: Array<number | null | undefined>;
}): { currentValue: number; progressPercent: number } {
  const { measurementType, targetValue, initialValue, currentValue, monthValues } = params;

  if (measurementType === "MEDIA_MENSAL") {
    const avg = computeMonthlyAverage(monthValues ?? []);
    const value = avg ?? 0;

    // Convenção para saber a direção sem campo novo: o valor inicial é o ponto
    // de partida também na média mensal. Com ele preenchido e abaixo dele a
    // meta (churn de 5% para 3%), o KR é de redução — e a conta passa a ser a
    // mesma do acumulado. Sem valor inicial, mantém o comportamento antigo
    // (média ÷ meta), que assume "maior é melhor".
    const ehReducao = initialValue > 0 && targetValue < initialValue;
    if (ehReducao) {
      const progressPercent = Math.max(
        0,
        ((initialValue - value) / (initialValue - targetValue)) * 100
      );
      return { currentValue: value, progressPercent };
    }

    const progressPercent = Math.max(
      0,
      targetValue === 0 ? 0 : (value / targetValue) * 100
    );
    return { currentValue: value, progressPercent };
  }

  // ACUMULADO — fórmula idêntica à original.
  const progressPercent = Math.max(
    0,
    targetValue === initialValue
      ? 0
      : ((currentValue - initialValue) / (targetValue - initialValue)) * 100
  );
  return { currentValue, progressPercent };
}

/**
 * Progresso ATUAL de um KR, recalculado por `computeProgress`.
 *
 * `progressPercent`/`currentValue` gravados só são reescritos quando alguém
 * atualiza o KR; um KR de redução em média mensal ficava com o número antigo
 * (churn de 4,6% aparecia como 153%) nas telas que liam a coluna direto —
 * dashboard, relatório e acompanhamento — enquanto /okrs, que recalculava,
 * mostrava o certo. Toda leitura de progresso passa por aqui.
 */
export function progressoAtual(kr: {
  measurementType: OKRMeasurementType;
  targetValue: number;
  initialValue: number;
  currentValue: number;
  monthValue1: number | null;
  monthValue2: number | null;
  monthValue3: number | null;
}): { currentValue: number; progressPercent: number } {
  return computeProgress({
    measurementType: kr.measurementType,
    targetValue: kr.targetValue,
    initialValue: kr.initialValue,
    currentValue: kr.currentValue,
    monthValues: [kr.monthValue1, kr.monthValue2, kr.monthValue3],
  });
}

/** Meses (year+month) cobertos pelo quarter. Extraído de MonthSnapshot para reuso. */
export function getQuarterMonths(
  quarterStart: Date | string,
  quarterEnd: Date | string
): Array<{ year: number; month: number }> {
  const start = new Date(quarterStart as string);
  const end = new Date(quarterEnd as string);
  const months: Array<{ year: number; month: number }> = [];
  let cur = new Date(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const last = new Date(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cur <= last) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

/** Rótulo "Maio 2026" em pt-BR. */
export function monthLabel(year: number, month: number): string {
  const label = new Date(year, month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Acompanhamento: ritmo, tendência e desatualização ───────────────────────
//
// O card sabia dizer "quanto do alvo já foi" e não "isso está indo bem?". As
// funções abaixo produzem a segunda resposta a partir do que já existe no
// banco: as datas do quarter e o histórico de atualizações (OKRUpdate).

/** Quanto do quarter já passou, em %. Fora do intervalo satura em 0 ou 100. */
export function quarterElapsedPercent(
  quarterStart: Date | string,
  quarterEnd: Date | string,
  now: Date = new Date()
): number {
  const start = new Date(quarterStart as string).getTime();
  const end = new Date(quarterEnd as string).getTime();
  if (!(end > start)) return 0;
  const pct = ((now.getTime() - start) / (end - start)) * 100;
  // Uma casa decimal: o valor entra em style e em texto, e sem arredondar o
  // servidor e o cliente renderizam decimais diferentes (o relógio anda entre
  // os dois) — o que o React acusa como erro de hidratação. Num quarter de 92
  // dias, 0,1% é pouco mais de duas horas.
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

export type PaceStatus = "adiantado" | "no-ritmo" | "atrasado";

/**
 * Compara progresso com tempo decorrido. A folga de 10 pontos evita chamar de
 * "atrasado" quem está a um dia de distância da reta — OKR não é linear, e um
 * alarme que dispara sempre deixa de ser lido.
 */
export function paceStatus(
  progressPercent: number,
  elapsedPercent: number,
  tolerance = 10
): PaceStatus {
  const gap = progressPercent - elapsedPercent;
  if (gap >= tolerance) return "adiantado";
  if (gap <= -tolerance) return "atrasado";
  return "no-ritmo";
}

/** Dias desde a última atualização. `null` quando nunca foi atualizado. */
export function daysSince(date: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const t = new Date(date as string).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / (1000 * 60 * 60 * 24));
}

/**
 * KR parado é o modo de falha mais comum de OKR — e é diferente de KR
 * atrasado. Sem nenhuma atualização, conta como parado.
 */
export function isStale(
  lastUpdatedAt: Date | string | null | undefined,
  limitDays = 14,
  now: Date = new Date()
): boolean {
  const dias = daysSince(lastUpdatedAt, now);
  return dias === null || dias >= limitDays;
}

export type OKRPoint = { date: Date | string; value: number };

/**
 * Velocidade em unidades por semana, do primeiro ao último ponto do histórico.
 * Precisa de dois pontos separados por pelo menos algumas horas; senão não há
 * o que projetar.
 */
export function velocityPerWeek(points: OKRPoint[]): number | null {
  if (points.length < 2) return null;
  const ordenados = [...points].sort(
    (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
  );
  const primeiro = ordenados[0];
  const ultimo = ordenados[ordenados.length - 1];
  const dias =
    (new Date(ultimo.date as string).getTime() - new Date(primeiro.date as string).getTime()) /
    (1000 * 60 * 60 * 24);
  if (dias < 0.5) return null;
  return ((ultimo.value - primeiro.value) / dias) * 7;
}

/**
 * Onde o KR termina o quarter mantendo a velocidade atual. Devolve `null`
 * quando não há velocidade para projetar ou o quarter já acabou.
 */
export function projectValue(params: {
  currentValue: number;
  velocityPerWeek: number | null;
  quarterEnd: Date | string;
  now?: Date;
}): number | null {
  const { currentValue, velocityPerWeek: v, quarterEnd, now = new Date() } = params;
  if (v === null) return null;
  const diasRestantes =
    (new Date(quarterEnd as string).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diasRestantes <= 0) return null;
  return currentValue + (v / 7) * diasRestantes;
}

/**
 * Direção do KR: crescer (signups, MRR) ou reduzir (CAC, churn).
 *
 * Sai da comparação entre valor inicial e meta — é o que o produto já usa para
 * calcular progresso no modo ACUMULADO. Em MEDIA_MENSAL o `initialValue` não é
 * preenchido, então a direção é desconhecida e assumimos "cresce", que é o que
 * `computeProgress` também assume (média / meta).
 */
export function okrDirection(params: {
  measurementType: string;
  initialValue: number;
  targetValue: number;
}): "cresce" | "reduz" {
  const { initialValue, targetValue } = params;
  // Vale para os dois modos: meta abaixo do ponto de partida é KR de redução.
  // Na média mensal sem ponto de partida (initialValue 0) não há como saber, e
  // "cresce" é o que o cálculo de progresso assume.
  return initialValue > 0 && targetValue < initialValue ? "reduz" : "cresce";
}

/** A projeção bate a meta? Depende da direção: em KR de redução, menor é melhor. */
export function projectionMeetsTarget(
  projected: number,
  targetValue: number,
  direction: "cresce" | "reduz"
): boolean {
  return direction === "reduz" ? projected <= targetValue : projected >= targetValue;
}

/**
 * Um ponto por semana do quarter, para o histórico de KR de média mensal.
 *
 * O valor plotado é o **valor do mês que foi mexido** na atualização — não a
 * média. É o que se quer ver: a série de valores independentes ao longo do
 * tempo. Quando a atualização não tem snapshot dos meses (linhas gravadas antes
 * da coluna existir), cai para o valor registrado, que ali era a média.
 *
 * Duas atualizações na mesma semana viram um ponto só: vale a última.
 */
export type MonthlySnapshot = {
  date: Date | string;
  newValue: number;
  monthValue1: number | null;
  monthValue2: number | null;
  monthValue3: number | null;
};

export type WeeklyPoint = {
  /** Semana do quarter, começando em 1. */
  week: number;
  value: number;
  /** Mês (1..3) de onde veio o valor; null quando é a média de uma linha antiga. */
  month: number | null;
  date: Date | string;
};

export function weeklySeriesFromUpdates(
  updates: MonthlySnapshot[],
  quarterStart: Date | string
): WeeklyPoint[] {
  const inicio = new Date(quarterStart as any).getTime();
  const asc = [...updates].sort(
    (a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime()
  );

  const porSemana = new Map<number, WeeklyPoint>();
  let anterior: (number | null)[] | null = null;

  for (const u of asc) {
    const meses = [u.monthValue1, u.monthValue2, u.monthValue3];
    const temSnapshot = meses.some((v) => v !== null && v !== undefined);

    // O mês mexido é o último que difere do snapshot anterior. Sem anterior
    // (primeira atualização), é o último mês preenchido.
    let month: number | null = null;
    let value = u.newValue;
    if (temSnapshot) {
      for (let i = 0; i < 3; i++) {
        const v = meses[i];
        if (v === null || v === undefined) continue;
        const antes = anterior ? anterior[i] : null;
        if (antes === null || antes === undefined || antes !== v) {
          month = i + 1;
          value = v;
        }
      }
      if (month === null) {
        // Nada mudou de mês nesta atualização: mantém o último mês preenchido.
        for (let i = 0; i < 3; i++) {
          const v = meses[i];
          if (v !== null && v !== undefined) {
            month = i + 1;
            value = v;
          }
        }
      }
      anterior = meses;
    }

    const dias = Math.floor(
      (new Date(u.date as any).getTime() - inicio) / (1000 * 60 * 60 * 24)
    );
    const week = Math.max(1, Math.floor(dias / 7) + 1);
    porSemana.set(week, { week, value, month, date: u.date });
  }

  return [...porSemana.values()].sort((a, b) => a.week - b.week);
}

/** Quantas semanas o quarter tem (para o eixo X do histórico). */
export function quarterWeekCount(
  quarterStart: Date | string,
  quarterEnd: Date | string
): number {
  // Trunca os dias antes de dividir: um quarter que termina às 23h59 mede 91,99
  // dias, e aí um trimestre de 13 semanas ganhava uma S14 vazia no eixo.
  const dias = Math.floor(
    (new Date(quarterEnd as any).getTime() - new Date(quarterStart as any).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return Math.max(1, Math.ceil(dias / 7));
}
