"use client";

import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { DetailModal } from "@/components/shared/DetailModal";
import { CalendarRange, ClipboardList, FlaskConical, X, ExternalLink, Info, AlertTriangle, ArrowUp, Minus, ArrowDown, EyeOff, Eye } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  useDraggable,
} from "@dnd-kit/core";
import { updateIniciativaDates } from "@/actions/iniciativas";
import { updateExperimentoDates } from "@/actions/experimentos";
import { GanttTimeline } from "@/components/iniciativas/GanttTimeline";
import { Avatar } from "@/components/shared/Avatar";
import { formatMemberNames } from "@/components/shared/MemberChips";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ICEBadge } from "@/components/shared/ICEBadge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { IconButton } from "@/components/shared/IconButton";
import { PriorityType } from "@/components/shared/PriorityBadge";
import {
  CursorTooltip,
  TooltipTitle,
  TooltipLine,
  TooltipHint,
  useCursorTooltip,
} from "@/components/shared/CursorTooltip";
import { getAusenciaBarStyle, getAusenciaLabel } from "@/components/shared/AusenciaTypeBadge";
import { getStatusMeta, familyStrong, familyBarClasses } from "@/lib/statusConfig";
import { QuarterDropdown } from "@/components/shared/QuarterSelector";
import { MultiSelect } from "@/components/shared/MultiSelect";
import dynamic from "next/dynamic";
import { useEstadoDaProp } from "@/hooks/useEstadoDaProp";

// Formulário só abre sob demanda (modal): fica fora do bundle inicial da tela.
const IniciativaForm = dynamic(
  () => import("@/components/iniciativas/IniciativaForm").then((m) => ({ default: m.IniciativaForm })),
  { ssr: false }
);
const ExperimentoForm = dynamic(
  () => import("@/components/experimentos/ExperimentoForm").then((m) => ({ default: m.ExperimentoForm })),
  { ssr: false }
);

// ─── Constants ────────────────────────────────────────────────────────────────
// Quanto a timeline pode se estender além do quarter selecionado (ver allDates).
const JANELA_MAX_DIAS = 365;
const DIA_MS = 24 * 60 * 60 * 1000;
// Fora do componente de propósito: se este objeto nascesse a cada render, o
// useSensor recriaria os sensores, o dnd-kit recriaria os listeners de todas as
// barras e o memo do corpo de cada uma (BarBody) cairia a cada render da página.
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 6 } };
const PX_PER_DAY = 14;
const LABEL_W = 224;
const ITEM_H = 38;     // height per lane slot
const BAR_H = 28;      // actual bar height within a lane slot
const SECTION_PAD = 6; // vertical padding top/bottom within each member section
const HANDLE_W = 8;    // Increased for better hit area

// ─── Date helpers (UTC-safe) ──────────────────────────────────────────────────
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
function fmtLong(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

// ─── Color Helpers ────────────────────────────────────────────────────────────
// Aparência (cor/fita/texto) derivada da fonte única statusConfig.
function getIniciativaStyles(status: string) {
  const m = getStatusMeta("iniciativa", status);
  return familyBarClasses(m.family) + (m.faded ? " opacity-70" : "");
}

function getExperimentoStyles(status: string) {
  const m = getStatusMeta("experimento", status);
  return familyBarClasses(m.family) + (m.faded ? " opacity-70" : "");
}

function getStatusTextColor(kind: "iniciativa" | "experimento", status: string) {
  return familyStrong(getStatusMeta(kind, status).family);
}

/**
 * Estilo da faixa de ausência, na paleta canônica do tipo.
 *
 * Antes esta tela tinha a própria tabela de cores, e ela divergia num tipo:
 * férias era butter aqui e sky no resto do produto (badge, tabela de
 * /ausencias, roadmap de /ausencias e calendário de checkpoints, que todos
 * leem `getAusenciaBarStyle`). Uma ausência trocava de cor conforme a tela.
 *
 * `opacity: 0.5` fica: a faixa passa ATRÁS das barras do roadmap e precisa
 * ceder contraste para elas.
 */
function ausenciaBandStyle(type: string): React.CSSProperties {
  const { bg, color } = getAusenciaBarStyle(type);
  return { background: bg, borderLeft: `4px solid ${color}`, opacity: 0.5 };
}

// Filtro de tipo (pills no card de filtros) — casa com o SegmentedToggle antigo.
const TYPE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "iniciativas", label: "Iniciativas" },
  { value: "experimentos", label: "Experimentos" },
] as const;

const PRIORITY_ICONS = {
  URGENTE: { icon: AlertTriangle, color: "var(--peach)" },
  ALTA: { icon: ArrowUp, color: "var(--status-progress-text)" },
  MEDIA: { icon: Minus, color: "var(--status-review-text)" },
  BAIXA: { icon: ArrowDown, color: "var(--text-muted)" },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type QuarterItem = { id: string; year: number; quarter: number; startDate: Date | string; endDate: Date | string; isActive: boolean };
type FrenteItem  = { id: string; name: string; isActive: boolean };
type MemberItem  = { id: string; name: string; isActive: boolean };
type OKRItem     = { id: string; objective: string };

type RoadmapIniciativa = {
  kind: "iniciativa";
  id: string; name: string; status: string;
  frenteId: string; quarterId: string;
  startDate: Date | string | null; endDate: Date | string | null;
  launchDate: Date | string | null; analysisDate: Date | string | null; resultado: string | null;
  okrId: string | null; docLink: string | null;
  frente: { id: string; name: string };
  members: { id: string; name: string }[];
  okr: { id: string; objective: string } | null;
  quarter: { id: string; year: number; quarter: number };
  priority: string;
};

type RoadmapExperimento = {
  kind: "experimento";
  id: string; name: string; description: string; objective: string; status: string;
  frenteId: string; okrId: string | null; quarterId: string;
  impactScore: number; confidenceScore: number; effortScore: number;
  iceScore: number; iceAction: string;
  docLink: string | null;
  startDate: Date | string | null; endDate: Date | string | null;
  launchDate: Date | string | null; analysisDate: Date | string | null; resultado: string | null;
  frente: { id: string; name: string };
  members: { id: string; name: string }[];
  okr: { id: string; objective: string } | null;
  quarter: { id: string; year: number; quarter: number };
};

type RoadmapItem = RoadmapIniciativa | RoadmapExperimento;

type AusenciaItem = {
  id: string; type: string;
  startDate: Date | string; endDate: Date | string;
  notes: string | null;
  member: { id: string; name: string };
};

interface LivePos {
  id: string;
  kind: "iniciativa" | "experimento";
  startDate: Date;
  endDate: Date;
}

// ─── Lane assignment ──────────────────────────────────────────────────────────
function assignLanes(
  items: Array<{ id: string; start: Date; end: Date }>
): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const lanes = new Map<string, number>();

  sorted.forEach((item, index) => {
    lanes.set(item.id, index);
  });
  
  return { lanes, count: Math.max(1, sorted.length) };
}

