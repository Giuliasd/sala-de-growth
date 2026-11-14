"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarDays,
  Flame,
  CornerDownRight,
  Plus,
  Info,
  ArrowRight,
  ArrowLeft,
  Rows3,
  Grid2x2,
  ListChecks,
} from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  CATEGORIA_CONFIG,
  CategoriaIcon,
  getCategoriaConfig,
} from "@/components/shared/CheckpointCategoria";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { Avatar } from "@/components/shared/Avatar";
import {
  useCursorTooltip,
  CursorTooltip,
  TooltipTitle,
  TooltipLine,
  TooltipHint,
} from "@/components/shared/CursorTooltip";
import { formatMemberNames } from "@/components/shared/MemberChips";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";
import { CheckpointTagChip } from "@/components/shared/CheckpointTags";
import {
  getAusenciaLabel,
  getAusenciaStripColor,
} from "@/components/shared/AusenciaTypeBadge";
import { getAusencias } from "@/actions/ausencias";
import { getQuarters } from "@/actions/quarters";
import { formatDayMonth } from "@/lib/date-utils";
import {
  MAX_LANES,
  MS_DAY,
  addUTCDays,
  caminhoDosAncestrais,
  diffDays,
  fmtShort,
  monthKeyOf,
  monthLabel,
  packWeek,
  paraCalendario,
  soltoNoCalendario,
  startOfWeekMondayUTC,
  toDateStr,
  toSpan,
  toUTC,
  todayUTC,
  type CalendarCheckpoint,
  type NoDaArvore,
  type Span,
} from "@/lib/checkpoint-calendar";
import { CHECKPOINT_CATEGORIAS } from "@/lib/checkpoint-categoria";
import { TooltipDoMarco } from "@/components/shared/CheckpointMarco";
import type { MarcoCheckpoint, ProgressoDoMarco } from "@/lib/checkpoint-marco";

// ─── Constantes de layout ─────────────────────────────────────────────────────
/**
 * Altura da faixa: uma linha de "lane" por barra empilhada na semana.
 *
 * 32 para a barra caber com os 28px do roadmap (BAR_H em CheckpointGantt) —
 * as duas telas mostram o mesmo card, e 18px deixava o de cá com outra
 * silhueta e outro tamanho de letra.
 */
const LANE_H = 32;
const DAY_NUM_H = 22;
/**
 * Faixas reservadas em toda semana, mesmo vazia — o que define a altura
 * "default" do dia: DAY_NUM_H + 2 × LANE_H = 86px, praticamente o dobro da
 * altura antiga (22 + 22 = 44). Dia baixo demais deixava o mês parecendo uma
 * tabela de números, com as barras coladas no dia de cima.
 *
 * Duas faixas e não três porque a faixa cresceu para 32px: o dia mantém a
 * altura que tinha com três faixas de 22.
 *
 * Semana que tenha MAIS barras que isso cresce normalmente; o mínimo só
 * impede que ela encolha.
 */
const LANES_MINIMAS = 2;

/** Linhas de barra que a semana pede: as faixas ocupadas, mais o rodapé "+N". */
function linhasDaSemana(
  semana: { bars: { lane: number }[]; overflow: number; expandido: boolean },
  density: "bars" | "dots"
): number {
  if (density === "dots") return 0;
  const lanes = semana.bars.length > 0 ? Math.max(...semana.bars.map((b) => b.lane)) + 1 : 0;
  const temRodape = semana.overflow > 0 || semana.expandido;
  return lanes + (temRodape ? 1 : 0);
}
/**
 * Largura da alça de redimensionar, nas pontas da barra.
 *
 * 10px: menor que isso não se acerta com o mouse; maior come a área de
 * mover numa barra de um dia (a coluna do mês tem ~107px).
 */
const HANDLE_W = 10;
// Altura da faixa de pontinhos no modo compacto.
const DOTS_H = 16;
// Abaixo desta largura a grade de 7 colunas fica ilegível (nome truncado em
// três letras) e o calendário vira agenda — lista do mês por data.
const NARROW_PX = 560;

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * "Hoje" recalculado: o valor era congelado no mount, então quem deixava a aba
 * aberta virando o dia continuava vendo o destaque no dia errado — e os
 * checkpoints que venceram à meia-noite seguiam pintados como "em aberto".
 * Reagenda na próxima meia-noite UTC e reconfere quando a aba volta ao foco.
 */
function useTodayUTC(): Date {
  const [today, setToday] = useState<Date>(todayUTC);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function sync() {
      setToday((cur) => {
        const next = todayUTC();
        return next.getTime() === cur.getTime() ? cur : next;
      });
    }

    function schedule() {
      const now = new Date();
      const proximaMeiaNoite = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1
      );
      timer = setTimeout(() => {
        sync();
        schedule();
      }, proximaMeiaNoite - now.getTime() + 1000);
    }

    schedule();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return today;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
/** Ausência de um responsável, pintada como faixa no topo do dia. */
interface DayAbsence {
  id: string;
  memberName: string;
  type: string;
}

/** O que o dia tem a dizer no tooltip (só aparece quando há algo). */
interface DayInfo {
  day: Date;
  absences: DayAbsence[];
  quarterEnd: string | null;
  isLaunch: boolean;
}

interface CheckpointCalendarProps {
  /** Já filtrados pelo card — os filtros são compartilhados pelas três visões. */
  checkpoints: CalendarCheckpoint[];
  /** Há filtro ligado: muda o texto do vazio ("nada casa" ≠ "não existe"). */
  filterActive?: boolean;
  /** Data de lançamento da entidade — marcada no dia correspondente. */
  launchDate?: Date | string | null;
  /**
   * A árvore inteira (id → nome e pai), SEM filtro: o tooltip a usa para dizer
   * de que checkpoint um item faz parte. Sem ela cai nos `checkpoints`.
   */
  arvore?: ReadonlyMap<string, NoDaArvore>;
  /** Sem permissão de edição o calendário só lê: nada de arrastar nem criar. */
  isEditable?: boolean;
  /** Clique numa barra — a página dona leva até o checkpoint. */
  onOpenCheckpoint?: (id: string) => void;
  /** Clique num dia vazio: cria um checkpoint já com essa data (`YYYY-MM-DD`). */
  onCreateAt?: (dateISO: string) => void;
  /** Arrastar a barra para outro dia. `startDate` nulo = checkpoint sem início. */
  onUpdateDates?: (id: string, startDate: string | null, dueDate: string) => void;
  /**
   * Tamanho do período visível. "mes" é a grade de 5-6 semanas; "semana" é
   * uma linha só, com as faixas todas abertas (sem "+N": numa semana cabe
   * mostrar tudo, e era o overflow que fazia o mês esconder trabalho).
   */
  escopo?: "mes" | "semana";
  /**
   * Progresso de cada marco com necessários (árvore inteira, sem filtro): o
   * tooltip do marco diz o que falta, e o do necessário diz que marco ele
   * destrava.
   */
  progressoPorMarco?: Map<string, ProgressoDoMarco<MarcoCheckpoint>>;
}

