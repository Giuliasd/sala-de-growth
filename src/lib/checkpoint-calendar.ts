/**
 * Geometria do calendário mensal de checkpoints — a parte pura, sem React.
 *
 * Mora aqui (e não dentro de `components/shared/CheckpointCalendar.tsx`) porque
 * o componente busca ausências e quarters via server action: importar o
 * componente num teste de unidade arrastava `next-auth` e o Prisma junto.
 *
 * Tudo é UTC. As datas de checkpoint são date-only; comparadas em horário local
 * (UTC-3) as barras escorregam um dia para trás.
 */

import { CATEGORIAS_SOLTAS, type CheckpointCategoria } from "@/lib/checkpoint-categoria";

export const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Teto de barras empilhadas numa semana. Acima disso a semana viraria uma
 * parede de barras; o excedente vira "+N", que na interface é um botão de
 * expandir (aí `packWeek` recebe `Infinity`).
 */
export const MAX_LANES = 5;

export function toUTC(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUTCDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_DAY);
}

export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** `YYYY-MM-DD` — formato que as actions de checkpoint esperam. */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira (em UTC) da semana que contém `date`. */
export function startOfWeekMondayUTC(date: Date): Date {
  const day = date.getUTCDay(); // 0 = domingo
  return addUTCDays(date, day === 0 ? -6 : 1 - day);
}

export function fmtShort(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d as string).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export function monthLabel(year: number, month: number): string {
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Chave ordenável de mês (ano * 12 + mês), para saltar ao mês com conteúdo. */
export function monthKeyOf(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export interface CalendarCheckpoint {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | string | null;
  dueDate: Date | string;
  isCompleted: boolean;
  members: { id: string; name: string }[];
  parentId: string | null;
  depth: number;
  /** Comunicação ou marco; null = checkpoint comum. */
  categoria?: string | null;
  /** Tags já resolvidas (nome e cor) — o tooltip as mostra. */
  tags?: { id: string; name: string; color: string }[];
  /** As `tags` vieram de um ancestral (o checkpoint não tem tag própria). */
  tagsHerdadas?: boolean;
}

/**
 * Checkpoint de comunicação ou marco aparece SOLTO no calendário (mês e
 * semana): sem o recuo e a seta de subcheckpoint, e fora do realce da família do
 * pai. É um ponto por si — o aviso sai num dia, a data relevante vale por ela
 * mesma, não "dentro" de uma etapa. O pai continua acessível pelo tooltip (ver
 * `paiDoTooltip`).
 */
export function soltoNoCalendario(cp: { categoria?: string | null }): boolean {
  return !!cp.categoria && CATEGORIAS_SOLTAS.includes(cp.categoria as CheckpointCategoria);
}

/** O que o tooltip precisa saber de cada checkpoint para montar o caminho do pai. */
export type NoDaArvore = { name: string; parentId: string | null };

/**
 * Nomes dos ancestrais de um checkpoint, do mais alto ao pai direto — o que o
 * tooltip mostra em "Faz parte de: Avô › Pai".
 *
 * Resolve pela árvore INTEIRA, não pelos checkpoints que o calendário está
 * desenhando: com filtro ligado o pai pode estar fora da tela, e é justamente
 * então (um marco ou comunicação solto na grade) que a pessoa mais precisa
 * saber de que etapa ele faz parte. Ancestral desconhecido interrompe o
 * caminho; ciclo (dado corrompido) não trava.
 */
export function caminhoDosAncestrais(
  parentId: string | null,
  porId: ReadonlyMap<string, NoDaArvore>
): string[] {
  const nomes: string[] = [];
  const vistos = new Set<string>();
  let atual = parentId;
  while (atual && !vistos.has(atual)) {
    vistos.add(atual);
    const no = porId.get(atual);
    if (!no) break;
    nomes.unshift(no.name);
    atual = no.parentId;
  }
  return nomes;
}

/** Achata a profundidade dos checkpoints soltos; os demais passam intactos. */
export function paraCalendario<T extends CalendarCheckpoint>(checkpoints: T[]): T[] {
  return checkpoints.map((cp) => (soltoNoCalendario(cp) && cp.depth > 0 ? { ...cp, depth: 0 } : cp));
}

/** Checkpoint já resolvido para o intervalo que ocupa no calendário. */
export type Span = {
  cp: CalendarCheckpoint;
  start: Date;
  end: Date;
  /** Estado visual: concluído, atrasado ou em aberto. */
  tone: "done" | "late" | "open";
};

/** Barra posicionada numa semana: colunas 0–6 e a lane em que foi empilhada. */
export type Bar = Span & {
  startCol: number;
  endCol: number;
  lane: number;
  /** A barra continua na semana anterior/seguinte — a ponta é corte, não fim. */
  cutStart: boolean;
  cutEnd: boolean;
};

export function toSpan(cp: CalendarCheckpoint, hoje: Date): Span | null {
  const end = toUTC(cp.dueDate);
  if (!end) return null;
  // Sem data de início a barra ocupa só o dia do prazo — igual ao roadmap.
  const start = toUTC(cp.startDate) ?? end;
  const tone: Span["tone"] = cp.isCompleted ? "done" : end < hoje ? "late" : "open";
  // Início depois do prazo é dado inconsistente; desenha um dia só em vez de
  // uma barra de largura negativa.
  return { cp, start: start > end ? end : start, end, tone };
}

/**
 * Empilha as barras de uma semana em lanes: cada barra vai para a primeira lane
 * onde não colide com outra. Ordena por início e, no empate, pela barra mais
 * longa e pela profundidade — assim o checkpoint pai tende a ficar acima dos
 * seus subcheckpoints.
 *
 * `maxLanes` é o teto de barras desenhadas; o resto volta como `overflow`. A
 * semana expandida na interface passa `Infinity`.
 */
export function packWeek(
  spans: Span[],
  weekStart: Date,
  maxLanes: number = MAX_LANES
): { bars: Bar[]; overflow: number } {
  const weekEnd = addUTCDays(weekStart, 6);

  const inWeek = spans
    .filter((s) => s.end >= weekStart && s.start <= weekEnd)
    .map((s) => ({
      ...s,
      startCol: Math.max(0, diffDays(s.start, weekStart)),
      endCol: Math.min(6, diffDays(s.end, weekStart)),
      // Corte pela borda da semana: quem desenha usa isso para não arredondar
      // a ponta nem repetir o filete de início numa barra que só continua.
      cutStart: s.start < weekStart,
      cutEnd: s.end > weekEnd,
    }))
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.endCol - b.startCol - (a.endCol - a.startCol) ||
        a.cp.depth - b.cp.depth ||
        a.cp.name.localeCompare(b.cp.name, "pt-BR")
    );

  // lanes[i] = última coluna ocupada na lane i.
  const lanes: number[] = [];
  const bars: Bar[] = [];
  let overflow = 0;

  for (const item of inWeek) {
    let lane = lanes.findIndex((lastCol) => lastCol < item.startCol);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(item.endCol);
    } else {
      lanes[lane] = item.endCol;
    }
    if (lane >= maxLanes) {
      overflow++;
      continue;
    }
    bars.push({ ...item, lane });
  }

  return { bars, overflow };
}
