"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  useDraggable,
} from "@dnd-kit/core";
import { GanttTimeline } from "@/components/iniciativas/GanttTimeline";
import { Avatar } from "@/components/shared/Avatar";
import { formatMemberNames } from "@/components/shared/MemberChips";
import { Info, ListChecks, ChevronRight, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  CATEGORIA_CONFIG,
  CategoriaIcon,
  getCategoriaConfig,
} from "@/components/shared/CheckpointCategoria";
import { getQuarters } from "@/actions/quarters";
import { CHECKPOINT_CATEGORIAS } from "@/lib/checkpoint-categoria";
import { MarcoProgressoSelo } from "@/components/shared/CheckpointMarco";
import type { MarcoCheckpoint, ProgressoDoMarco } from "@/lib/checkpoint-marco";

// ─── Constants ────────────────────────────────────────────────────────────────
const PX_PER_DAY = 14;
// Coluna do nome: a pessoa arrasta a borda para ler nomes longos, que em 200px
// truncavam cedo. A largura fica guardada no navegador (preferência de quem
// lê, não dado do checkpoint).
const LABEL_W_DEFAULT = 200;
const LABEL_W_MIN = 140;
const LABEL_W_MAX = 560;
const LABEL_W_STORAGE_KEY = "checkpoint-gantt:label-width";

function lerLarguraSalva(): number {
  try {
    const v = Number(window.localStorage.getItem(LABEL_W_STORAGE_KEY));
    return v >= LABEL_W_MIN && v <= LABEL_W_MAX ? v : LABEL_W_DEFAULT;
  } catch {
    return LABEL_W_DEFAULT;
  }
}
const ITEM_H = 40;
const BAR_H = 28;
// Avatares de responsável dentro da barra antes de agrupar o resto em "+N".
const BAR_AVATARES_MAX = 3;
const ROW_PAD = 6;
const HANDLE_W = 8;

