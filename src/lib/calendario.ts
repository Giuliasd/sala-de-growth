/**
 * Calendário de datas-chave (`/calendario`) — a parte pura, sem React nem
 * Prisma: que eventos existem, quais estão atrasados, quem dos responsáveis
 * está fora no dia, que dias a grade do mês cobre e como tudo se agrupa e se
 * filtra. A ferramenta `ver_calendario` do MCP usa as mesmas regras.
 *
 * Um evento é uma data pontual de uma iniciativa ou de um experimento:
 * - lançamento (`launchDate`) e análise de resultados (`analysisDate`) do item;
 * - checkpoint de comunicação ou de marco (pelo `dueDate`: o dia em que o
 *   aviso sai ou em que a data relevante acontece).
 *
 * Tudo é UTC: as datas do produto são date-only gravadas como meia-noite UTC;
 * comparadas no fuso local (UTC-3) escorregariam um dia para trás.
 */

export const TIPOS_DE_EVENTO = ["LANCAMENTO", "ANALISE", "COMUNICACAO", "MARCO"] as const;
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

export type TipoDeItem = "iniciativa" | "experimento";

/** Alguém do evento que está fora no dia. Só o tipo genérico — nunca as observações. */
export type ConflitoDeAusencia = { pessoa: string; tipo: string };

export type EventoDoCalendario = {
  /** Único na lista: o mesmo item tem lançamento e análise. */
  id: string;
  tipo: TipoDeEvento;
  /** `YYYY-MM-DD` (UTC). */
  data: string;
  /** Nome do checkpoint (comunicação/marco) ou do próprio item (lançamento/análise). */
  titulo: string;
  item: { id: string; nome: string; tipo: TipoDeItem };
  frente: { id: string; name: string };
  /** Responsáveis do checkpoint; no lançamento/análise, os do item. */
  members: { id: string; name: string }[];
  /** Id do checkpoint (comunicação/marco); `null` no lançamento/análise. */
  checkpointId: string | null;
  /** Início do checkpoint, quando tem — mover o evento leva o início junto. */
  inicio: string | null;
  /** Só checkpoints têm conclusão; lançamento e análise são `null`. */
  concluido: boolean | null;
  /** A data passou e o que ela marca não aconteceu (ver `estaAtrasado`). */
  atrasado: boolean;
  /** Responsáveis ausentes no dia do evento. */
  conflitos: ConflitoDeAusencia[];
};

/** Linha de iniciativa/experimento como a action lê do banco. */
export type ItemComDatas = {
  id: string;
  name: string;
  status: string;
  launchDate: Date | null;
  analysisDate: Date | null;
  frente: { id: string; name: string };
  members: { id: string; name: string }[];
};

/** Checkpoint de comunicação ou marco, com o item a que pertence. */
export type CheckpointDoCalendario = {
  id: string;
  name: string;
  startDate: Date | null;
  dueDate: Date;
  isCompleted: boolean;
  categoria: string | null;
  members: { id: string; name: string }[];
  item: { id: string; name: string; status: string; frente: { id: string; name: string } };
};

export type AusenciaDoCalendario = {
  memberId: string;
  memberName: string;
  type: string;
  startDate: Date;
  endDate: Date;
};

/** Trava de férias que cruza o período — contexto do dia (ex.: Black Friday). */
export type TravaDoCalendario = { nome: string; inicio: string; fim: string };

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

/** Diferença em dias entre dois `YYYY-MM-DD`. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** `YYYY-MM-DD` deslocado em N dias. */
export function somarDias(iso: string, dias: number): string {
  return toISODate(addDays(new Date(`${iso}T00:00:00.000Z`), dias));
}

/** `"2026-11"` → ano e mês (0–11). Inválido ou fora de faixa → `null`. */
export function parseMes(mes: string | null | undefined): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((mes ?? "").trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mesIdx = Number(m[2]) - 1;
  // Mesma trava de ano plausível das datas do produto (lib/date-validation).
  if (ano < 2000 || ano > 2100 || mesIdx < 0 || mesIdx > 11) return null;
  return { ano, mes: mesIdx };
}