// Mesma semântica de cor do roadmap: concluído verde, prazo vencido laranja,
// em aberto azul. Repetida aqui (e não importada) porque lá as funções são
// privadas do Gantt e recebem outro tipo. O filete lateral saiu do `className`
// para o style: numa barra cortada pela semana ele não pode aparecer, senão
// finge um início que está na semana anterior.
const TONE_STYLES: Record<Span["tone"], { bar: string; accent: string; text: string }> = {
  done: { bar: "bg-sage-soft", accent: "var(--sage)", text: "var(--color-forest)" },
  late: { bar: "bg-peach-soft", accent: "var(--peach)", text: "var(--peach-strong)" },
  open: { bar: "bg-sky-soft", accent: "var(--sky)", text: "#1B4D6E" },
};

/**
 * Cor da barra: a CATEGORIA manda, quando existe — é o sinal que a pessoa
 * procura ("o que é comunicação nesta semana?").
 *
 * Menos no ATRASADO: prazo vencido continua em peach, porque perder a data é
 * mais urgente que saber a categoria, e o calendário é onde isso se vê. Um
 * comunicado atrasado aparece como atrasado — a categoria segue no ícone.
 */
function estiloDaBarra(span: Span) {
  if (span.tone === "late") return TONE_STYLES.late;
  const cat = getCategoriaConfig(span.cp.categoria);
  return cat ? { bar: cat.bar, accent: cat.accent, text: cat.text } : TONE_STYLES[span.tone];
}

const TONE_LABEL: Record<Span["tone"], string> = {
  done: "Concluído",
  late: "Prazo vencido",
  open: "Em aberto",
};

/** Dia sob o ponteiro — cada célula de dia carrega o `data-day`. */
function dayAtPoint(x: number, y: number): Date | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const iso = (el as HTMLElement).dataset?.day;
    if (iso) return new Date(iso + "T00:00:00.000Z");
  }
  return null;
}

/**
 * "07 – 13 de set." quando a semana fica no mesmo mês; "28 de set. – 04 de
 * out." quando ela cruza.
 *
 * Repetir o mês nas duas pontas gastava ~45px a mais que o rótulo do mês,
 * e a faixa de navegação (flex-wrap) quebrava a contagem e o Barras/Compacto
 * para a linha de baixo — a posição dos controles mudava ao trocar de aba.
 */
function rotuloDaSemana(inicio: Date, fim: Date): string {
  const mesmoMes = inicio.getUTCMonth() === fim.getUTCMonth();
  if (!mesmoMes) return `${formatDayMonth(inicio)} – ${formatDayMonth(fim)}`;
  const dia = inicio.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "UTC" });
  return `${dia} – ${formatDayMonth(fim)}`;
}

