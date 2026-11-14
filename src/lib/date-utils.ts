export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInMs = now.getTime() - d.getTime();
  const diffInMin = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (diffInMin < 1) return "agora";
  if (diffInMin < 60) return `há ${diffInMin} min`;
  if (diffInHours < 24) return `há ${diffInHours} h`;
  
  const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === d.toDateString();
  if (isYesterday) return "ontem";

  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

export function formatFullDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  });
}

/** Segunda-feira (00:00, horário local) da semana que contém `base`. */
export function startOfWeekMonday(base: Date): Date {
  const day = base.getDay(); // 0 = domingo
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** "13 de jul." — dia + mês abreviado, em UTC. */
export function formatDayMonth(date: Date | string): string {
  return new Date(date as string).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/** "13/07" — dia/mês numérico, em UTC. */
export function formatDayMonthNumeric(date: Date | string): string {
  return new Date(date as string).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Segunda-feira da semana da data, em UTC.
 *
 * As datas do produto são gravadas como meia-noite UTC e formatadas em UTC;
 * calcular a semana no fuso local desloca o corte em três horas e faz o rótulo
 * ("31 de ago. – 06 de set.") discordar do conteúdo (a semana anterior).
 */
export function startOfWeekMondayUTC(base: Date): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const day = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

/**
 * Hoje, como meia-noite UTC da data de São Paulo — o formato em que as datas do
 * produto são gravadas, pronto para comparar com um `dueDate`.
 *
 * O fuso é explícito porque o dyno roda em UTC: às 22h daqui o servidor já
 * está no dia seguinte, e o que vence hoje apareceria como atrasado.
 */
export function hojeUTC(agora: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  return (
    parseISODateUTC(iso) ??
    new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
  );
}

/** "2026-09-04" em UTC — o formato que vai e volta na URL. */
export function toISODateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Data de um "yyyy-mm-dd" tratado como UTC (sem pular um dia para trás). */
export function parseISODateUTC(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Semana da data dada (segunda a domingo) e a seguinte. Sem argumento, a
 * semana de hoje — é o que o dashboard usa.
 *
 * Mora aqui (e não em actions/weekly-activity) para as páginas calcularem o
 * mesmo recorte ANTES de buscar a semana, e dispararem as consultas que
 * dependem dele em paralelo com a busca.
 */
export function weekRangeUTC(base?: Date): {
  weekStart: Date;
  weekEnd: Date;
  nextWeekStart: Date;
  nextWeekEnd: Date;
} {
  // Tudo em UTC: as datas do produto são meia-noite UTC, e fazer a conta no
  // fuso local deslocava o corte da semana em três horas — o rótulo do filtro
  // dizia uma semana e a lista mostrava a anterior.
  // Sem base, a semana é a de HOJE no fuso do time: com `new Date()` o dyno
  // (em UTC) virava a semana às 21h de domingo daqui, e o dashboard mostrava a
  // semana seguinte enquanto o "hoje" do card ainda era domingo.
  const monday = startOfWeekMondayUTC(base ?? hojeUTC());
  const maisDias = (d: Date, n: number) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  const fimDoDia = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(23, 59, 59, 999);
    return x;
  };
  const sunday = fimDoDia(maisDias(monday, 6));
  const nextMonday = maisDias(monday, 7);
  const nextSunday = fimDoDia(maisDias(nextMonday, 6));
  return { weekStart: monday, weekEnd: sunday, nextWeekStart: nextMonday, nextWeekEnd: nextSunday };
}

/**
 * Índice (1-based) da semana dentro do seu mês.
 *
 * O mês de uma semana é o da **quinta-feira** — mesmo critério que o filtro da
 * Weekly usa para agrupar semanas em meses, e da ISO. Sem isso, a semana de
 * 31/08 a 06/09 apareceria em agosto e em setembro, e "semana 1" mudaria de
 * significado dependendo de quem conta.
 *
 * Consequência que vale saber: a semana de 28/09 tem a quinta em 01/10, então
 * ela é a **semana 1 de outubro**, não a quinta de setembro.
 */
export function semanaDoMesUTC(weekStart: Date): number {
  const maisDias = (d: Date, n: number) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  const quinta = maisDias(weekStart, 3);
  const ano = quinta.getUTCFullYear();
  const mes = quinta.getUTCMonth();

  // Primeira segunda cuja quinta cai neste mês.
  let primeira = startOfWeekMondayUTC(new Date(Date.UTC(ano, mes, 1)));
  if (maisDias(primeira, 3).getUTCMonth() !== mes) primeira = maisDias(primeira, 7);

  const semanas = Math.round(
    (weekStart.getTime() - primeira.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return semanas + 1;
}

// ─── Janela do ritual ────────────────────────────────────────────────────────
//
// A semana do CALENDÁRIO (segunda a domingo) decide em que semana um prazo
// cai. A semana do RITUAL decide quando o time considera a semana encerrada:
// por padrão ela fecha na sexta às 14:59 (horário de São Paulo), na reunião de
// sexta. O que acontece depois disso — concluir, remarcar, excluir — já é da
// semana seguinte. E o "planejado" é o que estava na Weekly até o fim da
// segunda, o dia da reunião de alinhamento.
//
// Os dois horários são configuráveis em /configuracoes/rituais (model
// HorarioDoRitual), com vigência por semana. A abertura não é: ela é o
// fechamento da semana anterior, com os horários que valiam nela — assim uma
// mudança nunca deixa instante sem semana, ou em duas.
//
// Horas fixas em UTC−3: São Paulo não tem horário de verão desde 2019.

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;
const FUSO_SP_MS = 3 * HORA_MS;

/**
 * Dia (1 = segunda … 7 = domingo) e último minuto, contado desde 00:00 de
 * São Paulo, de cada momento. Os dois são inclusivos: "fecha às 14:59" vale
 * até 14:59:59.999, e a semana seguinte abre às 15:00.
 */
export type HorariosDoRitual = {
  fechamentoDia: number;
  fechamentoMinuto: number;
  planejamentoDia: number;
  planejamentoMinuto: number;
};

/** Horários que valem a partir da semana `vigenteDesde` (segunda, meia-noite UTC). */
export type VigenciaDoRitual = HorariosDoRitual & { vigenteDesde: Date };

/** Sem configuração: fecha sexta 14:59, planejado até segunda 23:59. */
export const HORARIOS_PADRAO: HorariosDoRitual = {
  fechamentoDia: 5,
  fechamentoMinuto: 14 * 60 + 59,
  planejamentoDia: 1,
  planejamentoMinuto: 23 * 60 + 59,
};

/** O planejado precisa terminar antes de a semana fechar. */
export function horariosValidos(h: HorariosDoRitual): boolean {
  const ok = (dia: number, minuto: number) =>
    Number.isInteger(dia) && dia >= 1 && dia <= 7 && Number.isInteger(minuto) && minuto >= 0 && minuto < 24 * 60;
  return (
    ok(h.fechamentoDia, h.fechamentoMinuto) &&
    ok(h.planejamentoDia, h.planejamentoMinuto) &&
    h.planejamentoDia * 24 * 60 + h.planejamentoMinuto < h.fechamentoDia * 24 * 60 + h.fechamentoMinuto
  );
}

/** Os horários que valem na semana: a vigência mais recente que já começou nela. */
export function horariosDaSemana(weekStart: Date, vigencias: VigenciaDoRitual[] = []): HorariosDoRitual {
  const seg = startOfWeekMondayUTC(weekStart).getTime();
  let atual: VigenciaDoRitual | null = null;
  for (const v of vigencias) {
    const desde = new Date(v.vigenteDesde).getTime();
    if (desde <= seg && (!atual || desde > new Date(atual.vigenteDesde).getTime())) atual = v;
  }
  if (!atual) return HORARIOS_PADRAO;
  const { fechamentoDia, fechamentoMinuto, planejamentoDia, planejamentoMinuto } = atual;
  return { fechamentoDia, fechamentoMinuto, planejamentoDia, planejamentoMinuto };
}

export function mesmosHorarios(a: HorariosDoRitual, b: HorariosDoRitual): boolean {
  return (
    a.fechamentoDia === b.fechamentoDia &&
    a.fechamentoMinuto === b.fechamentoMinuto &&
    a.planejamentoDia === b.planejamentoDia &&
    a.planejamentoMinuto === b.planejamentoMinuto
  );
}

/** O instante logo depois do último minuto (exclusivo), em UTC. */
function depoisDoMinuto(seg: number, dia: number, minuto: number): number {
  return seg + (dia - 1) * DIA_MS + (minuto + 1) * MINUTO_MS + FUSO_SP_MS;
}

export type JanelaDoRitual = {
  /** Segunda-feira da semana (meia-noite UTC), a chave da semana. */
  weekStart: Date;
  /** O fechamento da semana anterior: o que acontece daqui em diante é desta semana. */
  abre: Date;
  /** Fim do planejamento (inclusivo): até aqui, o que entra na semana é "planejado". */
  fimDoPlanejamento: Date;
  /** Fechamento (exclusivo): o minuto seguinte ao último da semana. */
  fecha: Date;
};

export function janelaDoRitual(weekStart: Date, vigencias: VigenciaDoRitual[] = []): JanelaDoRitual {
  const seg = startOfWeekMondayUTC(weekStart).getTime();
  const h = horariosDaSemana(new Date(seg), vigencias);
  const anterior = horariosDaSemana(new Date(seg - 7 * DIA_MS), vigencias);
  return {
    weekStart: new Date(seg),
    abre: new Date(depoisDoMinuto(seg - 7 * DIA_MS, anterior.fechamentoDia, anterior.fechamentoMinuto)),
    fimDoPlanejamento: new Date(depoisDoMinuto(seg, h.planejamentoDia, h.planejamentoMinuto) - 1),
    fecha: new Date(depoisDoMinuto(seg, h.fechamentoDia, h.fechamentoMinuto)),
  };
}

/**
 * A semana do ritual em andamento agora. Depois do fechamento (sexta 15:00,
 * no padrão) até o domingo, já é a semana seguinte: a de hoje fechou na
 * reunião.
 *
 * Basta olhar a semana do calendário de hoje e a seguinte: o fechamento cai
 * sempre dentro da própria semana (no máximo, domingo 23:59).
 */
export function semanaDoRitualAtual(agora: Date = new Date(), vigencias: VigenciaDoRitual[] = []): Date {
  const seg = startOfWeekMondayUTC(hojeUTC(agora));
  return agora.getTime() >= janelaDoRitual(seg, vigencias).fecha.getTime()
    ? new Date(seg.getTime() + 7 * DIA_MS)
    : seg;
}

const DIAS_DA_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** "segunda" … "domingo", de 1 a 7. */
export function nomeDoDia(dia: number): string {
  return DIAS_DA_SEMANA[dia - 1] ?? "";
}

/** "14:59", de minutos desde 00:00. */
export function formatMinuto(minuto: number): string {
  const m = ((minuto % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Quando a semana seguinte abre: o minuto depois do fechamento ("sábado 00:00" se ele é 23:59). */
export function aberturaDaSeguinte(h: HorariosDoRitual): { dia: number; minuto: number } {
  const proximo = h.fechamentoMinuto + 1;
  return proximo >= 24 * 60
    ? { dia: (h.fechamentoDia % 7) + 1, minuto: 0 }
    : { dia: h.fechamentoDia, minuto: proximo };
}