// ─── Date helpers (UTC-safe, same as RoadmapView) ────────────────────────────
function toUTC(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
function fmtShort(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

// ─── Color helpers ────────────────────────────────────────────────────────────
/**
 * Cor da barra. Mesma regra do calendário (estiloDaBarra em
 * CheckpointCalendar): a categoria manda, menos no ATRASADO — perder o prazo
 * é mais urgente que saber a categoria. Sem isso, a mesma comunicação
 * aparecia blush no Mês e sky aqui.
 */
function getBarStyles(cp: Checkpoint, todayUTC: Date) {
  const due = toUTC(cp.dueDate);
  if (!cp.isCompleted && due && due < todayUTC) {
    return "bg-peach-soft border-l-4 border-l-peach";
  }
  if (cp.isCompleted) return "bg-sage-soft border-l-4 border-l-sage";
  const cat = getCategoriaConfig(cp.categoria);
  if (cat) return `${cat.bar} border-l-4`;
  return "bg-sky-soft border-l-4 border-l-sky";
}

function getTextColor(cp: Checkpoint, todayUTC: Date) {
  const due = toUTC(cp.dueDate);
  if (!cp.isCompleted && due && due < todayUTC) return "var(--peach-strong)";
  if (cp.isCompleted) return "var(--color-forest)";
  const cat = getCategoriaConfig(cp.categoria);
  return cat ? cat.text : "#1B4D6E";
}

/** Filete lateral da categoria — a classe border-l-* não cobre blush. */
function getBarBorderColor(cp: Checkpoint, todayUTC: Date): string | undefined {
  const due = toUTC(cp.dueDate);
  if (cp.isCompleted || (due && due < todayUTC)) return undefined;
  return getCategoriaConfig(cp.categoria)?.accent;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Checkpoint {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | string | null;
  dueDate: Date | string;
  isCompleted: boolean;
  completedAt: Date | string | null;
  members: { id: string; name: string }[];
  /** Hierarquia: raiz tem parentId null; depth 0 = raiz, 1 = sub, etc. */
  parentId?: string | null;
  depth?: number;
  /** Categoria (hoje só "comunicação"); null = checkpoint comum. */
  categoria?: string | null;
}

/**
 * Ordem do roadmap: sempre cronológica, da data mais próxima para a mais
 * distante — independe da ordenação escolhida na lista. Cada grupo de irmãos
 * é ordenado pelo início (sem início, conta o prazo), depois pelo prazo; a
 * pré-ordem (pai logo antes da própria subárvore) é mantida. Quem tem o pai
 * fora da lista entra como raiz.
 */
function ordenarPorData(items: Checkpoint[]): Checkpoint[] {
  const ids = new Set(items.map((i) => i.id));
  const irmaos = new Map<string | null, Checkpoint[]>();
  for (const item of items) {
    const pai = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const g = irmaos.get(pai);
    if (g) g.push(item);
    else irmaos.set(pai, [item]);
  }
  const inicio = (c: Checkpoint) => new Date(c.startDate ?? c.dueDate).getTime();
  const fim = (c: Checkpoint) => new Date(c.dueDate).getTime();
  const vistos = new Set<string>();
  const emOrdem = (pai: string | null): Checkpoint[] =>
    [...(irmaos.get(pai) ?? [])]
      .sort((a, b) => inicio(a) - inicio(b) || fim(a) - fim(b))
      .flatMap((c) => {
        if (vistos.has(c.id)) return [];
        vistos.add(c.id);
        return [c, ...emOrdem(c.id)];
      });
  return emOrdem(null);
}

interface LivePos {
  id: string;
  startDate: Date;
  dueDate: Date;
}

interface DraggableBarProps {
  /** Necessário pendente que vence depois do marco: contorno de alerta. */
  alerta: boolean;
  cp: Checkpoint;
  timelineStart: Date;
  livePos: LivePos | null;
  todayUTC: Date;
  isEditable: boolean;
}

// Fora do componente de propósito: se este objeto nascesse a cada render, o
// useSensor recriaria os sensores, o dnd-kit recriaria os listeners de todas as
// barras e o memo do corpo de cada uma (BarBody) cairia a cada render.
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 6 } };

// ─── Draggable bar ────────────────────────────────────────────────────────────
function DraggableBar({ cp, timelineStart, livePos, todayUTC, isEditable, alerta }: DraggableBarProps) {
  const isLive = livePos?.id === cp.id;

  const { attributes: moveAttrs, listeners: moveListeners, setNodeRef: setMoveRef, isDragging } =
    useDraggable({ id: `move-${cp.id}`, disabled: !isEditable });
  const { attributes: leftAttrs, listeners: leftListeners, setNodeRef: setLeftRef } =
    useDraggable({ id: `resize-left-${cp.id}`, disabled: !isEditable });
  const { attributes: rightAttrs, listeners: rightListeners, setNodeRef: setRightRef } =
    useDraggable({ id: `resize-right-${cp.id}`, disabled: !isEditable });

  // Effective start: if no startDate, show 1-day bar on dueDate
  const rawStart = isLive ? livePos.startDate : (cp.startDate ?? cp.dueDate);
  const rawEnd = isLive ? livePos.dueDate : cp.dueDate;

  const s = toUTC(rawStart);
  const e = toUTC(rawEnd);
  if (!s || !e) return null;

  const leftPx = diffDays(s, timelineStart) * PX_PER_DAY;
  const widthPx = Math.max((diffDays(e, s) + 1) * PX_PER_DAY, PX_PER_DAY);

  const barClasses = getBarStyles(cp, todayUTC);
  const textColor = getTextColor(cp, todayUTC);
  const barBorderColor = getBarBorderColor(cp, todayUTC);

  // Esta camada re-renderiza a cada movimento do mouse durante QUALQUER arraste:
  // o useDraggable assina o contexto do dnd-kit, que muda a cada pixel, e isso
  // vale para todas as barras. Aqui fica só o barato (hooks, posição, cores
  // como string); o corpo, memoizado, só re-renderiza quando ESTA barra muda.
  return (
    <BarBody
      alerta={alerta}
      cp={cp}
      leftPx={leftPx}
      widthPx={widthPx}
      isLive={isLive}
      isDragging={isDragging}
      isEditable={isEditable}
      barClasses={barClasses}
      textColor={textColor}
      barBorderColor={barBorderColor}
      setMoveRef={setMoveRef}
      moveListeners={moveListeners}
      moveAttrs={moveAttrs}
      setLeftRef={setLeftRef}
      leftListeners={leftListeners}
      leftAttrs={leftAttrs}
      setRightRef={setRightRef}
      rightListeners={rightListeners}
      rightAttrs={rightAttrs}
    />
  );
}

type DraggableHandle = ReturnType<typeof useDraggable>;

interface BarBodyProps {
  alerta: boolean;
  cp: Checkpoint;
  leftPx: number;
  widthPx: number;
  isLive: boolean;
  isDragging: boolean;
  isEditable: boolean;
  barClasses: string;
  textColor: string | undefined;
  barBorderColor: string | undefined;
  setMoveRef: DraggableHandle["setNodeRef"];
  moveListeners: DraggableHandle["listeners"];
  moveAttrs: DraggableHandle["attributes"];
  setLeftRef: DraggableHandle["setNodeRef"];
  leftListeners: DraggableHandle["listeners"];
  leftAttrs: DraggableHandle["attributes"];
  setRightRef: DraggableHandle["setNodeRef"];
  rightListeners: DraggableHandle["listeners"];
  rightAttrs: DraggableHandle["attributes"];
}

const BarBody = memo(function BarBody({
  alerta,
  cp,
  leftPx,
  widthPx,
  isLive,
  isDragging,
  isEditable,
  barClasses,
  textColor,
  barBorderColor,
  setMoveRef,
  moveListeners,
  moveAttrs,
  setLeftRef,
  leftListeners,
  leftAttrs,
  setRightRef,
  rightListeners,
  rightAttrs,
}: BarBodyProps) {
  return (
    <div
      data-checkpoint-bar
      className={`absolute flex items-center rounded select-none ${barClasses} transition-colors`}
      style={{
        left: leftPx,
        top: (ITEM_H - BAR_H) / 2,
        width: widthPx,
        height: BAR_H,
        // Concluído fica transparente, como no Mês/Semana: o riscado sozinho
        // não segura o olho numa linha do tempo cheia.
        opacity: isDragging ? 0.6 : cp.isCompleted ? 0.6 : 1,
        zIndex: isLive ? 20 : 10,
        color: textColor,
        // A cor do filete vem daqui quando é da categoria: `border-l-*` do
        // Tailwind não tem classe para blush.
        ...(barBorderColor ? { borderLeftColor: barBorderColor } : {}),
        // Necessário que vence depois do marco: a data do marco não fecha.
        // Contorno peach, a cor do atraso, sem trocar o fundo da categoria.
        ...(alerta ? { outline: "2px solid var(--peach)", outlineOffset: 1 } : {}),
      }}
    >
      {/* Left resize handle */}
      {isEditable && (
        <div
          ref={setLeftRef}
          {...leftListeners}
          {...leftAttrs}
          className="absolute left-0 top-0 bottom-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-20"
          style={{ width: HANDLE_W, cursor: "w-resize" }}
        >
          <div className="w-0.5 h-3 rounded bg-black/10" />
        </div>
      )}

      {/* Main move area */}
      <div
        ref={setMoveRef}
        {...moveListeners}
        {...moveAttrs}
        className={`flex-1 h-full flex items-center px-2 ${isEditable ? "cursor-grab active:cursor-grabbing hover:brightness-95" : "cursor-default"} transition-[filter]`}
      >
        <div className="flex items-center gap-1.5 pointer-events-none whitespace-nowrap overflow-hidden">
          {cp.isCompleted && <ListChecks size={11} strokeWidth={2.5} className="shrink-0 opacity-70" />}
          <CategoriaIcon categoria={cp.categoria} size={11} />
          <span className={`text-xs font-medium truncate ${cp.isCompleted ? "line-through opacity-70" : ""}`}>
            {cp.name}
          </span>
          {/* Responsáveis no fim do nome: o nome trunca antes, os avatares
              ficam. Até 3 sobrepostos e "+N" — nunca só o primeiro (é N:N). */}
          {cp.members.length > 0 && (
            <span className="flex items-center shrink-0">
              {cp.members.slice(0, BAR_AVATARES_MAX).map((m, i) => (
                <span
                  key={m.id}
                  className="rounded-full"
                  style={{ marginLeft: i === 0 ? 0 : -5, boxShadow: "0 0 0 1.5px var(--bg-surface)" }}
                >
                  <Avatar name={m.name} size={16} />
                </span>
              ))}
              {cp.members.length > BAR_AVATARES_MAX && (
                <span className="text-[10px] font-semibold ml-0.5 opacity-80">
                  +{cp.members.length - BAR_AVATARES_MAX}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Right resize handle */}
      {isEditable && (
        <div
          ref={setRightRef}
          {...rightListeners}
          {...rightAttrs}
          className="absolute right-0 top-0 bottom-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-20"
          style={{ width: HANDLE_W, cursor: "e-resize" }}
        >
          <div className="w-0.5 h-3 rounded bg-black/10" />
        </div>
      )}
    </div>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────
// ─── Faixa de grupo (roadmap segmentado por tag) ──────────────────────────────
// O mesmo desenho do cabeçalho de grupo da lista: --bg-app, nome em caixa alta
// e a contagem ao lado. O rótulo gruda à esquerda, como a coluna de nomes,
// para não sumir ao rolar a timeline na horizontal.
function GrupoFaixa({
  label, count, first, labelW, ganttWidth,
}: {
  label: string;
  count: number;
  first: boolean;
  labelW: number;
  ganttWidth: number;
}) {
  return (
    <div
      className="flex"
      style={{
        background: "var(--bg-app)",
        borderTop: first ? "none" : "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
        minWidth: labelW + ganttWidth,
      }}
    >
      <div
        className="sticky left-0 z-30 flex items-center gap-2 px-3 py-2"
        style={{ background: "var(--bg-app)" }}
      >
        <span
          className="text-xs font-semibold uppercase whitespace-nowrap"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.05em" }}
        >
          {label}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {count}
        </span>
      </div>
    </div>
  );
}

interface CheckpointGanttProps {
  checkpoints: Checkpoint[];
  members: { id: string; name: string }[];
  onUpdateDates: (id: string, startDate: string | null, dueDate: string) => Promise<void>;
  isEditable?: boolean;
  /** Data de lançamento da iniciativa/experimento — marcada como linha vertical. */
  launchDate?: Date | string | null;
  /**
   * Progresso de cada marco com necessários, calculado sobre a árvore inteira
   * (o filtro do card não muda o que falta para o marco).
   */
  progressoPorMarco?: Map<string, ProgressoDoMarco<MarcoCheckpoint>>;
  /**
   * Segmentação por tag (a mesma da lista, calculada pela seção). Com ela, as
   * linhas saem agrupadas sob uma faixa por tag; `matched` diz quem casou com
   * o grupo — o resto é ancestral de contexto, esmaecido e sempre aberto.
   */
  grupos?: { key: string; label: string; items: Checkpoint[]; matched: Set<string> }[];
  /** Pais recolhidos — o mesmo conjunto da lista. */
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  /** Check da linha. É o mesmo handler da lista (marco com pendência avisa). */
  onToggleComplete?: (id: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CheckpointGantt({
  checkpoints: checkpointsRecebidos,
  members: _members,
  onUpdateDates,
  isEditable = true,
  launchDate,
  progressoPorMarco,
  grupos,
  onToggleComplete,
  collapsedIds,
  onToggleCollapse,
}: CheckpointGanttProps) {
  const podeConcluir = isEditable && !!onToggleComplete;
  // A lista chega na ordem escolhida na lista (que pode ser por nome, manual…);
  // o roadmap reordena sempre por data.
  const checkpoints = useMemo(() => ordenarPorData(checkpointsRecebidos), [checkpointsRecebidos]);

  // Expansão dos subcheckpoints: o estado é o da lista (a seção é dona dele),
  // então o que se abre numa visão continua aberto na outra — e o "expandir
  // todos" do cabeçalho vale para as duas.

  const parentOf = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const cp of checkpoints) m.set(cp.id, cp.parentId ?? null);
    return m;
  }, [checkpoints]);

  // Ids que são pai de algum outro checkpoint (têm o affordance de expandir).
  const parentIds = useMemo(() => {
    const s = new Set<string>();
    for (const cp of checkpoints) if (cp.parentId) s.add(cp.parentId);
    return s;
  }, [checkpoints]);

  // Visível quando é raiz ou todos os ancestrais estão expandidos.
  const visibleCheckpoints = useMemo(
    () =>
      checkpoints.filter((cp) => {
        let pid = cp.parentId ?? null;
        while (pid) {
          if (collapsedIds.has(pid)) return false;
          pid = parentOf.get(pid) ?? null;
        }
        return true;
      }),
    [checkpoints, collapsedIds, parentOf]
  );

  // Agrupado: mesma regra da lista segmentada. Só quem casou com o grupo
  // recolhe; o ancestral de contexto fica aberto (recolhido, sobrava só a
  // linha esmaecida, sem o item que tem a tag).
  const gruposVisiveis = useMemo(
    () =>
      grupos?.map((g) => ({
        ...g,
        visiveis: ordenarPorData(g.items).filter((cp) => {
          let pid = cp.parentId ?? null;
          while (pid) {
            if (g.matched.has(pid) && collapsedIds.has(pid)) return false;
            pid = parentOf.get(pid) ?? null;
          }
          return true;
        }),
      })) ?? null,
    [grupos, collapsedIds, parentOf]
  );

  // ── Marcos ──
  // Passar o mouse num marco realça os necessários dele e esmaece o resto:
  // responde "o que falta para esta data" sem desenhar linhas de dependência
  // (com muitos necessários elas viravam um emaranhado).
  const [marcoEmFoco, setMarcoEmFoco] = useState<string | null>(null);
  const realcados = useMemo(() => {
    const p = marcoEmFoco ? progressoPorMarco?.get(marcoEmFoco) : undefined;
    return p && marcoEmFoco ? new Set([marcoEmFoco, ...p.requisitos.map((r) => r.id)]) : null;
  }, [marcoEmFoco, progressoPorMarco]);
  // Necessários pendentes que vencem depois do próprio marco.
  const emAlerta = useMemo(() => {
    const s = new Set<string>();
    for (const p of progressoPorMarco?.values() ?? []) {
      for (const r of p.riscos) if (r.motivo === "depois_do_marco") s.add(r.item.id);
    }
    return s;
  }, [progressoPorMarco]);

  const [livePos, setLivePos] = useState<LivePos | null>(null);
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: "move" | "left" | "right";
    initialStart: Date;
    initialEnd: Date;
    hasStartDate: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS)
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  // ── Largura da coluna do nome ─────────────────────────────────────────────
  // O componente só roda no cliente (dynamic, ssr: false), então dá para ler
  // o localStorage direto no estado inicial.
  const [labelW, setLabelW] = useState(lerLarguraSalva);
  function salvarLargura(w: number) {
    try {
      window.localStorage.setItem(LABEL_W_STORAGE_KEY, String(w));
    } catch {
      // Sem storage (aba anônima, bloqueio): a largura vale só nesta visita.
    }
  }
  function handleLabelResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = labelW;
    let atual = startW;
    const onMove = (ev: PointerEvent) => {
      atual = Math.min(LABEL_W_MAX, Math.max(LABEL_W_MIN, startW + ev.clientX - startX));
      setLabelW(atual);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      salvarLargura(atual);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function resetLabelWidth() {
    setLabelW(LABEL_W_DEFAULT);
    salvarLargura(LABEL_W_DEFAULT);
  }
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });

  // ── Today ─────────────────────────────────────────────────────────────────
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  // ── Launch ────────────────────────────────────────────────────────────────
  const launchUTC = toUTC(launchDate);


  // ── Quarters ──────────────────────────────────────────────────────────────
  // Fim de quarter vira divisória tracejada, igual ao calendário mensal. O
  // roadmap não recebe os quarters por prop (o card de checkpoints é agnóstico
  // da entidade), então busca — e segue de pé se a busca falhar.
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

  // ── Timeline geometry ─────────────────────────────────────────────────────
  const allDates = useMemo(() => {
    const dates: Date[] = [];
    for (const cp of checkpoints) {
      const s = toUTC(cp.startDate ?? cp.dueDate);
      const e = toUTC(cp.dueDate);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }
    return dates;
  }, [checkpoints]);

  const MIN_VISIBLE_DAYS = 60;

  let timelineStart: Date | null = allDates.length > 0
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : null;
  let timelineEnd: Date | null = allDates.length > 0
    ? new Date(Math.max(...allDates.map((d) => d.getTime())))
    : null;

  // Always include today in range
  if (!timelineStart || todayUTC < timelineStart) timelineStart = new Date(todayUTC);
  if (!timelineEnd || todayUTC > timelineEnd) timelineEnd = new Date(todayUTC);

  // Também garante que a data de lançamento fique visível no range
  if (launchUTC) {
    if (!timelineStart || launchUTC < timelineStart) timelineStart = new Date(launchUTC);
    if (!timelineEnd || launchUTC > timelineEnd) timelineEnd = new Date(launchUTC);
  }

  if (timelineStart) timelineStart = addDays(timelineStart, -14);
  if (timelineEnd) timelineEnd = addDays(timelineEnd, 14);

  // Enforce minimum span so the timeline fills the card
  if (timelineStart && timelineEnd && diffDays(timelineEnd, timelineStart) < MIN_VISIBLE_DAYS) {
    timelineEnd = addDays(timelineStart, MIN_VISIBLE_DAYS);
  }

  const totalDays = timelineStart && timelineEnd ? diffDays(timelineEnd, timelineStart) + 1 : 0;
  const ganttWidth = totalDays * PX_PER_DAY;

  // Divisória no fim do trimestre: a virada acontece no fim do último dia, daí
  // o +1 antes de multiplicar.
  const quarterEndLines =
    timelineStart && timelineEnd
      ? quarters
          .filter((q) => q.end >= timelineStart! && q.end <= timelineEnd!)
          .map((q) => ({
            id: q.id,
            label: q.label,
            leftPx: (diffDays(q.end, timelineStart!) + 1) * PX_PER_DAY,
          }))
      : [];

  const todayX =
    timelineStart && timelineEnd && todayUTC >= timelineStart && todayUTC <= timelineEnd
      ? diffDays(todayUTC, timelineStart) * PX_PER_DAY
      : null;

  const launchX =
    launchUTC && timelineStart && timelineEnd && launchUTC >= timelineStart && launchUTC <= timelineEnd
      ? diffDays(launchUTC, timelineStart) * PX_PER_DAY
      : null;

  // ── Scroll to today on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current && todayX !== null) {
      const viewportWidth = scrollRef.current.clientWidth;
      const scrollPx = Math.max(0, todayX - (viewportWidth - labelW) / 2);
      scrollRef.current.scrollTo({ left: scrollPx, behavior: "smooth" });
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollPx;
    }
    // Só na montagem / troca de "hoje": rearrastar a coluna não deve rolar a
    // timeline de volta para hoje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayX]);

  // ── Sync header scroll ────────────────────────────────────────────────────
  function handleScroll() {
    if (headerScrollRef.current && scrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }

  // ── Pan gesture ───────────────────────────────────────────────────────────
  function handlePanDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-checkpoint-bar]")) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = "grabbing";
  }
  function handlePanMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }
  function handlePanUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    e.currentTarget.style.cursor = "";
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const fullId = event.active.id as string;
    let type: "move" | "left" | "right" = "move";
    let cpId = "";

    if (fullId.startsWith("resize-left-")) {
      type = "left";
      cpId = fullId.replace("resize-left-", "");
    } else if (fullId.startsWith("resize-right-")) {
      type = "right";
      cpId = fullId.replace("resize-right-", "");
    } else {
      type = "move";
      cpId = fullId.replace("move-", "");
    }

    const cp = checkpoints.find((c) => c.id === cpId);
    if (!cp) return;

    const hasStartDate = cp.startDate !== null && cp.startDate !== undefined;
    const effectiveStart = toUTC(cp.startDate ?? cp.dueDate)!;
    const effectiveEnd = toUTC(cp.dueDate)!;

    setActiveDrag({ id: cpId, type, initialStart: effectiveStart, initialEnd: effectiveEnd, hasStartDate });
  }

  function handleDragMove(event: { delta: { x: number } }) {
    if (!activeDrag) return;
    const deltaDays = Math.round(event.delta.x / PX_PER_DAY);

    let newStart = new Date(activeDrag.initialStart);
    let newEnd = new Date(activeDrag.initialEnd);

    if (activeDrag.type === "move") {
      newStart = addDays(activeDrag.initialStart, deltaDays);
      newEnd = addDays(activeDrag.initialEnd, deltaDays);
    } else if (activeDrag.type === "left") {
      // Início e fim no mesmo dia é um checkpoint de 1 dia — o menor que a
      // barra desenha. Travar um dia antes do fim deixava o mínimo em 2.
      newStart = addDays(activeDrag.initialStart, deltaDays);
      if (newStart > activeDrag.initialEnd) newStart = activeDrag.initialEnd;
    } else {
      newEnd = addDays(activeDrag.initialEnd, deltaDays);
      if (newEnd < activeDrag.initialStart) newEnd = activeDrag.initialStart;
    }

    // O dnd-kit chama isto a cada pixel; a prévia só muda quando o arraste
    // cruza um dia. Devolver o mesmo objeto faz o React pular o render — antes
    // a aba inteira re-renderizava a cada movimento do mouse.
    setLivePos((prev) =>
      prev &&
      prev.id === activeDrag.id &&
      prev.startDate.getTime() === newStart.getTime() &&
      prev.dueDate.getTime() === newEnd.getTime()
        ? prev
        : { id: activeDrag.id, startDate: newStart, dueDate: newEnd }
    );
  }

  // Arraste cancelado (Esc, pointercancel, ponteiro capturado por outro
  // elemento): sem isto activeDrag/livePos ficavam presos e a barra seguia
  // desenhada na posição da prévia, com o balão de datas, sem ninguém
  // arrastando nada. Mesma correção que o Roadmap já tinha.
  function handleDragCancel() {
    setActiveDrag(null);
    setLivePos(null);
  }

  async function handleDragEnd() {
    if (!activeDrag || !livePos) {
      setActiveDrag(null);
      setLivePos(null);
      return;
    }

    const startStr = activeDrag.hasStartDate || activeDrag.type !== "move"
      ? toDateStr(livePos.startDate)
      : null;
    const dueStr = toDateStr(livePos.dueDate);

    setActiveDrag(null);
    setLivePos(null);

    await onUpdateDates(activeDrag.id, startStr, dueStr);
  }

  // Uma linha do roadmap. Agrupado, o mesmo checkpoint pode aparecer em mais
  // de um grupo (tag é N:N): a `key` leva o grupo junto.
  function linha(
    cp: Checkpoint,
    { key, isLast, isParent, contexto = false }:
      { key: string; isLast: boolean; isParent: boolean; contexto?: boolean }
  ) {
    const rowH = ROW_PAD * 2 + ITEM_H;
    const isExpanded = !collapsedIds.has(cp.id);
    const depth = cp.depth ?? 0;
    const progresso = progressoPorMarco?.get(cp.id);
    const esmaecida = realcados !== null && !realcados.has(cp.id);

    return (
      <div
        key={key}
        className="flex"
        style={{
          height: rowH,
          borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
          // Contexto da segmentação: lê como pano de fundo, igual à lista.
          opacity: esmaecida ? 0.35 : contexto ? 0.5 : 1,
          transition: "opacity var(--duration-fast) var(--ease-standard)",
        }}
        // Só marco com necessários acende o realce.
        onMouseEnter={progresso ? () => setMarcoEmFoco(cp.id) : undefined}
        onMouseLeave={progresso ? () => setMarcoEmFoco(null) : undefined}
      >
        {/* Label */}
        <div
          className={`sticky left-0 z-30 shrink-0 flex items-center gap-2 px-3 ${isParent ? "cursor-pointer" : ""}`}
          style={{
            width: labelW,
            minWidth: labelW,
            background: "var(--bg-surface)",
            borderRight: "1px solid var(--border-subtle)",
            boxShadow: "2px 0 6px rgba(0,0,0,0.04)",
          }}
          onPointerDown={isParent ? (e) => e.stopPropagation() : undefined}
          onClick={isParent ? () => onToggleCollapse(cp.id) : undefined}
          role={isParent ? "button" : undefined}
          aria-expanded={isParent ? isExpanded : undefined}
          data-tooltip={isParent ? (isExpanded ? "Ocultar subcheckpoints" : "Mostrar subcheckpoints") : undefined}
        >
          {/* Indentação por nível */}
          {depth > 0 && <span className="shrink-0" style={{ width: depth * 14 }} />}

          {/* Chevron (só para quem tem filhos) — mantém alinhamento com spacer */}
          {isParent ? (
            isExpanded ? (
              <ChevronDown size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
            ) : (
              <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
            )
          ) : (
            <span className="shrink-0" style={{ width: 14 }} />
          )}

          {/* Mesmo check da lista: conclui sem sair do roadmap. Os stops
              impedem que o clique expanda a linha (pai) ou comece um pan. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={cp.isCompleted}
            aria-label={cp.isCompleted ? `Reabrir "${cp.name}"` : `Concluir "${cp.name}"`}
            disabled={!podeConcluir}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete?.(cp.id);
            }}
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
              cp.isCompleted ? "bg-forest border-forest text-cream" : "bg-paper border-line"
            } ${podeConcluir ? "cursor-pointer hover:border-forest" : "cursor-default"}`}
          >
            {cp.isCompleted && <ListChecks size={10} strokeWidth={3} />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p
                className={`text-xs font-semibold truncate ${cp.isCompleted ? "line-through opacity-60" : ""}`}
                style={{ color: "var(--text-primary)" }}
                data-tooltip={cp.name}
              >
                {cp.name}
              </p>
              {progresso && <MarcoProgressoSelo progresso={progresso} />}
            </div>
            {cp.members.length > 0 && (
              /* Coluna estreita do gantt: avatar do primeiro
                 responsável e a lista completa em texto (com
                 truncamento), em vez de N avatares empilhados. */
              <div
                className="flex items-center gap-1 mt-0.5"
                data-tooltip={formatMemberNames(cp.members)}
              >
                <Avatar name={cp.members[0].name} size={12} />
                <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                  {formatMemberNames(cp.members)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bar area */}
        <div className="relative" style={{ width: ganttWidth, overflow: "hidden" }}>
          {/* Fim de quarter */}
          {quarterEndLines.map((q) => (
            <div
              key={q.id}
              className="absolute inset-y-0 pointer-events-none"
              style={{ left: q.leftPx, borderLeft: "2px dashed var(--peach)", zIndex: 4 }}
            />
          ))}

          {/* Today line */}
          {todayX !== null && (
            <div
              className="absolute inset-y-0 w-0.5 pointer-events-none"
              style={{ left: todayX, background: "var(--brand-primary)", opacity: 0.7, zIndex: 5 }}
            />
          )}

          {/* Launch line */}
          {launchX !== null && (
            <div
              className="absolute inset-y-0 w-0.5 pointer-events-none"
              style={{ left: launchX, background: "var(--peach)", opacity: 0.85, zIndex: 5 }}
            />
          )}

          {/* Checkpoint bar */}
          <div
            className="absolute inset-0"
            style={{ paddingTop: ROW_PAD, paddingBottom: ROW_PAD }}
          >
            <div className="relative" style={{ height: ITEM_H }}>
              <DraggableBar
                cp={cp}
                timelineStart={timelineStart!}
                livePos={livePos?.id === cp.id ? livePos : null}
                todayUTC={todayUTC}
                isEditable={isEditable}
                alerta={emAlerta.has(cp.id)}
              />
            </div>
          </div>

          {/* Drag tooltip */}
          {livePos?.id === cp.id && (() => {
            const s = toUTC(livePos.startDate);
            if (!s) return null;
            const leftPx = diffDays(s, timelineStart!) * PX_PER_DAY;
            return (
              <div
                className="absolute z-30 text-xs px-2 py-0.5 pointer-events-none whitespace-nowrap"
                style={{
                  top: 2,
                  left: leftPx,
                  background: "var(--bg-tooltip)",
                  border: "1px solid var(--border-tooltip)",
                  color: "white",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {fmtShort(livePos.startDate)} → {fmtShort(livePos.dueDate)}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ── Sem nada para desenhar ────────────────────────────────────────────────
  // Devolve nada, em vez de um vazio próprio: quem mostra "Nenhum checkpoint
  // definido" é a seção, DEPOIS do campo de adicionar. Desenhando aqui, o
  // aviso saía na frente do campo — e com tipografia própria.
  if (checkpoints.length === 0 || !timelineStart || !timelineEnd) return null;

  return (
    <DndContext
      id="checkpoint-gantt-dnd"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove as (e: DragMoveEvent) => void}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div>
        {/* ── Legend ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 flex-wrap text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-soft border border-sky" /> Planejado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-peach-soft border border-peach" /> Atrasado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sage-soft border border-sage" /> Concluído
          </span>
          {CHECKPOINT_CATEGORIAS.filter((cat) =>
            checkpoints.some((cp) => cp.categoria === cat)
          ).map((cat) => (
            <span key={cat} className="flex items-center gap-1">
              <span
                className={`w-2.5 h-2.5 rounded-sm ${CATEGORIA_CONFIG[cat].bar}`}
                style={{ border: `1px solid ${CATEGORIA_CONFIG[cat].accent}` }}
              />{" "}
              {CATEGORIA_CONFIG[cat].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-0.5 h-2.5 bg-forest opacity-70" /> Hoje
          </span>
          {launchUTC && (
            <span className="flex items-center gap-1">
              <span className="w-0.5 h-2.5" style={{ background: "var(--peach)", opacity: 0.85 }} /> Lançamento
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="h-2.5" style={{ borderRight: "2px dashed var(--peach)", width: 2 }} /> Fim de quarter
          </span>
          {emAlerta.size > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ outline: "2px solid var(--peach)", outlineOffset: -1 }} /> Vence depois do marco
            </span>
          )}
          {isEditable && (
            <span className="ml-auto text-[10px] flex items-center gap-1 normal-case" style={{ color: "var(--text-muted)" }}>
              <Info size={10} /> Arraste para mover ou redimensionar
            </span>
          )}
        </div>

        {/* ── Timeline header (sticky) ────────────────────────────────── */}
        <div
          ref={headerScrollRef}
          style={{
            // Fixo no topo ao rolar a página: meses e dias seguem à vista em
            // roadmap comprido. Acima da coluna de nomes das linhas (z-30).
            position: "sticky",
            top: 0,
            zIndex: 40,
            overflow: "hidden",
            background: "var(--bg-app)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
            marginBottom: -1,
          }}
        >
          <div style={{ minWidth: labelW + ganttWidth }}>
            <div className="flex">
              <div
                // Sticky como a célula de nome das linhas: sem isso, ao rolar
                // na horizontal, as datas do cabeçalho passavam por cima da
                // coluna de nomes.
                className="shrink-0 sticky left-0 z-30"
                style={{
                  width: labelW,
                  minWidth: labelW,
                  borderRight: "1px solid var(--border-subtle)",
                  background: "var(--bg-app)",
                }}
              >
                {/* Alça de largura: arrastar a borda aumenta ou diminui a
                    coluna dos nomes; duplo clique volta ao padrão. */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Ajustar largura da coluna de nomes"
                  aria-valuenow={labelW}
                  aria-valuemin={LABEL_W_MIN}
                  aria-valuemax={LABEL_W_MAX}
                  onPointerDown={handleLabelResizeDown}
                  onDoubleClick={resetLabelWidth}
                  className="absolute top-0 bottom-0 z-40 group"
                  style={{ right: -4, width: 8, cursor: "col-resize" }}
                >
                  <span
                    className="absolute top-1 bottom-1 opacity-0 group-hover:opacity-100 u-transition"
                    style={{ left: 3, width: 2, borderRadius: 1, background: "var(--border-strong, var(--text-muted))" }}
                  />
                </div>
              </div>
              <GanttTimeline
                rangeStart={timelineStart}
                rangeEnd={timelineEnd}
                pixelsPerDay={PX_PER_DAY}
                totalDays={totalDays}
                quarterEnds={quarterEndLines}
              />
            </div>
          </div>
        </div>

        {/* ── Rows ────────────────────────────────────────────────────── */}
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
            background: "var(--bg-surface)",
            overflow: "clip",
          }}
        >
          <div
            ref={scrollRef}
            className="overflow-x-auto"
            onPointerDown={handlePanDown}
            onPointerMove={handlePanMove}
            onPointerUp={handlePanUp}
            onPointerCancel={handlePanUp}
            onScroll={handleScroll}
            style={{ cursor: "grab" }}
          >
            <div style={{ minWidth: labelW + ganttWidth }}>
              {gruposVisiveis
                ? gruposVisiveis.map((g, gi) => (
                    <div key={g.key}>
                      <GrupoFaixa label={g.label} count={g.matched.size} first={gi === 0} labelW={labelW} ganttWidth={ganttWidth} />
                      {g.visiveis.map((cp, idx) =>
                        linha(cp, {
                          key: `${g.key}::${cp.id}`,
                          isLast: gi === gruposVisiveis.length - 1 && idx === g.visiveis.length - 1,
                          // Contexto não recolhe: sem chevron.
                          isParent: g.matched.has(cp.id) && g.items.some((i) => i.parentId === cp.id),
                          contexto: !g.matched.has(cp.id),
                        })
                      )}
                    </div>
                  ))
                : visibleCheckpoints.map((cp, idx) =>
                    linha(cp, {
                      key: cp.id,
                      isLast: idx === visibleCheckpoints.length - 1,
                      isParent: parentIds.has(cp.id),
                    })
                  )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