export function CheckpointCalendar({
  checkpoints: checkpointsProp,
  filterActive = false,
  launchDate,
  arvore,
  isEditable = false,
  onOpenCheckpoint,
  onCreateAt,
  onUpdateDates,
  escopo = "mes",
  progressoPorMarco,
}: CheckpointCalendarProps) {
  const hoje = useTodayUTC();
  // Inverso do progresso: de quais marcos cada checkpoint é necessário.
  const marcosPorItem = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [marcoId, p] of progressoPorMarco ?? []) {
      const nome = arvore?.get(marcoId)?.name;
      if (!nome) continue;
      for (const r of p.requisitos) m.set(r.id, [...(m.get(r.id) ?? []), nome]);
    }
    return m;
  }, [progressoPorMarco, arvore]);
  // Comunicação entra como nível 0 (ver soltoNoCalendario): barra cheia, sem
  // recuo. O parentId fica — é dele que o tooltip tira o nome do pai.
  const checkpoints = useMemo(() => paraCalendario(checkpointsProp), [checkpointsProp]);
  const { tip, bind, show, clear } = useCursorTooltip<CalendarCheckpoint>();
  const dayTip = useCursorTooltip<DayInfo>();

  const canDrag = isEditable && !!onUpdateDates;
  const canCreate = isEditable && !!onCreateAt;

  // ── Modo de exibição ──────────────────────────────────────────────────────
  const [density, setDensity] = useState<"bars" | "dots">("bars");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());

  // Largura do card, não da janela: o calendário mora numa coluna que encolhe
  // quando os comentários abrem, então media query de viewport erraria.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Arrastar para remarcar ────────────────────────────────────────────────
  const dragRef = useRef<{
    id: string;
    origStart: Date;
    origEnd: Date;
    hasStart: boolean;
    anchorDay: number | null;
    /** O dia sob o ponteiro já mudou em relação à âncora. */
    moved: boolean;
    /** O ponteiro andou o bastante para não ser mais um clique. */
    arrastou: boolean;
    startX: number;
    startY: number;
    pointerId: number;
    /**
     * "mover" empurra as duas pontas; "inicio" e "fim" mexem numa só.
     *
     * Arrastar a ponta esquerda de um checkpoint SEM início cria o início —
     * é como se transforma um prazo solto num período.
     */
    modo: "mover" | "inicio" | "fim";
  } | null>(null);
  const [livePos, setLivePos] = useState<{ id: string; start: Date; end: Date } | null>(null);
  // Espelho síncrono do livePos: o pointerup lê daqui, não do estado da closure,
  // que pode estar um render atrás do último pointermove.
  const livePosRef = useRef<{ id: string; start: Date; end: Date } | null>(null);
  /**
   * Maior número de linhas que cada semana teve durante o arrasto (chave: início
   * da semana em ms). A barra muda de semana e de faixa conforme se move, e a
   * altura das semanas seguia junto: o chão se mexia sob o ponteiro, o dia sob
   * ele mudava sozinho e a barra oscilava. Travar o mínimo faz a grade só
   * crescer durante o gesto — nunca encolher por baixo do mouse.
   *
   * É estado, não ref: a altura é lida no render, e ref lido no render não
   * re-renderiza quando muda. Só cresce durante o arrasto (ver mais abaixo, logo
   * depois de `weeks`) e zera em `encerrarArrasto`.
   */
  const [linhasTravadas, setLinhasTravadas] = useState<ReadonlyMap<number, number>>(
    () => new Map()
  );
  /**
   * Barra sob o dedo, desde o pointerdown.
   *
   * Existe porque `livePos` só nasce quando o arrasto cruza uma COLUNA DE DIA
   * inteira (~107px no mês): até lá não havia realce nenhum, o gesto parecia
   * morto e a conclusão natural era que arrastar não funcionava.
   */
  const [pressionada, setPressionada] = useState<string | null>(null);

  const spans = useMemo(() => {
    const base = checkpoints.map((cp) => toSpan(cp, hoje)).filter((s): s is Span => s !== null);
    if (!livePos) return base;
    // Pré-visualização do arrasto: recalcula também o tom, porque mover para
    // antes de hoje transforma um checkpoint em aberto em atrasado.
    return base.map((s) =>
      s.cp.id === livePos.id
        ? {
            ...s,
            start: livePos.start,
            end: livePos.end,
            tone: (s.cp.isCompleted ? "done" : livePos.end < hoje ? "late" : "open") as Span["tone"],
          }
        : s
    );
  }, [checkpoints, hoje, livePos]);

  // Ancestrais para o tooltip (a barra não tem espaço para indentar como a
  // lista faz). Vem da árvore inteira quando a página dona a passa: com filtro
  // ligado o pai pode nem estar entre os checkpoints desenhados aqui.
  const noPorId = useMemo(
    () =>
      arvore ??
      new Map<string, NoDaArvore>(
        checkpoints.map((cp) => [cp.id, { name: cp.name, parentId: cp.parentId }])
      ),
    [arvore, checkpoints]
  );

  // Família (o checkpoint, seus ancestrais e seus descendentes) para o realce
  // no hover: numa grade de dias não existe indentação que mostre a hierarquia.
  const parentById = useMemo(() => {
    const m = new Map<string, string | null>();
    // Solto não sobe para o pai no realce: passar o mouse nele não acende a
    // árvore de onde ele saiu.
    for (const cp of checkpoints) m.set(cp.id, soltoNoCalendario(cp) ? null : cp.parentId);
    return m;
  }, [checkpoints]);

  const childrenById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const cp of checkpoints) {
      if (!cp.parentId || soltoNoCalendario(cp)) continue;
      m.set(cp.parentId, [...(m.get(cp.parentId) ?? []), cp.id]);
    }
    return m;
  }, [checkpoints]);

  const familyOf = useCallback(
    (id: string) => {
      const fam = new Set<string>([id]);
      let pid = parentById.get(id) ?? null;
      while (pid) {
        fam.add(pid);
        pid = parentById.get(pid) ?? null;
      }
      const fila = [id];
      while (fila.length) {
        for (const filho of childrenById.get(fila.pop()!) ?? []) {
          if (fam.has(filho)) continue;
          fam.add(filho);
          fila.push(filho);
        }
      }
      return fam;
    },
    [parentById, childrenById]
  );

  const [hoverFamily, setHoverFamily] = useState<Set<string> | null>(null);

  // Mês inicial: o mês corrente se algum checkpoint o cruza; senão o mês do
  // checkpoint mais próximo de hoje — abrir num mês vazio parece bug.
  const [cursor, setCursor] = useState(() => {
    const agora = todayUTC();
    const inicial = checkpoints
      .map((cp) => toSpan(cp, agora))
      .filter((s): s is Span => s !== null);
    const cruzaMesAtual = inicial.some(
      (s) =>
        s.end >= new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)) &&
        s.start <= new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0))
    );
    if (cruzaMesAtual || inicial.length === 0) {
      return {
        year: agora.getUTCFullYear(),
        month: agora.getUTCMonth(),
        day: agora.getUTCDate(),
      };
    }
    const maisProximo = inicial.reduce((best, s) => {
      const dist = Math.min(Math.abs(diffDays(s.start, agora)), Math.abs(diffDays(s.end, agora)));
      const bestDist = Math.min(
        Math.abs(diffDays(best.start, agora)),
        Math.abs(diffDays(best.end, agora))
      );
      return dist < bestDist ? s : best;
    });
    return {
      year: maisProximo.start.getUTCFullYear(),
      month: maisProximo.start.getUTCMonth(),
      day: maisProximo.start.getUTCDate(),
    };
  });

  const emSemana = escopo === "semana";

  // O período é o mês do cursor ou a semana que o contém. Daqui para baixo o
  // componente fala em "período", não em mês: a grade, a busca de ausências,
  // a contagem e a navegação saem todas destes dois limites.
  //
  // Memoizado pelo cursor: as datas são os mesmos objetos entre renders (o
  // arraste re-renderiza a cada movimento), então os useMemo abaixo dependem
  // delas direto — sem converter para timestamp na lista de dependências.
  const { periodoStart, periodoEnd, gridStart, gridEnd, weekCount } = useMemo(() => {
    const inicio = emSemana
      ? startOfWeekMondayUTC(new Date(Date.UTC(cursor.year, cursor.month, cursor.day ?? 1)))
      : new Date(Date.UTC(cursor.year, cursor.month, 1));
    const fim = emSemana
      ? addUTCDays(inicio, 6)
      : new Date(Date.UTC(cursor.year, cursor.month + 1, 0));
    const inicioDaGrade = startOfWeekMondayUTC(inicio);
    // Semanas que cobrem o período: 1 na visão de semana, 5-6 na de mês.
    const semanas = emSemana ? 1 : Math.ceil((diffDays(fim, inicioDaGrade) + 1) / 7);
    return {
      periodoStart: inicio,
      periodoEnd: fim,
      gridStart: inicioDaGrade,
      gridEnd: addUTCDays(inicioDaGrade, semanas * 7 - 1),
      weekCount: semanas,
    };
  }, [cursor, emSemana]);

  const weeks = useMemo(
    () =>
      Array.from({ length: weekCount }, (_, i) => {
        const weekStart = addUTCDays(gridStart, i * 7);
        const expandido = expandedWeeks.has(weekStart.getTime());
        return {
          weekStart,
          expandido,
          ...packWeek(spans, weekStart, expandido || emSemana ? Infinity : MAX_LANES),
        };
      }),
    [spans, gridStart, weekCount, expandedWeeks, emSemana]
  );

  // Durante o arrasto a semana só cresce: se alguma pede mais linhas do que o
  // travado, a trava sobe já neste render (ajuste de estado durante o render —
  // o React refaz o componente antes de pintar, sem quadro intermediário).
  const arrastandoAgora = livePos !== null || pressionada !== null;
  if (arrastandoAgora) {
    let maisLinhas: Map<number, number> | null = null;
    for (const semana of weeks) {
      const chave = semana.weekStart.getTime();
      const linhas = linhasDaSemana(semana, density);
      if (linhas > (linhasTravadas.get(chave) ?? 0)) {
        maisLinhas ??= new Map(linhasTravadas);
        maisLinhas.set(chave, linhas);
      }
    }
    if (maisLinhas) setLinhasTravadas(maisLinhas);
  }

  // ── Contexto do mês: ausências e fim de quarter ───────────────────────────
  // Ausência explica metade dos prazos estourados, e é informação que só o
  // calendário mostra bem. Busca por janela visível, não o histórico inteiro.
  const [absences, setAbsences] = useState<
    { id: string; memberId: string; memberName: string; type: string; start: Date; end: Date }[]
  >([]);

  const gridStartMs = gridStart.getTime();
  const gridEndMs = gridEnd.getTime();

  useEffect(() => {
    let cancelado = false;
    getAusencias({ rangeStart: new Date(gridStartMs), rangeEnd: new Date(gridEndMs) })
      .then((rows) => {
        if (cancelado) return;
        setAbsences(
          rows.map((a) => ({
            id: a.id,
            memberId: a.memberId,
            memberName: a.member.name,
            type: a.type as string,
            start: toUTC(a.startDate)!,
            end: toUTC(a.endDate)!,
          }))
        );
      })
      // Contexto é acessório: se a busca falhar, o calendário continua de pé.
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [gridStartMs, gridEndMs]);

  const [quarters, setQuarters] = useState<{ id: string; label: string; end: Date }[]>([]);
  useEffect(() => {
    let cancelado = false;
    getQuarters()
      .then((qs) => {
        if (cancelado) return;
        setQuarters(
          qs.map((q) => ({ id: q.id, label: `Q${q.quarter} ${q.year}`, end: toUTC(q.endDate)! }))
        );
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  // Só as ausências de quem responde por algum checkpoint em vista — o resto do
  // time ausente não diz nada sobre esta iniciativa.
  const relevantMemberIds = useMemo(() => {
    const s = new Set<string>();
    for (const cp of checkpoints) for (const m of cp.members) s.add(m.id);
    return s;
  }, [checkpoints]);

  const absencesByDay = useMemo(() => {
    const map = new Map<number, DayAbsence[]>();
    const inicio = new Date(gridStartMs);
    const fim = new Date(gridEndMs);
    for (const a of absences) {
      if (!relevantMemberIds.has(a.memberId)) continue;
      for (let d = new Date(a.start); d <= a.end; d = addUTCDays(d, 1)) {
        if (d < inicio || d > fim) continue;
        const key = d.getTime();
        map.set(key, [
          ...(map.get(key) ?? []),
          { id: a.id, memberName: a.memberName, type: a.type },
        ]);
      }
    }
    return map;
  }, [absences, relevantMemberIds, gridStartMs, gridEndMs]);

  const quarterEndByDay = useMemo(() => {
    const map = new Map<number, string>();
    for (const q of quarters) map.set(q.end.getTime(), q.label);
    return map;
  }, [quarters]);

  const launchUTC = toUTC(launchDate);
  const noPeriodo = spans.filter((s) => s.end >= periodoStart && s.start <= periodoEnd).length;

  // ── Navegação ─────────────────────────────────────────────────────────────
  // Períodos que têm alguma barra — alimentam os saltos "«"/"»" e o atalho do
  // período vazio, para não navegar um a um até achar o próximo checkpoint.
  // A chave é o início do período em ms, o que serve para mês e para semana.
  const periodosComSpan = useMemo(() => {
    const set = new Set<number>();
    const inicioDoPeriodo = (d: Date) =>
      emSemana
        ? startOfWeekMondayUTC(d)
        : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    for (const s of spans) {
      const fim = inicioDoPeriodo(s.end).getTime();
      let atual = inicioDoPeriodo(s.start);
      // Anda de período em período até cobrir a barra: uma barra longa
      // aparece em todas as semanas (ou meses) que ela cruza.
      while (atual.getTime() <= fim) {
        set.add(atual.getTime());
        atual = emSemana
          ? addUTCDays(atual, 7)
          : new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() + 1, 1));
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [spans, emSemana]);

  const cursorKey = periodoStart.getTime();
  const proximoMes = periodosComSpan.find((k) => k > cursorKey) ?? null;
  const mesAnterior = [...periodosComSpan].reverse().find((k) => k < cursorKey) ?? null;

  const irPara = (d: Date) =>
    setCursor({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
    });

  function goToKey(key: number) {
    irPara(new Date(key));
  }

  function shiftMonth(delta: number) {
    // Um passo é uma semana ou um mês, conforme o escopo.
    irPara(
      emSemana
        ? addUTCDays(periodoStart, delta * 7)
        : new Date(Date.UTC(periodoStart.getUTCFullYear(), periodoStart.getUTCMonth() + delta, 1))
    );
  }

  function goToday() {
    irPara(hoje);
  }

  /**
   * Atalho do mês vazio: aponta para o checkpoint mais próximo — para a frente
   * quando existe, senão para trás. Num mês posterior a tudo (o caso de quem
   * abre "Hoje" numa iniciativa que já acabou) olhar só para frente não achava
   * nada e a tela ficava sem saída.
   */
  const atalhoVazio = useMemo(() => {
    const paraFrente = proximoMes !== null;
    const alvo = proximoMes ?? mesAnterior;
    if (alvo === null) return null;
    const candidatos = paraFrente
      ? spans
          .filter((s) => s.end.getTime() >= alvo)
          .sort((a, b) => a.start.getTime() - b.start.getTime())
      : spans
          .filter((s) => s.start.getTime() <= alvo)
          .sort((a, b) => b.end.getTime() - a.end.getTime());
    const barra = candidatos[0];
    return barra ? { alvo, barra, paraFrente } : null;
  }, [spans, proximoMes, mesAnterior]);

  function handleKeyDown(e: React.KeyboardEvent) {
    // Esc desiste do arrasto: a barra volta ao lugar e nada é gravado.
    if (e.key === "Escape" && dragRef.current) {
      encerrarArrasto();
      return;
    }
    const alvo = e.target as HTMLElement;
    if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT") return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      shiftMonth(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      shiftMonth(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goToday();
    }
  }

  // ── Barra: clique, arrasto e teclado ──────────────────────────────────────
  function handleBarPointerDown(
    e: React.PointerEvent,
    span: Span,
    modo: "mover" | "inicio" | "fim" = "mover"
  ) {
    if (e.button !== 0) return;
    // Numa alça o gesto é só de redimensionar: sem isto o pointerdown subia
    // para a barra e os dois modos disputavam o mesmo arrasto.
    if (modo !== "mover") e.stopPropagation();
    const ancora = dayAtPoint(e.clientX, e.clientY);
    dragRef.current = {
      id: span.cp.id,
      origStart: span.start,
      origEnd: span.end,
      hasStart: span.cp.startDate != null,
      anchorDay: ancora ? ancora.getTime() : null,
      moved: false,
      arrastou: false,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      modo,
    };
    // A captura fica no CONTÊINER do calendário, não na barra: durante o
    // arrasto a barra troca de semana (e de faixa) e o React desmonta o botão
    // de origem — a captura ia embora junto, o pointerup nunca chegava e o
    // arrasto ficava "preso", seguindo o mouse depois de soltar. O contêiner
    // não sai do lugar. Sem permissão de editar não há captura: o clique
    // simples segue normal.
    //
    // Em try/catch porque um pointerId já liberado faz o setPointerCapture
    // lançar — e derrubar o handler junto levaria o clique embora também.
    if (canDrag) {
      setPressionada(span.cp.id);
      try {
        wrapRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* segue sem captura: o arrasto ainda funciona enquanto o ponteiro
           estiver sobre o calendário. */
      }
    }
  }

  /** Encerra o gesto, qualquer que seja o desfecho: solta, cancela ou Esc. */
  function encerrarArrasto() {
    dragRef.current = null;
    livePosRef.current = null;
    setLinhasTravadas((atual) => (atual.size > 0 ? new Map() : atual));
    setPressionada(null);
    setLivePos(null);
  }

  /** Publica a prévia só quando ela muda — o pointermove dispara a cada pixel. */
  function publicarPrevia(id: string, start: Date, end: Date) {
    const atual = livePosRef.current;
    if (
      atual &&
      atual.id === id &&
      atual.start.getTime() === start.getTime() &&
      atual.end.getTime() === end.getTime()
    ) {
      return;
    }
    const proxima = { id, start, end };
    livePosRef.current = proxima;
    setLivePos(proxima);
  }

  function handleDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !canDrag || d.pointerId !== e.pointerId) return;
    if (!d.arrastou && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= 5) {
      d.arrastou = true;
      // Tooltips e realce de família não fazem sentido no meio do arrasto.
      clear();
      dayTip.clear();
      setHoverFamily(null);
    }
    if (d.anchorDay === null) return;
    const atual = dayAtPoint(e.clientX, e.clientY);
    if (!atual) return;
    const deltaDays = Math.round((atual.getTime() - d.anchorDay) / MS_DAY);
    if (deltaDays === 0 && !d.moved) return;
    d.moved = true;

    if (d.modo === "mover") {
      publicarPrevia(d.id, addUTCDays(d.origStart, deltaDays), addUTCDays(d.origEnd, deltaDays));
      return;
    }

    // Redimensionar: a ponta arrastada não passa da outra. Empurrar o início
    // para depois do fim (ou o contrário) daria um intervalo invertido, que o
    // resto da tela desenharia como barra de largura negativa.
    if (d.modo === "inicio") {
      const novo = addUTCDays(d.origStart, deltaDays);
      publicarPrevia(d.id, novo > d.origEnd ? d.origEnd : novo, d.origEnd);
    } else {
      const novo = addUTCDays(d.origEnd, deltaDays);
      publicarPrevia(d.id, d.origStart, novo < d.origStart ? d.origStart : novo);
    }
  }

  function handleDragEnd(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const live = livePosRef.current;
    encerrarArrasto();

    // Só leitura: sem captura, o pointerup chega onde o dedo soltou — é clique
    // só se foi na própria barra.
    if (!canDrag) {
      const solta = (e.target as Element).closest?.("[data-bar-id]");
      if (solta?.getAttribute("data-bar-id") === d.id) onOpenCheckpoint?.(d.id);
      return;
    }

    const mudou =
      d.moved &&
      live &&
      (live.start.getTime() !== d.origStart.getTime() || live.end.getTime() !== d.origEnd.getTime());
    if (!mudou) {
      // Sem remarcar: um clique abre o checkpoint. Quem arrastou e voltou ao
      // mesmo lugar desistiu do gesto — não leva a pessoa para a lista.
      if (!d.arrastou) onOpenCheckpoint?.(d.id);
      return;
    }
    // Mover preserva "sem início" (a barra de um dia continua sem início).
    // Arrastar a ponta esquerda, ao contrário, é justamente o gesto de DAR um
    // início a quem só tinha prazo.
    const mantemSemInicio = d.modo === "mover" && !d.hasStart;
    onUpdateDates?.(
      d.id,
      mantemSemInicio ? null : toDateStr(live!.start),
      toDateStr(live!.end)
    );
  }

  function barA11yLabel(span: Span): string {
    const quando = span.cp.startDate
      ? `de ${fmtShort(span.cp.startDate)} a ${fmtShort(span.cp.dueDate)}`
      : `prazo ${fmtShort(span.cp.dueDate)}`;
    return `${span.cp.name}, ${quando}, ${TONE_LABEL[span.tone].toLowerCase()}`;
  }

  /**
   * Tudo que uma barra (ou pontinho) precisa: tooltip por mouse E por foco de
   * teclado, realce da família, clique/arrasto.
   */
  function barBind(span: Span) {
    const mouse = bind(span.cp);
    return {
      onMouseEnter: (e: React.MouseEvent) => {
        mouse.onMouseEnter(e);
        setHoverFamily(familyOf(span.cp.id));
      },
      onMouseLeave: () => {
        clear();
        setHoverFamily(null);
      },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        show(span.cp, r.left + r.width / 2, r.top);
        setHoverFamily(familyOf(span.cp.id));
      },
      onBlur: () => {
        clear();
        setHoverFamily(null);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onOpenCheckpoint?.(span.cp.id);
        }
      },
      onPointerDown: (e: React.PointerEvent) => handleBarPointerDown(e, span),
      // Move/solta/cancela moram no contêiner (ver handleBarPointerDown).
      "data-bar-id": span.cp.id,
    };
  }

  /** Realce da família: o resto das barras apaga enquanto o hover dura. */
  function dimOf(id: string): number {
    return hoverFamily && !hoverFamily.has(id) ? 0.3 : 1;
  }

  // ── Célula de dia ─────────────────────────────────────────────────────────
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  function renderDayCell(day: Date, di: number, spansDoDia: Span[]) {
    // Na visão de semana a grade É o período, então nunca há dia de fora.
    const foraDoMes = day < periodoStart || day > periodoEnd;
    const isHoje = day.getTime() === hoje.getTime();
    const info: DayInfo = {
      day,
      absences: absencesByDay.get(day.getTime()) ?? [],
      quarterEnd: quarterEndByDay.get(day.getTime()) ?? null,
      isLaunch: !!launchUTC && day.getTime() === launchUTC.getTime(),
    };
    const temInfo = info.absences.length > 0 || info.quarterEnd !== null || info.isLaunch;
    const iso = toDateStr(day);
    const borda = `1px solid ${isHoje ? "var(--butter)" : "var(--border-subtle)"}`;

    return (
      <div
        key={di}
        data-day={iso}
        onClick={canCreate ? () => onCreateAt!(iso) : undefined}
        onMouseEnter={(e) => {
          setHoverDay(day.getTime());
          if (temInfo || canCreate) dayTip.show(info, e.clientX, e.clientY);
        }}
        onMouseLeave={() => {
          setHoverDay(null);
          dayTip.clear();
        }}
        style={{
          gridColumn: di + 1,
          gridRow: "1 / -1",
          position: "relative",
          // A ausência NÃO pinta a célula — só a faixa no topo (abaixo).
          //
          // Pintar o dia inteiro competia no mesmo eixo visual das barras:
          // ambos são preenchimentos suaves, e férias (sky-soft) tinha
          // exatamente a cor da barra "em aberto" — um dia de férias lia como
          // um checkpoint aberto gigante. A faixa é marca de borda, outro
          // eixo, então não se confunde com barra nenhuma.
          //
          // Assim "hoje" fica sendo o ÚNICO fundo de célula da grade, o que
          // também o torna mais fácil de achar.
          background: isHoje
            ? "var(--butter-soft)"
            : foraDoMes
              ? "transparent"
              : "var(--bg-surface)",
          border: borda,
          // Fim de quarter: divisória no último dia do trimestre.
          borderRight: info.quarterEnd ? "2px dashed var(--peach)" : borda,
          borderRadius: "var(--radius-md)",
          opacity: foraDoMes ? 0.45 : 1,
          padding: 3,
          // Espaço para a faixa de ausência sem encostar no número do dia.
          paddingTop: info.absences.length > 0 ? 9 : 3,
          cursor: canCreate ? "copy" : undefined,
        }}
      >
        {/* Faixa de ausência: no topo da célula, onde barra nenhuma passa, e
            ÚNICO sinal da ausência desde que a célula deixou de ser pintada.
            Daí os 6px (eram 4): com o fundo ela era um reforço; sozinha,
            precisa ser vista. A cor é a do tipo, e duas ou três ausências no
            mesmo dia dividem a faixa.

            Os cantos de cima seguem o raio da célula (`overflow: hidden` no
            container, que também arredonda os segmentos das pontas): quadrada,
            ela vazava por fora da borda arredondada do dia. E o número do dia
            desce 6px onde há ausência (o paddingTop da célula), para a faixa
            não encostar na data. */}
        {info.absences.length > 0 && (
          <div
            className="absolute flex gap-[2px]"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: 6,
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              overflow: "hidden",
            }}
            aria-hidden="true"
          >
            {info.absences.slice(0, 3).map((a) => (
              <span
                key={a.id}
                style={{
                  flex: 1,
                  background: getAusenciaStripColor(a.type),
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between" style={{ height: DAY_NUM_H - 8 }}>
          <span
            className="text-[11px] font-semibold"
            style={{ color: isHoje ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            {day.getUTCDate()}
          </span>
          <span className="flex items-center gap-0.5">
            {info.isLaunch && (
              <Flame size={11} style={{ color: "var(--peach)" }} aria-hidden="true" />
            )}
            {canCreate && hoverDay === day.getTime() && !info.isLaunch && (
              <Plus size={11} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            )}
          </span>
        </div>

        {/* Modo compacto: pontinhos no lugar das barras, um por checkpoint do dia */}
        {density === "dots" && spansDoDia.length > 0 && (
          <div className="flex flex-wrap items-center gap-[3px] mt-0.5">
            {spansDoDia.slice(0, 6).map((s) => (
              <button
                key={s.cp.id}
                type="button"
                {...barBind(s)}
                onClick={(e) => e.stopPropagation()}
                aria-label={barA11yLabel(s)}
                className="shrink-0"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "var(--radius-full)",
                  background: estiloDaBarra(s).accent,
                  opacity: (s.cp.isCompleted ? 0.6 : 1) * dimOf(s.cp.id),
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              />
            ))}
            {spansDoDia.length > 6 && (
              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                +{spansDoDia.length - 6}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Agenda (card estreito) ────────────────────────────────────────────────
  const agenda = useMemo(
    () =>
      spans
        .filter((s) => s.end >= periodoStart && s.start <= periodoEnd)
        .sort((a, b) => a.end.getTime() - b.end.getTime() || a.start.getTime() - b.start.getTime()),
    [spans, periodoStart, periodoEnd]
  );

  return (
    <div
      ref={wrapRef}
      className="space-y-3 focus:outline-none"
      tabIndex={0}
      role="group"
      aria-label="Calendário de checkpoints — setas mudam de mês, Home volta para hoje"
      onKeyDown={handleKeyDown}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={encerrarArrasto}
      onLostPointerCapture={encerrarArrasto}
    >
      {/* Navegação, legenda e board só aparecem quando há checkpoint: sem
          nenhum, o card empilhava nav + "nenhum neste mês" + empty state. */}
      {checkpoints.length > 0 && (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <IconButton
            aria-label={emSemana ? "Semana anterior com checkpoint" : "Mês anterior com checkpoint"}
            title={emSemana ? "Semana anterior com checkpoint" : "Mês anterior com checkpoint"}
            disabled={mesAnterior === null}
            style={{ opacity: mesAnterior === null ? 0.35 : 1 }}
            onClick={() => mesAnterior !== null && goToKey(mesAnterior)}
          >
            <ChevronsLeft size={16} />
          </IconButton>
          <IconButton
            aria-label={emSemana ? "Semana anterior" : "Mês anterior"}
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <span
            className="text-sm font-semibold min-w-[150px] text-center"
            style={{ color: "var(--text-primary)" }}
            aria-live="polite"
          >
            {emSemana
              ? rotuloDaSemana(periodoStart, periodoEnd)
              : monthLabel(periodoStart.getUTCFullYear(), periodoStart.getUTCMonth())}
          </span>
          <IconButton
            aria-label={emSemana ? "Semana seguinte" : "Mês seguinte"}
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight size={16} />
          </IconButton>
          <IconButton
            aria-label={emSemana ? "Próxima semana com checkpoint" : "Próximo mês com checkpoint"}
            title={emSemana ? "Próxima semana com checkpoint" : "Próximo mês com checkpoint"}
            disabled={proximoMes === null}
            style={{ opacity: proximoMes === null ? 0.35 : 1 }}
            onClick={() => proximoMes !== null && goToKey(proximoMes)}
          >
            <ChevronsRight size={16} />
          </IconButton>
          <button
            type="button"
            onClick={goToday}
            className="text-xs font-medium px-2 py-1 transition-colors ml-1"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-full)",
              background: "var(--bg-surface)",
              cursor: "pointer",
            }}
          >
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {noPeriodo === 0
              ? `Nenhum checkpoint ${emSemana ? "nesta semana" : "neste mês"}`
              : `${noPeriodo} ${noPeriodo === 1 ? "checkpoint" : "checkpoints"} ${
                  emSemana ? "nesta semana" : "neste mês"
                }`}
          </span>
          {noPeriodo === 0 && atalhoVazio && (
            <button
              type="button"
              onClick={() => goToKey(atalhoVazio.alvo)}
              className="text-xs font-medium inline-flex items-center gap-1 transition-colors"
              style={{
                color: "var(--brand-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {!atalhoVazio.paraFrente && <ArrowLeft size={12} />}
              {atalhoVazio.paraFrente ? "Próximo" : "Anterior"}: {atalhoVazio.barra.cp.name} em{" "}
              {fmtShort(atalhoVazio.paraFrente ? atalhoVazio.barra.start : atalhoVazio.barra.end)}
              {atalhoVazio.paraFrente && <ArrowRight size={12} />}
            </button>
          )}
          {!narrow && (
            <SegmentedToggle
              ariaLabel="Densidade do calendário"
              value={density}
              onChange={(v) => setDensity(v as "bars" | "dots")}
              items={[
                { value: "bars", label: "Barras", icon: Rows3 },
                { value: "dots", label: "Compacto", icon: Grid2x2 },
              ]}
            />
          )}
        </div>
      </div>

      )}

      {/* Legenda — a cor carrega o estado inteiro; sem ela só o tooltip conta */}
      {checkpoints.length > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap text-[10px] uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-soft border border-sky" /> Planejado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-peach-soft border border-peach" /> Atrasado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sage-soft border border-sage" /> Concluído
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: "var(--butter-soft)", border: "1px solid var(--butter)" }}
            />
            Hoje
          </span>
          {launchUTC && (
            <span className="flex items-center gap-1">
              <Flame size={10} style={{ color: "var(--peach)" }} /> Lançamento
            </span>
          )}
          {/* Categoria: só enquanto houver alguma no card, senão a legenda
              anuncia uma cor que não aparece em lugar nenhum. */}
          {CHECKPOINT_CATEGORIAS.filter((cat) =>
            checkpoints.some((cp) => cp.categoria === cat)
          ).map((cat) => (
            <span key={cat} className="flex items-center gap-1">
              <span
                className={`w-2.5 h-2.5 rounded-sm ${CATEGORIA_CONFIG[cat].bar}`}
                style={{ borderLeft: `3px solid ${CATEGORIA_CONFIG[cat].accent}` }}
              />
              {CATEGORIA_CONFIG[cat].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            {/* Uma faixa, não um quadrado: é assim que a ausência aparece na
                grade desde que ela deixou de pintar o dia. Amostra em férias;
                a cor real é a do tipo de cada ausência. */}
            <span
              className="w-3 rounded-sm"
              style={{ height: 4, background: getAusenciaStripColor("FERIAS") }}
            />
            Ausência
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5" style={{ borderRight: "2px dashed var(--peach)", width: 2 }} />
            Fim de quarter
          </span>
          {canDrag && !narrow && (
            <span className="ml-auto text-[10px] flex items-center gap-1 normal-case">
              <Info size={10} /> Clique abre · arraste move · arraste a ponta estica · clique num dia cria
            </span>
          )}
        </div>
      )}

      {checkpoints.length > 0 && (narrow ? (
        // ── Agenda ────────────────────────────────────────────────────────
        // Numa coluna estreita, 7 colunas truncam o nome em três letras. A
        // lista por data diz a mesma coisa e cabe.
        <div className="space-y-1">
          {agenda.length === 0 ? null : (
            agenda.map((s) => {
              const styles = estiloDaBarra(s);
              return (
                <button
                  key={s.cp.id}
                  type="button"
                  onClick={() => onOpenCheckpoint?.(s.cp.id)}
                  {...bind(s.cp)}
                  aria-label={barA11yLabel(s)}
                  className="w-full flex items-center gap-2 text-left"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderLeft: `4px solid ${styles.accent}`,
                    borderRadius: "var(--radius-md)",
                    padding: "6px 8px",
                    cursor: onOpenCheckpoint ? "pointer" : "default",
                  }}
                >
                  <span
                    className="text-[11px] font-mono shrink-0"
                    style={{ color: "var(--text-muted)", width: 76 }}
                  >
                    {s.start.getTime() !== s.end.getTime()
                      ? `${fmtShort(s.start)}–${fmtShort(s.end)}`
                      : fmtShort(s.end)}
                  </span>
                  <span className="flex items-center gap-1 min-w-0 flex-1">
                    {s.cp.depth > 0 && (
                      <CornerDownRight
                        size={10}
                        className="shrink-0"
                        style={{ color: styles.text }}
                      />
                    )}
                    <span
                      className="text-xs font-medium truncate"
                      style={{
                        color: "var(--text-primary)",
                        textDecoration: s.cp.isCompleted ? "line-through" : undefined,
                      }}
                    >
                      {s.cp.name}
                    </span>
                  </span>
                  {s.cp.members.length > 0 && (
                    <span className="shrink-0">
                      <ResponsaveisCompactos members={s.cp.members} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      ) : (
        <>
          {/* Cabeçalho de dias da semana */}
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 }}
          >
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-[11px] font-semibold uppercase tracking-wide text-center py-1"
                style={{ color: "var(--text-muted)" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Semanas */}
          <div className="space-y-0.5">
            {weeks.map((semana, wi) => {
              const { weekStart, bars, overflow, expandido } = semana;
              const temRodape = overflow > 0 || expandido;
              // Durante o arrasto a semana só cresce (ver linhasTravadas).
              const rows = arrastandoAgora
                ? Math.max(
                    linhasDaSemana(semana, density),
                    linhasTravadas.get(weekStart.getTime()) ?? 0
                  )
                : linhasDaSemana(semana, density);
              const weekEnd = addUTCDays(weekStart, 6);
              const spansDaSemana = spans.filter((s) => s.end >= weekStart && s.start <= weekEnd);

              return (
                <div
                  key={wi}
                  className="grid"
                  style={{
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gridTemplateRows:
                      density === "dots"
                        ? `${DAY_NUM_H}px ${DOTS_H}px`
                        : `${DAY_NUM_H}px repeat(${Math.max(rows, LANES_MINIMAS)}, ${LANE_H}px)`,
                    gap: 2,
                    // O "Compacto" (pontinhos) fica de fora do piso: ele existe
                    // justamente para caber mais mês na tela.
                    minHeight:
                      density === "dots"
                        ? DAY_NUM_H + DOTS_H
                        : DAY_NUM_H + LANE_H * LANES_MINIMAS,
                  }}
                >
                  {/* Fundo dos dias: ocupa a altura toda da semana, atrás das barras */}
                  {Array.from({ length: 7 }, (_, di) => {
                    const day = addUTCDays(weekStart, di);
                    const doDia =
                      density === "dots"
                        ? spansDaSemana.filter((s) => s.start <= day && s.end >= day)
                        : [];
                    return renderDayCell(day, di, doDia);
                  })}

                  {/* Barras dos checkpoints */}
                  {density === "bars" &&
                    bars.map((bar) => {
                      const styles = estiloDaBarra(bar);
                      const isSub = bar.cp.depth > 0;
                      // Pegar já levanta a barra; não é preciso cruzar um dia.
                      const arrastando =
                        livePos?.id === bar.cp.id || pressionada === bar.cp.id;
                      // `rounded` do Tailwind (4px), o raio da barra do
                      // roadmap — --radius-sm (8px) arredondava bem mais.
                      const r = "4px";
                      return (
                        <button
                          key={bar.cp.id}
                          type="button"
                          {...barBind(bar)}
                          aria-label={barA11yLabel(bar)}
                          className={`flex items-center gap-1 overflow-hidden text-left ${styles.bar}`}
                          style={{
                            gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
                            gridRow: bar.lane + 2,
                            // Âncora das alças de redimensionar.
                            position: "relative",
                            // Ponta cortada pela semana fica reta e sem filete: a
                            // barra continua na semana vizinha, não começa ali.
                            borderRadius: `${bar.cutStart ? "0" : r} ${bar.cutEnd ? "0" : r} ${
                              bar.cutEnd ? "0" : r
                            } ${bar.cutStart ? "0" : r}`,
                            borderLeft: bar.cutStart ? "none" : `4px solid ${styles.accent}`,
                            // px-2 do roadmap.
                            padding: "0 8px",
                            // Subcheckpoint fica visualmente subordinado: barra
                            // menor e recuada, já que numa grade de dias não há
                            // indentação.
                            // 28px = BAR_H do roadmap. Subcheckpoint fica um
                            // pouco menor, a única diferença de cá — no
                            // roadmap não existe nível.
                            height: isSub ? LANE_H - 10 : LANE_H - 4,
                            marginLeft: bar.cutStart ? 0 : isSub ? 12 : 3,
                            marginRight: bar.cutEnd ? 0 : 3,
                            // Concluído: transparência SOMADA ao ícone e ao
                            // riscado. Só o riscado, em 12px, não segurava o
                            // olho — num mês cheio a barra concluída puxava
                            // tanta atenção quanto as abertas.
                            opacity: (bar.cp.isCompleted ? 0.6 : 1) * dimOf(bar.cp.id),
                            cursor: canDrag ? "grab" : onOpenCheckpoint ? "pointer" : "default",
                            zIndex: arrastando ? 20 : 10,
                            boxShadow: arrastando ? "0 2px 8px rgba(0,0,0,0.18)" : undefined,
                          }}
                        >
                          {/* Alças de redimensionar, uma por ponta.

                              Não existem na ponta CORTADA pela semana: aquele
                              lado não é o começo (ou o fim) do checkpoint, é
                              onde a semana acabou — arrastar dali mudaria uma
                              data que a pessoa não está vendo.

                              O cursor (w-resize/e-resize) é o que anuncia que
                              a ponta é pegável; a área é estreita de propósito
                              para não comer o gesto de mover. */}
                          {canDrag && !bar.cutStart && (
                            <span
                              onPointerDown={(e) => handleBarPointerDown(e, bar, "inicio")}
                              className="absolute inset-y-0 left-0"
                              style={{ width: HANDLE_W, cursor: "w-resize" }}
                              aria-hidden="true"
                            />
                          )}
                          {canDrag && !bar.cutEnd && (
                            <span
                              onPointerDown={(e) => handleBarPointerDown(e, bar, "fim")}
                              className="absolute inset-y-0 right-0"
                              style={{ width: HANDLE_W, cursor: "e-resize" }}
                              aria-hidden="true"
                            />
                          )}
                          {bar.cutStart && (
                            <ChevronLeft
                              size={9}
                              className="shrink-0"
                              style={{ color: styles.text }}
                            />
                          )}
                          {isSub && !bar.cutStart && (
                            <CornerDownRight
                              size={9}
                              className="shrink-0"
                              style={{ color: styles.text }}
                            />
                          )}
                          {bar.cp.isCompleted && (
                            <ListChecks size={11} strokeWidth={2.5} className="shrink-0 opacity-70" />
                          )}
                          <CategoriaIcon categoria={bar.cp.categoria} size={11} />
                          <span
                            className={`truncate flex-1 ${
                              isSub ? "text-[11px]" : "text-xs font-medium"
                            } ${bar.cp.isCompleted ? "line-through opacity-70" : ""}`}
                            style={{
                              color: styles.text,
                              textDecoration: bar.cp.isCompleted ? "line-through" : undefined,
                            }}
                          >
                            {bar.cp.name}
                          </span>
                          {/* Quem faz — a pergunta que o calendário de time
                              responde, e que só existia no tooltip e no modo
                              Compacto. Cabe agora que a barra tem 28px.
                              No mês, só a partir de dois dias: numa barra de
                              um dia o avatar não deixa sobrar nome. Na semana
                              sempre, que a coluna do dia é ~7× mais larga. */}
                          {bar.cp.members.length > 0 &&
                            (emSemana || bar.endCol - bar.startCol >= 1) && (
                              <span className="shrink-0 flex items-center">
                                <ResponsaveisCompactos members={bar.cp.members} />
                              </span>
                            )}
                          {bar.cutEnd && (
                            <ChevronRight
                              size={9}
                              className="shrink-0"
                              style={{ color: styles.text }}
                            />
                          )}
                        </button>
                      );
                    })}

                  {density === "bars" && temRodape && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedWeeks((prev) => {
                          const next = new Set(prev);
                          if (next.has(weekStart.getTime())) next.delete(weekStart.getTime());
                          else next.add(weekStart.getTime());
                          return next;
                        })
                      }
                      className="text-[10px] font-medium flex items-center gap-1 text-left"
                      style={{
                        gridColumn: "1 / -1",
                        gridRow: rows + 1,
                        color: "var(--text-muted)",
                        paddingLeft: 6,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {expandido
                        ? "Mostrar menos nesta semana"
                        : `+${overflow} ${
                            overflow === 1 ? "checkpoint" : "checkpoints"
                          } nesta semana — ver todos`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ))}

      {/* Só o vazio DE FILTRO mora aqui: ele é resposta ao filtro do card,
          não ao card estar vazio. O "Nenhum checkpoint definido" é da seção,
          que o desenha depois do campo de adicionar. */}
      {checkpoints.length === 0 && filterActive && (
        <EmptyState
          icon={ListChecks}
          title="Nada com esse filtro"
          description="Nenhum checkpoint corresponde ao filtro deste card."
        />
      )}

      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>{tip.data.name}</TooltipTitle>
          <TooltipLine>
            {tip.data.startDate
              ? `${fmtShort(tip.data.startDate)} – ${fmtShort(tip.data.dueDate)}`
              : `Prazo: ${fmtShort(tip.data.dueDate)}`}
          </TooltipLine>
          {(() => {
            const caminho = caminhoDosAncestrais(tip.data.parentId, noPorId);
            if (caminho.length === 0) return null;
            return (
              <TooltipLine dim>
                {soltoNoCalendario(tip.data) ? "Faz parte de" : "Sub de"}: {caminho.join(" › ")}
              </TooltipLine>
            );
          })()}
          {tip.data.members.length > 0 && (
            <TooltipLine dim>{formatMemberNames(tip.data.members)}</TooltipLine>
          )}
          {(() => {
            const p = progressoPorMarco?.get(tip.data.id);
            return p ? <TooltipDoMarco progresso={p} titulo={null} /> : null;
          })()}
          {marcosPorItem.has(tip.data.id) && (
            <TooltipLine dim>Necessário para: {marcosPorItem.get(tip.data.id)!.join(", ")}</TooltipLine>
          )}
          {tip.data.tags && tip.data.tags.length > 0 && (
            // Herdada (o checkpoint não tem tag própria): mesma pill, com a
            // indicação ao lado — senão pareceria uma tag dele.
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {/* O mesmo chip da linha da lista — uma tag tem uma cara só. */}
              {tip.data.tags.map((t) => (
                <CheckpointTagChip key={t.id} tag={t} />
              ))}
              {tip.data.tagsHerdadas && (
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                  herdada{tip.data.tags.length > 1 ? "s" : ""} do pai
                </span>
              )}
            </div>
          )}
          <TooltipLine dim italic>
            {tip.data.isCompleted
              ? "Concluído"
              : toUTC(tip.data.dueDate)! < hoje
                ? "Prazo vencido"
                : "Em aberto"}
          </TooltipLine>
          {onOpenCheckpoint && (
            <TooltipHint>
              {canDrag ? "Clique para abrir · arraste para remarcar" : "Clique para abrir"}
            </TooltipHint>
          )}
        </CursorTooltip>
      )}

      {dayTip.tip && (
        <CursorTooltip x={dayTip.tip.x} y={dayTip.tip.y}>
          <TooltipTitle>{fmtShort(dayTip.tip.data.day)}</TooltipTitle>
          {dayTip.tip.data.isLaunch && <TooltipLine>Lançamento</TooltipLine>}
          {dayTip.tip.data.quarterEnd && (
            <TooltipLine>Fim do {dayTip.tip.data.quarterEnd}</TooltipLine>
          )}
          {dayTip.tip.data.absences.map((a) => (
            <TooltipLine key={a.id} dim>
              {a.memberName} — {getAusenciaLabel(a.type)}
            </TooltipLine>
          ))}
          {canCreate && <TooltipHint>Clique para criar um checkpoint neste dia</TooltipHint>}
        </CursorTooltip>
      )}
    </div>
  );
}

/**
 * Responsáveis num espaço de 16px: o avatar do primeiro e, havendo mais, um
 * "+N" com a lista no tooltip. Mostrar só `members[0]` fazia um checkpoint
 * de duas pessoas parecer de uma só.
 */
function ResponsaveisCompactos({ members }: { members: { name: string }[] }) {
  const rotulo = useLabelTooltip();
  const resto = members.length - 1;
  return (
    <span
      className="inline-flex items-center gap-0.5"
      {...rotulo.alvo(resto > 0 ? formatMemberNames(members) : undefined)}
    >
      <Avatar name={members[0].name} size={16} />
      {resto > 0 && (
        <span className="text-[9px] font-semibold leading-none" style={{ color: "var(--text-muted)" }}>
          +{resto}
        </span>
      )}
      {rotulo.tooltip}
    </span>
  );
}