// ─── Draggable Components ───────────────────────────────────────────────────

interface DraggableBarProps {
  item: RoadmapItem;
  top: number;
  localQuarterId: string;
  timelineStart: Date;
  /** Identifica a linha (responsável) — entra no id de arraste. */
  rowKey: string;
  livePos: LivePos | null;
  onItemClick: (item: RoadmapItem) => void;
  /** `bind` do useCursorTooltip (estável) — substitui o title nativo. */
  bindTip: (item: RoadmapItem) => React.HTMLAttributes<HTMLDivElement>;
}

function DraggableBar({ item, top, rowKey, localQuarterId, timelineStart, livePos, onItemClick, bindTip }: DraggableBarProps) {
  // O id de arraste precisa da LINHA, não só do item: quem tem dois
  // responsáveis aparece numa barra por pessoa, e com o id só do item o
  // dnd-kit registrava vários nós sob a mesma chave. Ele então arrastava o nó
  // registrado por último — a barra que se movia era a de outra linha, não a
  // que foi clicada.
  //
  // O que o handler precisa saber (item e tipo do gesto) vai em `data`, em vez
  // de ser extraído do id com replace de prefixo.
  const idBase = `${rowKey}:${item.id}`;
  const {
    attributes: moveAttrs,
    listeners: moveListeners,
    setNodeRef: setMoveRef,
    isDragging: isMoving,
  } = useDraggable({
    id: `move-${idBase}`,
    data: { itemId: item.id, gesto: "move" },
  });

  const {
    attributes: leftAttrs,
    listeners: leftListeners,
    setNodeRef: setLeftRef,
  } = useDraggable({
    id: `resize-left-${idBase}`,
    data: { itemId: item.id, gesto: "left" },
  });

  const {
    attributes: rightAttrs,
    listeners: rightListeners,
    setNodeRef: setRightRef,
  } = useDraggable({
    id: `resize-right-${idBase}`,
    data: { itemId: item.id, gesto: "right" },
  });

  const isLive = livePos?.id === item.id;
  const s = toUTC(isLive ? livePos.startDate : item.startDate);
  const e = toUTC(isLive ? livePos.endDate : item.endDate);

  if (!s || !e || !timelineStart) return null;

  const leftPx = diffDays(s, timelineStart) * PX_PER_DAY;
  const widthPx = Math.max((diffDays(e, s) + 1) * PX_PER_DAY, PX_PER_DAY);
  const minWidth = Math.max(widthPx, HANDLE_W * 2 + 4);

  // Esta camada re-renderiza a cada movimento do mouse durante QUALQUER arraste:
  // o useDraggable assina o contexto do dnd-kit, que muda a cada pixel — e isso
  // vale para todas as barras (3 hooks por barra, uma barra por responsável).
  // Por isso aqui fica só o barato (hooks + posição); o corpo, memoizado, só
  // re-renderiza quando ESTA barra muda de dia ou de estado.
  return (
    <BarBody
      item={item}
      top={top}
      leftPx={leftPx}
      width={minWidth}
      isLive={isLive}
      isMoving={isMoving}
      localQuarterId={localQuarterId}
      onItemClick={onItemClick}
      bindTip={bindTip}
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
  item: RoadmapItem;
  top: number;
  leftPx: number;
  width: number;
  isLive: boolean;
  isMoving: boolean;
  localQuarterId: string;
  onItemClick: (item: RoadmapItem) => void;
  bindTip: (item: RoadmapItem) => React.HTMLAttributes<HTMLDivElement>;
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
  item,
  top,
  leftPx,
  width: minWidth,
  isLive,
  isMoving,
  localQuarterId,
  onItemClick,
  bindTip,
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

  const statusClasses = item.kind === "iniciativa" ? getIniciativaStyles(item.status) : getExperimentoStyles(item.status);
  const textColor = getStatusTextColor(item.kind, item.status);
  
  const isIni = item.kind === "iniciativa";
  const priority = isIni ? (item as RoadmapIniciativa).priority?.toUpperCase() as PriorityType : null;
  const PriorityIcon = priority ? PRIORITY_ICONS[priority]?.icon : null;
  const priorityColor = priority ? PRIORITY_ICONS[priority]?.color : null;
  const showPriority = minWidth > 100 && PriorityIcon;

  return (
    <div
      data-roadmap-bar
      {...bindTip(item)}
      className={`absolute flex items-center rounded select-none ${statusClasses} transition-colors border-l-4`}
      style={{
        left: leftPx,
        top: top,
        width: minWidth,
        height: BAR_H,
        opacity: isMoving ? 0.6 : 1,
        zIndex: isLive ? 20 : 10,
        border: item.quarterId !== localQuarterId ? "1px dashed rgba(0,0,0,0.2)" : undefined,
        color: textColor,
      }}
    >
      {/* Left resize handle */}
      <div
        ref={setLeftRef}
        {...leftListeners}
        {...leftAttrs}
        className="absolute left-0 top-0 bottom-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-20"
        style={{ width: HANDLE_W, cursor: "w-resize" }}
      >
        <div className="w-0.5 h-3 rounded bg-black/10" />
      </div>

      {/* Main move area */}
      <div
        ref={setMoveRef}
        {...moveListeners}
        {...moveAttrs}
        className="flex-1 min-w-0 h-full flex items-center px-2 cursor-grab active:cursor-grabbing hover:brightness-95 transition-[filter]"
        onClick={(e) => {
          e.stopPropagation();
          onItemClick(item);
        }}
      >
        {/* overflow-hidden + truncate: o rótulo é recortado na largura da barra (mesmo
            padrão do GanttBar de iniciativas). Sem isso o texto vazava pra fora da barra,
            sobre o fundo escuro da página no dark mode, ficando ilegível. Nome completo
            fica acessível ao clicar/abrir o detalhe. */}
        <div className="flex items-center gap-1.5 pointer-events-none min-w-0 overflow-hidden">
          {item.quarterId !== localQuarterId && (
            <span className="text-[10px] shrink-0 opacity-70">↻</span>
          )}
          {showPriority && PriorityIcon && (
            <PriorityIcon size={12} strokeWidth={2} style={{ color: priorityColor ?? undefined, flexShrink: 0 }} />
          )}
          {isIni ? <ClipboardList size={14} strokeWidth={2} className="shrink-0" /> : <FlaskConical size={14} strokeWidth={2} className="shrink-0" />}
          <span className="text-xs font-medium truncate">{item.name}</span>
        </div>
      </div>

      {/* Right resize handle */}
      <div
        ref={setRightRef}
        {...rightListeners}
        {...rightAttrs}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-20"
        style={{ width: HANDLE_W, cursor: "e-resize" }}
      >
        <div className="w-0.5 h-3 rounded bg-black/10" />
      </div>
    </div>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface RoadmapViewProps {
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  iniciativas: Omit<RoadmapIniciativa, "kind">[];
  experimentos: Omit<RoadmapExperimento, "kind">[];
  ausencias: AusenciaItem[];
  okrs: OKRItem[];
  selectedQuarterId: string | null;
  currentFrenteId: string;
  currentType: "all" | "iniciativas" | "experimentos";
  hideOtherQuarters: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function RoadmapView({
  quarters,
  frentes,
  members,
  iniciativas,
  experimentos,
  ausencias,
  okrs,
  selectedQuarterId,
  currentFrenteId,
  currentType,
  hideOtherQuarters,
}: RoadmapViewProps) {
  const router = useRouter();

  // ── Local state ────────────────────────────────────────────────────────────
  const [localIniciativas, setLocalIniciativas] = useEstadoDaProp(
    iniciativas,
    (lista): RoadmapIniciativa[] => lista.map((i) => ({ ...i, kind: "iniciativa" as const }))
  );
  const [localExperimentos, setLocalExperimentos] = useEstadoDaProp(
    experimentos,
    (lista): RoadmapExperimento[] => lista.map((e) => ({ ...e, kind: "experimento" as const }))
  );

  const activeQ = quarters.find((q) => q.isActive);
  const [localQuarterId, setLocalQuarterId] = useState(selectedQuarterId ?? activeQ?.id ?? "");
  const [localFrenteId, setLocalFrenteId] = useState(currentFrenteId);
  const [localType, setLocalType] = useState<"all" | "iniciativas" | "experimentos">(currentType);
  const [localHideOthers, setLocalHideOthers] = useState(hideOtherQuarters);

  const [livePos, setLivePos] = useState<LivePos | null>(null);
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    kind: "iniciativa" | "experimento";
    type: "move" | "left" | "right";
    initialStart: Date;
    initialEnd: Date;
  } | null>(null);

  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  // Criação a partir do roadmap: abre o form de iniciativa/experimento (mode create).
  const [createKind, setCreateKind] = useState<"iniciativa" | "experimento" | null>(null);

  // Tooltips de cursor (padrão do design system) — um para barras, outro
  // para as faixas de ausência ao fundo.
  const { tip: barTip, bind: bindBarTip, clear: clearBarTip } = useCursorTooltip<RoadmapItem>();
  const { tip: bandTip, bind: bindBandTip } = useCursorTooltip<{ type: string; label: string; memberName: string }>();

  // ── Drag & Drop setup ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS)
  );

  const allItems: RoadmapItem[] = useMemo(() => [
    ...localIniciativas.filter((i) => i.startDate && i.endDate),
    ...localExperimentos.filter((e) => e.startDate && e.endDate),
  ], [localIniciativas, localExperimentos]);

  const filteredItems = useMemo(() => {
    const byType =
      localType === "iniciativas" ? allItems.filter((i) => i.kind === "iniciativa") :
      localType === "experimentos" ? allItems.filter((i) => i.kind === "experimento") :
      allItems;
    // O servidor inclui itens em aberto de outros quarters; este toggle
    // restringe a visão ao quarter selecionado.
    return localHideOthers ? byType.filter((i) => i.quarterId === localQuarterId) : byType;
  }, [allItems, localType, localHideOthers, localQuarterId]);

  const handleDragStart = (event: DragStartEvent) => {
    const dados = event.active.data.current as
      | { itemId: string; gesto: "move" | "left" | "right" }
      | undefined;
    if (!dados) return;
    const type = dados.gesto;
    const itemId = dados.itemId;

    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;

    const s = toUTC(item.startDate);
    const e = toUTC(item.endDate);
    if (!s || !e) return;

    // Durante o arraste o tooltip de hover atrapalha — o de datas assume.
    clearBarTip();

    setActiveDrag({
      id: itemId,
      kind: item.kind,
      type,
      initialStart: s,
      initialEnd: e,
    });
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (!activeDrag) return;
    const { delta } = event;
    const deltaDays = Math.round(delta.x / PX_PER_DAY);

    let newStart = new Date(activeDrag.initialStart);
    let newEnd = new Date(activeDrag.initialEnd);

    if (activeDrag.type === "move") {
      newStart = addDays(activeDrag.initialStart, deltaDays);
      newEnd = addDays(activeDrag.initialEnd, deltaDays);
    } else if (activeDrag.type === "left") {
      // Início e fim no mesmo dia é um item de 1 dia — o menor que a barra
      // desenha. Travar um dia antes do fim deixava o mínimo em 2.
      newStart = addDays(activeDrag.initialStart, deltaDays);
      if (newStart > activeDrag.initialEnd) newStart = activeDrag.initialEnd;
    } else if (activeDrag.type === "right") {
      newEnd = addDays(activeDrag.initialEnd, deltaDays);
      if (newEnd < activeDrag.initialStart) newEnd = activeDrag.initialStart;
    }

    // O dnd-kit chama isto a cada pixel; a prévia só muda quando o arraste
    // cruza um dia (PX_PER_DAY). Devolver o mesmo objeto faz o React pular o
    // render — antes a tela inteira re-renderizava a cada movimento do mouse.
    setLivePos((prev) =>
      prev &&
      prev.id === activeDrag.id &&
      prev.startDate.getTime() === newStart.getTime() &&
      prev.endDate.getTime() === newEnd.getTime()
        ? prev
        : { id: activeDrag.id, kind: activeDrag.kind, startDate: newStart, endDate: newEnd }
    );
  };

  // Sem isto, um arraste cancelado (Esc, pointercancel, ponteiro capturado por
  // outro elemento) deixava activeDrag/livePos presos: a barra continuava
  // desenhada na posição da prévia, com o balão de datas, sem ninguém
  // arrastando nada.
  const handleDragCancel = () => {
    setActiveDrag(null);
    setLivePos(null);
  };

  const handleDragEnd = async () => {
    if (!activeDrag || !livePos) {
      setActiveDrag(null);
      setLivePos(null);
      return;
    }

    const itemId = activeDrag.id;
    const startDate = toDateStr(livePos.startDate);
    const endDate = toDateStr(livePos.endDate);

    // Final Optimistic update
    if (activeDrag.kind === "iniciativa") {
      setLocalIniciativas(prev => prev.map(i => i.id === itemId ? { ...i, startDate, endDate } : i));
      const res = await updateIniciativaDates(itemId, startDate, endDate);
      if (!res.success) {
        console.error(res.error);
        router.refresh(); // Revert state from server
      }
    } else {
      setLocalExperimentos(prev => prev.map(e => e.id === itemId ? { ...e, startDate, endDate } : e));
      const res = await updateExperimentoDates(itemId, startDate, endDate);
      if (!res.success) {
        console.error(res.error);
        router.refresh();
      }
    }

    setActiveDrag(null);
    setLivePos(null);
  };

  // ── Timeline geometry ───────────────────────────────────────────────────────
  const selectedQuarter = quarters.find((q) => q.id === localQuarterId);
  const quarterStart = selectedQuarter ? toUTC(selectedQuarter.startDate) : null;
  const quarterEnd   = selectedQuarter ? toUTC(selectedQuarter.endDate)   : null;

  const allDates = [
    ...(quarterStart ? [quarterStart] : []),
    ...(quarterEnd ? [quarterEnd] : []),
    ...filteredItems.map(i => toUTC(i.startDate)!),
    ...filteredItems.map(i => toUTC(i.endDate)!),
    ...ausencias.map(a => toUTC(a.startDate)!),
    ...ausencias.map(a => toUTC(a.endDate)!),
  ].filter(Boolean)
    // Datas a mais de um ano do quarter não esticam a timeline. Uma única data
    // digitada errado (ex.: 2926 em vez de 2026, numa ausência ou num item sem
    // responsável ativo — que nem vira barra) fazia a timeline cobrir ~900 anos:
    // o cabeçalho gerava ~58 mil elementos de semana/mês e a página inteira
    // (arraste, menu lateral) ficava em câmera lenta. Barras fora da janela
    // continuam desenhadas, só recortadas na borda.
    .filter((d) => !quarterStart || !quarterEnd || (d >= addDays(quarterStart, -JANELA_MAX_DIAS) && d <= addDays(quarterEnd, JANELA_MAX_DIAS)));

  // Os limites saem primeiro como timestamp e só então viram Date. São esses
  // números que os useMemo/useEffect abaixo usam como dependência: o Date é um
  // objeto novo a cada render e, depois de passado para funções e props, o
  // React Compiler não tem como provar que ele não foi alterado — e desiste de
  // preservar a memoização (react-hooks/preserve-manual-memoization). A folga de
  // 7 dias é somada em ms (UTC não tem horário de verão): a conta aritmética é
  // o que deixa claro para o compilador que o resultado é um número, não algo
  // ligado ao Date.
  const allTimes = allDates.map((d) => d.getTime());
  const limiteInicio = allTimes.length > 0 ? Math.min(...allTimes) : quarterStart?.getTime();
  const limiteFim    = allTimes.length > 0 ? Math.max(...allTimes) : quarterEnd?.getTime();
  const timelineStartTime = limiteInicio === undefined ? undefined : limiteInicio - 7 * DIA_MS;
  const timelineEndTime   = limiteFim === undefined ? undefined : limiteFim + 7 * DIA_MS;

  const timelineStart = timelineStartTime === undefined ? null : new Date(timelineStartTime);
  const timelineEnd   = timelineEndTime === undefined ? null : new Date(timelineEndTime);

  const totalDays    = timelineStart && timelineEnd ? diffDays(timelineEnd, timelineStart) + 1 : 0;
  const ganttWidth   = totalDays * PX_PER_DAY;

  const today    = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayX   =
    timelineStart && timelineEnd && todayUTC >= timelineStart && todayUTC <= timelineEnd
      ? diffDays(todayUTC, timelineStart) * PX_PER_DAY
      : null;

  // Fim de quarter: divisória tracejada no último dia do trimestre — a mesma
  // marca do calendário mensal de checkpoints. Fica na virada (fim do dia),
  // por isso o +1 antes de multiplicar.
  const quarterEndLines =
    timelineStart && timelineEnd
      ? quarters
          .map((q) => ({ id: q.id, label: `Q${q.quarter} ${q.year}`, d: toUTC(q.endDate)! }))
          .filter(({ d }) => d >= timelineStart! && d <= timelineEnd!)
          .map(({ id, label, d }) => ({
            id,
            label,
            leftPx: (diffDays(d, timelineStart!) + 1) * PX_PER_DAY,
          }))
      : [];

  // ── Scroll to quarter start on load ────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(0);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });

  function handleScroll() {
    if (headerScrollRef.current && scrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }

  function handlePanDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-roadmap-bar]')) return;
    // Arraste de barra em curso: capturar o ponteiro aqui cancelaria o gesto
    // do dnd-kit no meio.
    if (activeDrag) return;
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
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
      }
    }
  }

  function handlePanUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    e.currentTarget.style.cursor = "";
  }
  const quarterStartTime = quarterStart?.getTime();

  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    setControlsHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => {
      setControlsHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollRef.current && timelineStartTime) {
      let scrollPx: number;
      if (todayX !== null) {
        // Center today in the viewport
        const viewportWidth = scrollRef.current.clientWidth;
        scrollPx = Math.max(0, todayX - (viewportWidth - LABEL_W) / 2);
      } else if (quarterStartTime) {
        // Fallback: scroll to quarter start when today is outside the timeline
        const qStart = new Date(quarterStartTime);
        const tStart = new Date(timelineStartTime);
        const daysOffset = diffDays(qStart, tStart);
        scrollPx = Math.max(0, daysOffset * PX_PER_DAY - 20);
      } else {
        return;
      }
      scrollRef.current.scrollTo({ left: scrollPx, behavior: "smooth" });
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = scrollPx;
      }
    }
  }, [localQuarterId, timelineStartTime, quarterStartTime, todayX]);

  // ── Absence bands (vertical) ───────────────────────────────────────────────
  // Memoizadas, assim como as linhas abaixo: o arraste e o hover das barras
  // re-renderizam o componente, e refazer o agrupamento membros × itens a cada
  // render era o que pesava. As datas entram como timestamp porque
  // timelineStart/End são objetos novos a cada render.
  type Band = { leftPx: number; widthPx: number; type: string; label: string };
  const absenceBandsByMember = useMemo(() => {
    const bandsByMember = new Map<string, Band[]>();
    if (timelineStartTime === undefined || timelineEndTime === undefined) return bandsByMember;
    const tStart = new Date(timelineStartTime);
    const tEnd = new Date(timelineEndTime);
    for (const a of ausencias) {
      const s = toUTC(a.startDate)!;
      const e = toUTC(a.endDate)!;
      const cs = s < tStart ? tStart : s;
      const ce = e > tEnd   ? tEnd   : e;
      if (cs > ce) continue;
      const leftPx  = diffDays(cs, tStart) * PX_PER_DAY;
      const widthPx = (diffDays(ce, cs) + 1) * PX_PER_DAY;
      const existing = bandsByMember.get(a.member.id) ?? [];
      existing.push({ leftPx, widthPx, type: a.type, label: `${fmtShort(a.startDate)} – ${fmtShort(a.endDate)}` });
      bandsByMember.set(a.member.id, existing);
    }
    return bandsByMember;
  }, [ausencias, timelineStartTime, timelineEndTime]);

  // ── Member rows ────────────────────────────────────────────────────────────
  type MemberRow = { member: MemberItem; items: RoadmapItem[]; lanes: Map<string, number>; numLanes: number; bands: Band[] };
  const memberRows = useMemo(() => {
    const rows: MemberRow[] = [];
    for (const member of members) {
      if (!member.isActive) continue;
      // Item compartilhado aparece na linha de CADA responsável — o roadmap
      // responde "quando cada pessoa está ocupada", e ela está ocupada com o
      // item mesmo dividindo-o. As barras se repetem entre linhas de propósito.
      const items = filteredItems.filter((item) =>
        item.members.some((m) => m.id === member.id)
      );
      if (items.length === 0) continue;
      const forLanes = items.map((item) => ({
        id: item.id,
        start: toUTC(item.startDate)!,
        end:   toUTC(item.endDate)!,
      }));
      const { lanes, count } = assignLanes(forLanes);
      const bands = absenceBandsByMember.get(member.id) ?? [];
      rows.push({ member, items, lanes, numLanes: count, bands });
    }
    return rows;
  }, [members, filteredItems, absenceBandsByMember]);

  // ── URL builder ────────────────────────────────────────────────────────────
  function buildUrl(overrides: Partial<{ quarter: string; frente: string; type: string; hideOthers: boolean }>) {
    const vals = {
      quarter: localQuarterId,
      frente: localFrenteId,
      type: localType,
      hideOthers: localHideOthers,
      ...overrides,
    };
    const p = new URLSearchParams();
    if (vals.quarter) p.set("quarter", vals.quarter);
    if (vals.frente) p.set("frente", vals.frente);
    if (vals.type && vals.type !== "all") p.set("type", vals.type);
    if (!vals.hideOthers) p.set("outros", "1");
    return `/roadmap?${p.toString()}`;
  }

  function changeQuarter(id: string) {
    setLocalQuarterId(id);
    router.push(buildUrl({ quarter: id }));
  }
  function changeFrente(id: string) {
    setLocalFrenteId(id);
    router.push(buildUrl({ frente: id }));
  }
  function changeType(t: "all" | "iniciativas" | "experimentos") {
    setLocalType(t);
    router.push(buildUrl({ type: t }));
  }
  function toggleHideOthers() {
    const next = !localHideOthers;
    setLocalHideOthers(next);
    router.push(buildUrl({ hideOthers: next }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // No quarter selected
  // ─────────────────────────────────────────────────────────────────────────
  if (!localQuarterId || !selectedQuarter) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="flex items-center gap-3">
          <QuarterSelect quarters={quarters} value={localQuarterId} onChange={changeQuarter} />
        </div>
        <EmptyCard
          icon={<CalendarRange size={36} style={{ color: "var(--text-muted)", opacity: 0.4 }} />}
          title="Selecione um quarter"
          subtitle="Escolha um quarter para visualizar o roadmap."
        />
      </div>
    );
  }

  return (
    <DndContext
      id="roadmap-dnd"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-4">
        {/* ── Page header (barra de navegação fixa) ─────────────────── */}
        <div
          ref={controlsRef}
          className="flex flex-col gap-3"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            background: "var(--bg-app)",
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
         <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <PageHeader />
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Q{selectedQuarter.quarter} {selectedQuarter.year} ·{" "}
              {fmtShort(selectedQuarter.startDate)} – {fmtShort(selectedQuarter.endDate)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {localHideOthers
                ? "Mostrando apenas itens deste quarter"
                : "Mostrando itens do quarter + em aberto de outros quarters"}
            </p>
          </div>

          {/* Ações de criação (topo, à direita). O quarter foi para a barra de
              filtros, junto de Tipo e Frente: é filtro do que o roadmap
              mostra, e ao lado dos botões de criar parecia ação. */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="primary" size="md" onClick={() => setCreateKind("iniciativa")}>
              <ClipboardList size={16} /> Nova Iniciativa
            </Button>
            <Button variant="primary" size="md" onClick={() => setCreateKind("experimento")}>
              <FlaskConical size={16} /> Novo Experimento
            </Button>
          </div>
         </div>

         {/* ── Filtros (card, mesmo padrão de Iniciativas/Experimentos) ── */}
         <Card padding="16px 20px">
           {/* Mesmo desenho da barra de /iniciativas e /experimentos: os filtros
               em dropdown, encostados à direita, numa linha só. Eram duas
               colunas de pills com rótulo em caixa alta, e o card gastava o
               dobro da altura. */}
           <div className="flex flex-wrap gap-2 items-center justify-end">
             {/* Quarter com o MESMO componente dos vizinhos (como nos Rituais).
                 É obrigatório: clicar no já escolhido só fecha o menu — o
                 `single` do MultiSelect limparia a seleção. */}
             <MultiSelect
               single
               label="Quarter"
               selected={[localQuarterId]}
               onChange={(next) => {
                 if (next[0]) changeQuarter(next[0]);
               }}
               options={quarters.map((q) => ({
                 value: q.id,
                 label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
               }))}
             />

             <MultiSelect
               single
               label="Tipo"
               selected={localType && localType !== "all" ? [localType] : []}
               onChange={(next) => changeType((next[0] ?? "all") as (typeof TYPE_FILTERS)[number]["value"])}
               options={TYPE_FILTERS.filter((t) => t.value !== "all").map((t) => ({
                 value: t.value,
                 label: t.label,
               }))}
             />

             <MultiSelect
               single
               label="Frente"
               selected={localFrenteId ? [localFrenteId] : []}
               onChange={(next) => changeFrente(next[0] ?? "")}
               options={frentes
                 .filter((f) => f.isActive)
                 .map((f) => ({ value: f.id, label: f.name }))}
             />

             {/* Ocultar itens em aberto de outros quarters (à direita) */}
             <div className="flex flex-wrap gap-2 items-center">
               <button
                 type="button"
                 onClick={toggleHideOthers}
                 aria-pressed={localHideOthers}
                 className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
                 style={{
                   borderRadius: "var(--radius-md)",
                   border: `1px solid ${localHideOthers ? "var(--brand-primary)" : "var(--border-default)"}`,
                   background: localHideOthers ? "var(--accent-subtle)" : "var(--bg-surface)",
                   color: localHideOthers ? "var(--brand-primary)" : "var(--text-secondary)",
                   boxShadow: "var(--shadow-sm)",
                   cursor: "pointer",
                 }}
                 data-tooltip={
                   localHideOthers
                     ? "Mostrando apenas itens deste quarter — clique para incluir os em aberto de outros quarters"
                     : "Ocultar iniciativas e experimentos em aberto de outros quarters"
                 }
               >
                 {localHideOthers ? <EyeOff size={13} /> : <Eye size={13} />}
                 Outros quarters
               </button>
             </div>
           </div>
         </Card>
        </div>

        {/* ── Legend ───────────────────────────────────────────────── */}
        <div className="space-y-2 py-1 px-1">
          {/* Line 1: Type */}
          <div className="flex items-center gap-4 flex-wrap text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            <span className="flex items-center gap-1.5">
              <ClipboardList size={14} className="text-forest" /> Iniciativa
            </span>
            <span className="flex items-center gap-1.5">
              <FlaskConical size={14} className="text-forest" /> Experimento
            </span>
            <span className="flex items-center gap-1.5">
              {/* A legenda mostra um tipo (férias) como amostra; a cor real
                  de cada faixa vem do tipo dela. */}
              <span
                className="w-3 h-3 rounded-sm"
                style={{
                  background: getAusenciaBarStyle("FERIAS").bg,
                  borderLeft: `2px solid ${getAusenciaBarStyle("FERIAS").color}`,
                }}
              />{" "}
              Ausência
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-0.5 h-3 bg-forest opacity-70" /> Hoje
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3" style={{ borderRight: "2px dashed var(--peach)", width: 2 }} /> Fim de quarter
            </span>
            <span className="ml-auto text-[10px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Info size={10} /> Clique para detalhes · Arraste para mover ou redimensionar
            </span>
          </div>

          {/* Line 2: Status */}
          <div className="flex items-center gap-4 flex-wrap text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-soft border border-sky" /> Backlog
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-peach-soft border border-peach" /> Em Andamento
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-butter-soft border border-butter" /> Aguardando Resultados
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sage-soft border border-sage" /> Concluída
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-cream border border-line" /> Pausada/Cancelada
            </span>
          </div>
        </div>

        {/* ── Roadmap container ─────────────────────────────────────── */}
        {/*
          O header sticky fica FORA do container com overflow:clip para que
          o clip do container não corte o header quando ele está preso no topo.
          marginBottom:-1 faz as bordas do header e do container de rows se
          sobreporrem em 1px, exibindo uma única linha divisória.
        */}
        <div>
          {/* ── Timeline header (sticky, fora do clip container) ─────── */}
          <div
            ref={headerScrollRef}
            style={{
              position: "sticky",
              top: controlsHeight,
              // Acima dos rótulos sticky das linhas (z-30): no empate, eles vinham
              // depois no DOM e pintavam por cima do "Responsável" ao rolar a
              // página. Abaixo da barra de controles (z-40), que fica no topo.
              zIndex: 35,
              overflow: "hidden",
              background: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
              marginBottom: -1,
            }}
          >
            <div style={{ minWidth: LABEL_W + ganttWidth }}>
              <div className="flex">
                <div
                  className="sticky left-0 z-40 shrink-0 flex items-end px-3 pb-1"
                  style={{ width: LABEL_W, minWidth: LABEL_W, background: "var(--bg-app)", borderRight: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Responsável</span>
                </div>
                <GanttTimeline
                  rangeStart={timelineStart!}
                  rangeEnd={timelineEnd!}
                  pixelsPerDay={PX_PER_DAY}
                  totalDays={totalDays}
                  quarterEnds={quarterEndLines}
                />
              </div>
            </div>
          </div>

          {/* ── Rows (clip container + scrollable) ─────────────────── */}
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
            <div style={{ minWidth: LABEL_W + ganttWidth }}>

              {/* ── Rows ───────────────────────────────────────────── */}
              {memberRows.length === 0 ? (
                <div className="flex">
                  <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid var(--border-subtle)" }} />
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 py-14" style={{ color: "var(--text-muted)" }}>
                    <CalendarRange size={32} style={{ opacity: 0.35 }} />
                    <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                      Nenhum item com datas neste quarter
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Defina datas em iniciativas ou experimentos para visualizá-los aqui
                    </p>
                  </div>
                </div>
              ) : (
                memberRows.map((row, rowIdx) => {
                  const sectionH = SECTION_PAD * 2 + row.numLanes * ITEM_H;
                  const isLastRow = rowIdx === memberRows.length - 1;

                  return (
                    <div
                      key={row.member.id}
                      className="flex"
                      style={{
                        height: sectionH,
                        borderBottom: isLastRow ? "none" : "1px solid var(--border-subtle)",
                      }}
                    >
                      {/* ── Sticky label ─────────────────────────── */}
                      <div
                        className="sticky left-0 z-30 shrink-0 flex items-center gap-2.5 px-3"
                        style={{
                          width: LABEL_W,
                          minWidth: LABEL_W,
                          background: "var(--bg-surface)",
                          borderRight: "1px solid var(--border-subtle)",
                          boxShadow: "2px 0 6px rgba(0,0,0,0.04)",
                        }}
                      >
                        <Avatar name={row.member.name} size={28} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {row.member.name}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {row.items.length} {row.items.length === 1 ? "item" : "itens"}
                          </p>
                        </div>
                      </div>

                      {/* ── Bar area ──────────────────────────────── */}
                      <div
                        className="relative"
                        style={{ width: ganttWidth, overflow: "hidden" }}
                      >
                        {/* Absence bands (behind bars) — hover mostra o tooltip
                            do padrão (o title nativo nunca funcionou aqui por
                            causa do pointer-events-none antigo). */}
                        {row.bands.map((band, i) => (
                          <div
                            key={i}
                            className="absolute inset-y-0 z-0"
                            style={{
                              left: band.leftPx,
                              width: band.widthPx,
                              ...ausenciaBandStyle(band.type),
                            }}
                            {...bindBandTip({ type: band.type, label: band.label, memberName: row.member.name })}
                          />
                        ))}

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

                        {/* Bars */}
                        {row.items.map((item) => {
                          const lane = row.lanes.get(item.id) ?? 0;
                          const topPx = SECTION_PAD + lane * ITEM_H + (ITEM_H - BAR_H) / 2;
                          
                          return (
                            <DraggableBar
                              key={item.id}
                              item={item}
                              top={topPx}
                              rowKey={row.member.id}
                              localQuarterId={localQuarterId}
                              timelineStart={timelineStart!}
                              livePos={livePos}
                              onItemClick={setSelectedItem}
                              bindTip={bindBarTip}
                            />
                          );
                        })}

                        {/* Live drag tooltip */}
                        {livePos && row.items.some((i) => i.id === livePos.id) && (() => {
                          const s = toUTC(livePos.startDate);
                          const e = toUTC(livePos.endDate);
                          if (!s || !e || !timelineStart) return null;
                          const leftPx = diffDays(s, timelineStart) * PX_PER_DAY;
                          
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
                              {fmtShort(livePos.startDate)} → {fmtShort(livePos.endDate)}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          </div> {/* fim clip container (rows) */}
        </div> {/* fim wrapper (header + rows) */}

        {/* ── Tooltips de hover (padrão do design system) ─────────── */}
        {barTip && !activeDrag && (
          <CursorTooltip x={barTip.x} y={barTip.y}>
            <TooltipTitle>{barTip.data.name}</TooltipTitle>
            <TooltipLine>
              {fmtLong(barTip.data.startDate)} – {fmtLong(barTip.data.endDate)}
            </TooltipLine>
            <TooltipLine dim>
              {barTip.data.kind === "iniciativa" ? "Iniciativa" : "Experimento"} ·{" "}
              {getStatusMeta(barTip.data.kind, barTip.data.status).label} · {barTip.data.frente.name}
              {barTip.data.quarterId !== localQuarterId &&
                ` · Q${barTip.data.quarter.quarter} ${barTip.data.quarter.year}`}
            </TooltipLine>
            <TooltipHint>Clique para detalhes · Arraste para mover</TooltipHint>
          </CursorTooltip>
        )}
        {bandTip && !activeDrag && !barTip && (
          <CursorTooltip x={bandTip.x} y={bandTip.y}>
            <TooltipTitle>
              {getAusenciaLabel(bandTip.data.type)} · {bandTip.data.memberName}
            </TooltipTitle>
            <TooltipLine>{bandTip.data.label}</TooltipLine>
          </CursorTooltip>
        )}

        {/* ── Detail panel ────────────────────────────────────────── */}
        {selectedItem && !showEditForm && (
          <DetailPanel
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onEdit={() => setShowEditForm(true)}
          />
        )}

        {/* ── Edit forms ──────────────────────────────────────────── */}
        {showEditForm && selectedItem?.kind === "iniciativa" && (
          <IniciativaForm
            mode="edit"
            iniciativa={selectedItem}
            quarters={quarters}
            frentes={frentes}
            members={members}
            initialOkrs={okrs}
            selectedQuarterId={localQuarterId}
            onSuccess={() => { setShowEditForm(false); setSelectedItem(null); }}
            onCancel={() => setShowEditForm(false)}
          />
        )}
        {showEditForm && selectedItem?.kind === "experimento" && (
          <ExperimentoForm
            mode="edit"
            experimento={selectedItem}
            quarters={quarters}
            frentes={frentes}
            members={members}
            initialOkrs={okrs}
            selectedQuarterId={localQuarterId}
            onSuccess={() => { setShowEditForm(false); setSelectedItem(null); }}
            onCancel={() => setShowEditForm(false)}
          />
        )}

        {/* ── Create forms ────────────────────────────────────────── */}
        {createKind === "iniciativa" && (
          <IniciativaForm
            mode="create"
            quarters={quarters}
            frentes={frentes}
            members={members}
            initialOkrs={okrs}
            selectedQuarterId={localQuarterId}
            onSuccess={() => setCreateKind(null)}
            onCancel={() => setCreateKind(null)}
          />
        )}
        {createKind === "experimento" && (
          <ExperimentoForm
            mode="create"
            quarters={quarters}
            frentes={frentes}
            members={members}
            initialOkrs={okrs}
            selectedQuarterId={localQuarterId}
            onSuccess={() => setCreateKind(null)}
            onCancel={() => setCreateKind(null)}
          />
        )}
      </div>
    </DndContext>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PageHeader() {
  return (
    <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
      Roadmap
    </h1>
  );
}

function QuarterSelect({
  quarters,
  value,
  onChange,
}: {
  quarters: QuarterItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <QuarterDropdown quarters={quarters} value={value} onChange={onChange} />
  );
}

function EmptyCard({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-20">
      {icon}
      <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
    </Card>
  );
}

function DetailPanel({
  item,
  onClose,
  onEdit,
}: {
  item: RoadmapItem;
  onClose: () => void;
  onEdit: () => void;
}) {
  const isIni = item.kind === "iniciativa";
  const [detalheAberto, setDetalheAberto] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end pointer-events-none">
      {/* Invisible backdrop to capture outside clicks */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <Card
        className="relative pointer-events-auto m-4 z-10 space-y-3"
        padding={20}
        style={{ width: 340, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isIni ? (
              <Badge bg="var(--accent-subtle)" color="var(--brand-primary)" icon={ClipboardList}>
                Iniciativa
              </Badge>
            ) : (
              <Badge bg="var(--status-review-bg)" color="var(--status-review-text)" icon={FlaskConical}>
                Experimento
              </Badge>
            )}
          </div>
          <IconButton onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X size={14} />
          </IconButton>
        </div>

        {/* Name */}
        <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {item.name}
        </h3>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={item.status} type={isIni ? "iniciativa" : "experimento"} itemId={item.id} />
          {!isIni && <ICEBadge action={(item as RoadmapExperimento).iceAction} />}
        </div>

        {/* ICE Score for experiments */}
        {!isIni && (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {(item as RoadmapExperimento).iceScore.toFixed(1)}
            </span>
            <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>ICE Score</span>
          </div>
        )}

        {/* Details */}
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Frente</dt>
            <dd className="font-medium text-right" style={{ color: "var(--text-primary)" }}>{item.frente.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>
              {item.members.length === 1 ? "Responsável" : "Responsáveis"}
            </dt>
            <dd className="font-medium text-right" style={{ color: "var(--text-primary)" }}>
              {formatMemberNames(item.members)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Início</dt>
            <dd style={{ color: "var(--text-secondary)" }}>{fmtLong(item.startDate)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Fim</dt>
            <dd style={{ color: "var(--text-secondary)" }}>{fmtLong(item.endDate)}</dd>
          </div>
          {item.okr && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              <dt style={{ color: "var(--text-muted)" }}>OKR</dt>
              <dd className="leading-snug" style={{ color: "var(--text-secondary)" }}>
                {(item.kind === "iniciativa" ? item.okr?.objective : (item as RoadmapExperimento).okr?.objective) ?? ""}
              </dd>
            </div>
          )}
          {item.docLink && (
            <div className="flex justify-between items-center pt-0.5">
              <dt style={{ color: "var(--text-muted)" }}>Doc</dt>
              <dd>
                <a
                  href={item.docLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs"
                  style={{ color: "var(--brand-primary)" }}
                >
                  <ExternalLink size={11} /> Abrir link
                </a>
              </dd>
            </div>
          )}
        </dl>

        {/* Editar rapidamente (form sobre o roadmap) à esquerda, em branco;
            Abrir (o detalhe completo, no popup) à direita, em verde — é a
            ação principal do painel. */}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit} style={{ flex: 1 }}>
            Editar rapidamente
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setDetalheAberto(true)}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            Abrir <ExternalLink size={12} />
          </Button>
        </div>
      </Card>
      {detalheAberto && (
        <div className="pointer-events-auto">
          <DetailModal
            id={item.id}
            type={isIni ? "iniciativa" : "experimento"}
            onClose={() => setDetalheAberto(false)}
          />
        </div>
      )}
    </div>
  );
}