export function formatMes(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

/** Mês vizinho: `deslocarMes(2026, 11, 1)` → janeiro de 2027. */
export function deslocarMes(ano: number, mes: number, delta: number): { ano: number; mes: number } {
  const total = ano * 12 + mes + delta;
  return { ano: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
}

/**
 * Dias que a grade do mês desenha: da segunda-feira da semana do dia 1 ao
 * domingo da semana do último dia. São 4 a 6 semanas inteiras — os dias do mês
 * vizinho aparecem esmaecidos, e os eventos deles também são buscados, senão
 * a grade mostraria a borda vazia.
 */
export function intervaloDaGrade(ano: number, mes: number): { inicio: Date; fim: Date } {
  const primeiro = new Date(Date.UTC(ano, mes, 1));
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0));
  const diaSemanaInicio = primeiro.getUTCDay(); // 0 = domingo
  const inicio = addDays(primeiro, diaSemanaInicio === 0 ? -6 : 1 - diaSemanaInicio);
  const diaSemanaFim = ultimo.getUTCDay();
  const fim = addDays(ultimo, diaSemanaFim === 0 ? 0 : 7 - diaSemanaFim);
  return { inicio, fim };
}

/** Semanas da grade (cada uma com 7 dias, de segunda a domingo). */
export function semanasDaGrade(ano: number, mes: number): Date[][] {
  const { inicio, fim } = intervaloDaGrade(ano, mes);
  const semanas: Date[][] = [];
  for (let d = inicio; d <= fim; d = addDays(d, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  return semanas;
}

/**
 * Status em que a análise de resultados ainda não aconteceu: o item não chegou
 * ao relatório. Experimento "Aguardando resultados" com a data vencida é a
 * mesma trava do dashboard ("Análise de resultados venceu"); aqui entram também
 * os que nem saíram de execução. Pausado não conta — está parado de propósito.
 */
const ANALISE_PENDENTE: Record<TipoDeItem, readonly string[]> = {
  experimento: ["BACKLOG", "EM_ANDAMENTO", "AGUARDANDO_RESULTADOS"],
  iniciativa: ["BACKLOG", "EM_ANDAMENTO", "CONCLUIDA"],
};

/**
 * Lançamento atrasado é só o do item que nem começou (Backlog): "Em
 * andamento" não diz se já lançou ou ainda está construindo, e marcar como
 * atraso o que talvez já tenha saído seria alarme falso.
 */
const LANCAMENTO_PENDENTE: readonly string[] = ["BACKLOG"];

/**
 * A data passou e o que ela marca não aconteceu:
 * - comunicação/marco: checkpoint não concluído;
 * - análise: item ainda sem relatório (`ANALISE_PENDENTE`);
 * - lançamento: item ainda em Backlog.
 * O dia de hoje ainda não é atraso.
 */
export function estaAtrasado(
  e: { tipo: TipoDeEvento; data: string; concluido: boolean | null },
  item: { tipo: TipoDeItem; status: string },
  hoje: string
): boolean {
  if (e.data >= hoje) return false;
  if (e.tipo === "COMUNICACAO" || e.tipo === "MARCO") return e.concluido === false;
  if (e.tipo === "ANALISE") return ANALISE_PENDENTE[item.tipo].includes(item.status);
  return LANCAMENTO_PENDENTE.includes(item.status);
}

/**
 * Tipo de ausência que pode aparecer para o time: licença médica e
 * maternidade saem só como "licença" — quem está fora basta; o motivo é dado
 * de saúde. Mesma regra do MCP (`tipoDeAusencia` em lib/mcp/tools-rotina.ts).
 */
export function rotuloDeAusencia(type: string): string {
  if (type === "FERIAS") return "férias";
  if (type === "DAY_OFF") return "day off";
  if (type.startsWith("LICENCA")) return "licença";
  return "ausência";
}

function conflitosNoDia(
  data: Date,
  members: { id: string }[],
  ausencias: AusenciaDoCalendario[]
): ConflitoDeAusencia[] {
  if (members.length === 0 || ausencias.length === 0) return [];
  const ids = new Set(members.map((m) => m.id));
  const vistos = new Set<string>();
  const conflitos: ConflitoDeAusencia[] = [];
  for (const a of ausencias) {
    if (!ids.has(a.memberId) || vistos.has(a.memberId)) continue;
    if (a.startDate <= data && a.endDate >= data) {
      vistos.add(a.memberId);
      conflitos.push({ pessoa: a.memberName, tipo: rotuloDeAusencia(a.type) });
    }
  }
  return conflitos;
}

/**
 * Ordem dentro do dia: lançamento primeiro (é o evento que organiza os
 * outros), depois análise, comunicação e marco; no empate, pelo nome.
 */
function compararEventos(a: EventoDoCalendario, b: EventoDoCalendario): number {
  return (
    a.data.localeCompare(b.data) ||
    TIPOS_DE_EVENTO.indexOf(a.tipo) - TIPOS_DE_EVENTO.indexOf(b.tipo) ||
    a.titulo.localeCompare(b.titulo, "pt-BR")
  );
}

function dentro(d: Date, inicio: Date, fim: Date): boolean {
  return d >= inicio && d <= fim;
}

/**
 * Monta a lista de eventos a partir das linhas do banco. Só entram as datas
 * dentro de `[inicio, fim]` — a consulta já filtra, mas um item com lançamento
 * no período traz junto a análise de outro mês, que fica de fora aqui.
 */
export function montarEventos(
  entrada: {
    iniciativas: ItemComDatas[];
    experimentos: ItemComDatas[];
    checkpointsDeIniciativa: CheckpointDoCalendario[];
    checkpointsDeExperimento: CheckpointDoCalendario[];
    ausencias?: AusenciaDoCalendario[];
  },
  inicio: Date,
  fim: Date,
  /** `YYYY-MM-DD` de hoje em São Paulo (`hojeUTC`). */
  hoje: string
): EventoDoCalendario[] {
  const eventos: EventoDoCalendario[] = [];
  const ausencias = entrada.ausencias ?? [];

  const doItem = (lista: ItemComDatas[], tipoItem: TipoDeItem) => {
    for (const it of lista) {
      const datas: [TipoDeEvento, Date | null][] = [
        ["LANCAMENTO", it.launchDate],
        ["ANALISE", it.analysisDate],
      ];
      for (const [tipo, data] of datas) {
        if (!data || !dentro(data, inicio, fim)) continue;
        const iso = toISODate(data);
        eventos.push({
          id: `${tipo}:${it.id}`,
          tipo,
          data: iso,
          titulo: it.name,
          item: { id: it.id, nome: it.name, tipo: tipoItem },
          frente: it.frente,
          members: it.members,
          checkpointId: null,
          inicio: null,
          concluido: null,
          atrasado: estaAtrasado({ tipo, data: iso, concluido: null }, { tipo: tipoItem, status: it.status }, hoje),
          conflitos: conflitosNoDia(data, it.members, ausencias),
        });
      }
    }
  };

  const doCheckpoint = (lista: CheckpointDoCalendario[], tipoItem: TipoDeItem) => {
    for (const cp of lista) {
      const tipo: TipoDeEvento | null =
        cp.categoria === "COMUNICACAO" || cp.categoria === "MARCO" ? cp.categoria : null;
      if (!tipo || !dentro(cp.dueDate, inicio, fim)) continue;
      const iso = toISODate(cp.dueDate);
      eventos.push({
        id: `${tipo}:${cp.id}`,
        tipo,
        data: iso,
        titulo: cp.name,
        item: { id: cp.item.id, nome: cp.item.name, tipo: tipoItem },
        frente: cp.item.frente,
        members: cp.members,
        checkpointId: cp.id,
        inicio: cp.startDate ? toISODate(cp.startDate) : null,
        concluido: cp.isCompleted,
        atrasado: estaAtrasado(
          { tipo, data: iso, concluido: cp.isCompleted },
          { tipo: tipoItem, status: cp.item.status },
          hoje
        ),
        conflitos: conflitosNoDia(cp.dueDate, cp.members, ausencias),
      });
    }
  };

  doItem(entrada.iniciativas, "iniciativa");
  doItem(entrada.experimentos, "experimento");
  doCheckpoint(entrada.checkpointsDeIniciativa, "iniciativa");
  doCheckpoint(entrada.checkpointsDeExperimento, "experimento");

  return eventos.sort(compararEventos);
}

/**
 * Evento levado para outro dia (arrastar no calendário). O checkpoint com
 * início anda inteiro — início e prazo deslocam o mesmo tanto, para não
 * inverter as datas nem esticar a etapa.
 *
 * É a prévia otimista enquanto o servidor grava: o atraso de lançamento e
 * análise depende do status do item, que o cliente não tem, e os conflitos
 * dependem das ausências — os dois se acertam na releitura do mês.
 */
export function moverEvento(e: EventoDoCalendario, novaData: string, hoje: string): EventoDoCalendario {
  const delta = diasEntre(e.data, novaData);
  const ehCheckpoint = e.concluido !== null;
  return {
    ...e,
    data: novaData,
    inicio: e.inicio ? somarDias(e.inicio, delta) : null,
    atrasado: novaData >= hoje ? false : ehCheckpoint ? e.concluido === false : e.atrasado,
    conflitos: [],
  };
}

export type FiltrosDoCalendario = {
  tipos: ReadonlySet<TipoDeEvento>;
  tipoDeItem: "todos" | TipoDeItem;
  frenteId: string;
  /** Responsável: casa se for QUALQUER um dos responsáveis do evento. */
  memberId: string;
  /** Só o que está atrasado. */
  soAtrasados: boolean;
};

export const FILTROS_PADRAO: FiltrosDoCalendario = {
  tipos: new Set(TIPOS_DE_EVENTO),
  tipoDeItem: "todos",
  frenteId: "",
  memberId: "",
  soAtrasados: false,
};

/**
 * Clique numa pill de tipo de evento:
 * - com todos os tipos à vista (o padrão), o clique ISOLA o tipo — fica só ele.
 *   É o gesto mais comum ("quero ver só as comunicações"); desligar um tipo
 *   deixando os outros três exigiria três cliques;
 * - com o filtro já ligado, o clique liga/desliga o tipo, para somar ou tirar
 *   tipos da seleção;
 * - desligar o último tipo volta a mostrar todos: seleção vazia seria uma tela
 *   vazia sem explicação (e a URL sem `tipos` já significa "todos").
 */
export function alternarTipo(tipos: ReadonlySet<TipoDeEvento>, t: TipoDeEvento): Set<TipoDeEvento> {
  if (tipos.size === TIPOS_DE_EVENTO.length) return new Set([t]);
  const proximos = new Set(tipos);
  if (proximos.has(t)) proximos.delete(t);
  else proximos.add(t);
  return proximos.size === 0 ? new Set(TIPOS_DE_EVENTO) : proximos;
}

export function filtrarEventos(eventos: EventoDoCalendario[], f: FiltrosDoCalendario): EventoDoCalendario[] {
  return eventos.filter(
    (e) =>
      f.tipos.has(e.tipo) &&
      (f.tipoDeItem === "todos" || e.item.tipo === f.tipoDeItem) &&
      (!f.frenteId || e.frente.id === f.frenteId) &&
      (!f.memberId || e.members.some((m) => m.id === f.memberId)) &&
      (!f.soAtrasados || e.atrasado)
  );
}

/**
 * Filtros ⇄ URL. Só vai para a URL o que difere do padrão, para o link do
 * calendário "cru" continuar curto: `tipos=LANCAMENTO,ANALISE`,
 * `item=experimento`, `frente=<id>`, `pessoa=<id>`, `atrasados=1`.
 */
type Params = Record<string, string | string[] | undefined>;

function primeiro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function filtrosDaUrl(params: Params): FiltrosDoCalendario {
  const tiposBrutos = primeiro(params.tipos)
    .split(",")
    .filter((t): t is TipoDeEvento => (TIPOS_DE_EVENTO as readonly string[]).includes(t));
  const item = primeiro(params.item);
  return {
    tipos: tiposBrutos.length > 0 ? new Set(tiposBrutos) : new Set(TIPOS_DE_EVENTO),
    tipoDeItem: item === "iniciativa" || item === "experimento" ? item : "todos",
    frenteId: primeiro(params.frente),
    memberId: primeiro(params.pessoa),
    soAtrasados: primeiro(params.atrasados) === "1",
  };
}

export function filtrosParaUrl(f: FiltrosDoCalendario, params: URLSearchParams): void {
  const todos = f.tipos.size === TIPOS_DE_EVENTO.length;
  if (!todos && f.tipos.size > 0) params.set("tipos", TIPOS_DE_EVENTO.filter((t) => f.tipos.has(t)).join(","));
  if (f.tipoDeItem !== "todos") params.set("item", f.tipoDeItem);
  if (f.frenteId) params.set("frente", f.frenteId);
  if (f.memberId) params.set("pessoa", f.memberId);
  if (f.soAtrasados) params.set("atrasados", "1");
}

/** Eventos por dia (`YYYY-MM-DD`), preservando a ordem da lista. */
export function agruparPorDia(eventos: EventoDoCalendario[]): Map<string, EventoDoCalendario[]> {
  const porDia = new Map<string, EventoDoCalendario[]>();
  for (const e of eventos) {
    const lista = porDia.get(e.data);
    if (lista) lista.push(e);
    else porDia.set(e.data, [e]);
  }
  return porDia;
}

/** Travas que cobrem o dia — o rótulo que aparece no topo da célula. */
export function travasDoDia(travas: TravaDoCalendario[], dia: string): TravaDoCalendario[] {
  return travas.filter((t) => t.inicio <= dia && t.fim >= dia);
}
