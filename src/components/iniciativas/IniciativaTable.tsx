"use client";

import { useState, useEffect, useRef, Fragment, memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Pencil,
  Trash2,
  ExternalLink,
  ChevronDown,
  MessageCircle,
  ListChecks,
  ArrowRight,
  Table2,
  GanttChartSquare,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { deleteIniciativa, bulkUpdateIniciativas } from "@/actions/iniciativas";
import { StatusBadge, STATUS_OPTIONS } from "@/components/shared/StatusBadge";
import { BulkEditBar, SelectCheckbox, type BulkEditPatch } from "@/components/shared/BulkEditBar";
import { PriorityBadge, PriorityType, PRIORITY_OPTIONS } from "@/components/shared/PriorityBadge";
import { getStatusAccentColor } from "@/lib/statusColors";
import { Avatar } from "@/components/shared/Avatar";
import { MemberChips } from "@/components/shared/MemberChips";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { SortableColumnHeader } from "@/components/shared/SortableColumnHeader";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { SearchField } from "@/components/shared/SearchField";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import { RESULTADO_CONFIG } from "@/components/shared/ResultadoBadge";
import { diaPtBr } from "@/lib/csv";
import { getStatusMeta } from "@/lib/statusConfig";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import Link from "next/link";
import dynamic from "next/dynamic";

// Formulário só abre sob demanda (modal): fica fora do bundle inicial da tela.
const IniciativaForm = dynamic(
  () => import("@/components/iniciativas/IniciativaForm").then((m) => ({ default: m.IniciativaForm })),
  { ssr: false }
);

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };
type OKRItem = { id: string; objective: string };

type IniciativaItem = {
  id: string;
  name: string;
  status: string;
  priority: string;
  frenteId: string;
  quarterId: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  launchDate: Date | string | null;
  analysisDate: Date | string | null;
  resultado: string | null;
  okrId: string | null;
  docLink: string | null;
  frente: { id: string; name: string };
  members: { id: string; name: string }[];
  okr: { id: string; objective: string } | null;
  quarter: { id: string; year: number; quarter: number };
  /** Feitos de todos os checkpoints (a tabela só mostra "feitos/total"). */
  checkpointsConcluidos: number;
  _count: { comments: number; checkpoints: number };
};

type SortKey = "name" | "frente" | "member" | "status" | "priority" | "startDate";

interface IniciativaTableProps {
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  okrs: OKRItem[];
  iniciativas: IniciativaItem[];
  selectedQuarterId: string | null;
  currentStatuses: string[];
  currentPriorities: string[];
  currentFrenteIds: string[];
  currentMemberIds: string[];
  currentView: "table" | "gantt";
  hideOtherQuarters?: boolean;
  userEmail: string;
  /** Busca por nome vigente na URL (`?q=`). */
  currentQuery?: string;
}

type ColDef = { key: string; label: string; sortKey?: SortKey; defaultWidth: number };

const INI_COLS: ColDef[] = [
  { key: "name", label: "Nome", sortKey: "name", defaultWidth: 210 },
  { key: "member", label: "Responsável", sortKey: "member", defaultWidth: 140 },
  { key: "status", label: "Status", sortKey: "status", defaultWidth: 130 },
  { key: "priority", label: "Prioridade", sortKey: "priority", defaultWidth: 115 },
  { key: "startDate", label: "Início", sortKey: "startDate", defaultWidth: 85 },
  { key: "endDate", label: "Fim", defaultWidth: 75 },
  { key: "okr", label: "OKR", defaultWidth: 160 },
  { key: "doc", label: "Doc", defaultWidth: 56 },
];

const DEFAULT_ORDER = INI_COLS.map((c) => c.key);
const DEFAULT_WIDTHS = Object.fromEntries(INI_COLS.map((c) => [c.key, c.defaultWidth]));
const ACTIONS_COL_WIDTH = 100;
const SELECT_COL_WIDTH = 44;

const PRIORITY_ORDER: Record<string, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function renderIniciativaCell(
  colKey: string,
  ini: IniciativaItem,
  localQuarterId: string
): React.ReactNode {
  const completedCheckpoints = ini.checkpointsConcluidos;
  const totalCheckpoints = ini._count.checkpoints;

  switch (colKey) {
    case "name":
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {ini.name}
            </span>
            {ini.quarterId !== localQuarterId && (
              <Badge
                bg="var(--bg-app)"
                color="var(--text-muted)"
                borderColor="var(--border-subtle)"
                className="shrink-0"
                style={{ fontSize: 10, padding: "2px 6px" }}
                title={`Originalmente de Q${ini.quarter?.quarter} ${ini.quarter?.year} — ainda em ${ini.status}`}
              >
                Q{ini.quarter?.quarter} {ini.quarter?.year}
              </Badge>
            )}
          </div>
          {(totalCheckpoints > 0 || ini._count.comments > 0) && (
            <div className="flex items-center gap-3">
              {totalCheckpoints > 0 && (
                <div
                  className="flex items-center gap-1 text-[10px] font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ListChecks size={10} />
                  {completedCheckpoints}/{totalCheckpoints}
                </div>
              )}
              {ini._count.comments > 0 && (
                <div
                  className="flex items-center gap-1 text-[10px] font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  <MessageCircle size={10} />
                  {ini._count.comments}
                </div>
              )}
            </div>
          )}
        </div>
      );

    case "frente":
      return (
        <span className="text-xs truncate block" style={{ color: "var(--text-secondary)" }}>
          {ini.frente.name}
        </span>
      );

    case "member":
      // Coluna estreita (140px): avatar + primeiro nome do primeiro
      // responsável; os demais viram "+N", com os nomes no tooltip.
      return ini.members.length > 0 ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar name={ini.members[0].name} size={20} />
          <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
            {ini.members[0].name.split(" ")[0]}
          </span>
          {ini.members.length > 1 && (
            <MemberChips
              members={ini.members.slice(1)}
              max={0}
              tooltipTitle="Também responsáveis"
            />
          )}
        </div>
      ) : (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          —
        </span>
      );

    case "status":
      return <StatusBadge status={ini.status} type="iniciativa" itemId={ini.id} />;

    case "priority":
      return <PriorityBadge priority={ini.priority as PriorityType} />;

    case "startDate":
      return (
        <span className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
          {formatDate(ini.startDate)}
        </span>
      );

    case "endDate":
      return (
        <span className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
          {formatDate(ini.endDate)}
        </span>
      );

    case "okr":
      return ini.okr ? (
        <span
          className="text-xs block truncate"
          style={{ color: "var(--brand-primary)" }}
          data-tooltip={ini.okr.objective}
        >
          {ini.okr.objective}
        </span>
      ) : (
        <span style={{ color: "var(--border-default)" }}>—</span>
      );

    case "doc":
      return ini.docLink ? (
        <a
          href={ini.docLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ini.docLink} data-tooltip={ini.docLink}
          style={{ color: "var(--brand-primary)", display: "flex", alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={14} />
        </a>
      ) : (
        <span style={{ color: "var(--border-default)" }}>—</span>
      );

    default:
      return null;
  }
}

// Linha da tabela, memoizada: marcar a seleção de um item (ou mudar qualquer
// outro estado da tabela) re-renderizava TODAS as linhas — badges, TagSelect,
// chips de responsáveis. Agora só a linha cujas props mudaram. Por isso a
// tabela passa handlers estáveis (useCallback) que recebem o item, em vez de
// closures criadas por linha, e o orderedCols memoizado.
const IniciativaRow = memo(function IniciativaRow({
  ini,
  isLast,
  selected,
  orderedCols,
  localQuarterId,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  ini: IniciativaItem;
  isLast: boolean;
  selected: boolean;
  orderedCols: ColDef[];
  localQuarterId: string;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (ini: IniciativaItem) => void;
  onDelete: (ini: IniciativaItem) => void;
}) {
  return (
    <tr
      className="transition-colors cursor-pointer hover:bg-forest-soft/30"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        boxShadow: `inset 4px 0 0 ${getStatusAccentColor("iniciativa", ini.status)}`,
      }}
      onClick={() => onOpen(ini.id)}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <SelectCheckbox
          checked={selected}
          onToggle={() => onToggleSelect(ini.id)}
          ariaLabel={`Selecionar ${ini.name}`}
        />
      </td>
      {orderedCols.map((col) => (
        <td key={col.key} className="px-4 py-3" style={{ overflow: "hidden" }}>
          {renderIniciativaCell(col.key, ini, localQuarterId)}
        </td>
      ))}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <Link
            href={`/iniciativas/${ini.id}`}
            data-tooltip="Ver detalhes"
            aria-label="Ver detalhes"
            className="icon-btn"
            style={{ width: 28, height: 28, color: "var(--brand-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowRight size={16} />
          </Link>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onEdit(ini);
            }}
            title="Editar"
            aria-label="Editar"
          >
            <Pencil size={13} />
          </IconButton>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onDelete(ini);
            }}
            title="Excluir"
            aria-label="Excluir"
            className="icon-btn--danger"
          >
            <Trash2 size={13} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
});

export function IniciativaTable({
  quarters,
  frentes,
  members,
  okrs,
  iniciativas,
  selectedQuarterId,
  currentStatuses,
  currentPriorities,
  currentFrenteIds,
  currentMemberIds,
  currentView,
  hideOtherQuarters = true,
  userEmail,
  currentQuery = "",
}: IniciativaTableProps) {
  const router = useRouter();

  const [localQuarterId, setLocalQuarterId] = useState(selectedQuarterId ?? "");
  const [localStatuses, setLocalStatuses] = useState(currentStatuses);
  const [localPriorities, setLocalPriorities] = useState(currentPriorities);
  const [localFrenteIds, setLocalFrenteIds] = useState(currentFrenteIds);
  const [localMemberIds, setLocalMemberIds] = useState(currentMemberIds);
  const [localHideOthers, setLocalHideOthers] = useState(hideOtherQuarters);

  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [showForm, setShowForm] = useState(false);
  const [editingIniciativa, setEditingIniciativa] = useState<IniciativaItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Seleção em massa.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ text: string; tone: "info" | "error" } | null>(null);

  // Column preferences
  const prefs = useTablePreferences("iniciativas", userEmail, DEFAULT_ORDER, DEFAULT_WIDTHS);
  const [resizingColKey, setResizingColKey] = useState<string | null>(null);
  const effectiveWidths = prefs.widths;
  const tableRef = useRef<HTMLTableElement>(null);

  // DnD state
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  // Cursor override while resizing
  useEffect(() => {
    if (!resizingColKey) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingColKey]);

  // Memoizado: vai como prop para cada linha (memo); um array novo a cada
  // render derrubaria o memo de todas.
  const orderedCols = useMemo(
    () => prefs.order.map((key) => INI_COLS.find((c) => c.key === key)).filter(Boolean) as ColDef[],
    [prefs.order]
  );

  function startResize(e: React.MouseEvent, colKey: string) {
    e.stopPropagation();
    e.preventDefault();
    setResizingColKey(colKey);
    const startX = e.clientX;
    const startWidth = effectiveWidths[colKey] ?? DEFAULT_WIDTHS[colKey] ?? 100;
    // Durante o arraste a largura vai direto no DOM (<col> + largura da
    // tabela), sem setState: antes cada pixel re-renderizava, reordenava e
    // reagrupava a tabela inteira. O valor só vira estado no mouseup, e o
    // render que ele dispara escreve no DOM a mesma largura.
    const table = tableRef.current;
    const colEl = table?.querySelector<HTMLTableColElement>(`col[data-col="${colKey}"]`);
    const startTableWidth = tableComputedWidth;

    function onMove(evt: MouseEvent) {
      const newWidth = Math.max(50, startWidth + evt.clientX - startX);
      if (colEl) colEl.style.width = `${newWidth}px`;
      if (table) table.style.width = `${startTableWidth - startWidth + newWidth}px`;
    }

    function onUp(evt: MouseEvent) {
      const newWidth = Math.max(50, startWidth + evt.clientX - startX);
      prefs.resizeCol(colKey, newWidth);
      setResizingColKey(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveColId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveColId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      prefs.reorderCols(String(active.id), String(over.id));
    }
  }

  // Remove da seleção ids que sumiram da lista (mudança de filtro/quarter).
  // Sincroniza estado local com uma prop externa — uso legítimo de efeito.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(iniciativas.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => (valid.has(id) ? next.add(id) : (changed = true)));
      return changed ? next : prev;
    });
  }, [iniciativas]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkMsg(null);
  }

  async function handleBulkApply(patch: BulkEditPatch) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    const res = await bulkUpdateIniciativas(ids, patch);
    setBulkBusy(false);
    if (!res.success) {
      setBulkMsg({ text: res.error, tone: "error" });
      return;
    }
    if (res.data.skipped > 0) {
      setBulkMsg({
        text: `${res.data.updated} atualizada${res.data.updated !== 1 ? "s" : ""}, ${res.data.skipped} sem permissão para editar.`,
        tone: "info",
      });
    } else {
      setBulkMsg(null);
    }
  }

  function buildUrl(
    overrides: Partial<
      Record<"quarter" | "view", string> &
        Record<"status" | "priority" | "frente" | "member", string[]> & {
          hideOthers: boolean;
          q: string;
        }
    >
  ) {
    const vals = {
      quarter: localQuarterId,
      status: localStatuses,
      priority: localPriorities,
      frente: localFrenteIds,
      member: localMemberIds,
      view: currentView === "gantt" ? "gantt" : "",
      hideOthers: localHideOthers,
      q: currentQuery,
      ...overrides,
    };
    const params = new URLSearchParams();
    const setMulti = (key: string, list: string[]) => {
      const joined = list.filter(Boolean).join(",");
      if (joined) params.set(key, joined);
    };
    if (vals.quarter) params.set("quarter", vals.quarter);
    setMulti("status", vals.status);
    setMulti("priority", vals.priority);
    setMulti("frente", vals.frente);
    setMulti("member", vals.member);
    if (vals.view) params.set("view", vals.view);
    if (!vals.hideOthers) params.set("outros", "1");
    if (vals.q) params.set("q", vals.q);
    return `/iniciativas?${params.toString()}`;
  }

  function handleQuarterChange(id: string) {
    setLocalQuarterId(id);
    setLocalStatuses([]);
    setLocalPriorities([]);
    setLocalFrenteIds([]);
    setLocalMemberIds([]);
    router.push(buildUrl({ quarter: id, status: [], priority: [], frente: [], member: [] }));
  }

  function handleStatusChange(next: string[]) {
    setLocalStatuses(next);
    router.push(buildUrl({ status: next }));
  }

  function handlePriorityChange(priorities: string[]) {
    setLocalPriorities(priorities);
    router.push(buildUrl({ priority: priorities }));
  }

  function handleFrenteChange(ids: string[]) {
    setLocalFrenteIds(ids);
    router.push(buildUrl({ frente: ids }));
  }

  function handleMemberChange(ids: string[]) {
    setLocalMemberIds(ids);
    router.push(buildUrl({ member: ids }));
  }

  function clearFilters() {
    setLocalStatuses([]);
    setLocalPriorities([]);
    setLocalFrenteIds([]);
    setLocalMemberIds([]);
    router.push(buildUrl({ status: [], priority: [], frente: [], member: [], q: "" }));
  }

  function toggleHideOthers() {
    const next = !localHideOthers;
    setLocalHideOthers(next);
    router.push(buildUrl({ hideOthers: next }));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openCreate() {
    setEditingIniciativa(null);
    setShowForm(true);
    setErrorMsg(null);
  }

  const openEdit = useCallback((ini: IniciativaItem) => {
    setEditingIniciativa(ini);
    setShowForm(true);
    setErrorMsg(null);
  }, []);

  const openDetail = useCallback((id: string) => router.push(`/iniciativas/${id}`), [router]);
  const requestDelete = useCallback((ini: IniciativaItem) => setDeleteTarget(ini.id), []);

  function closeForm() {
    setShowForm(false);
    setEditingIniciativa(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    setErrorMsg(null);
    const res = await deleteIniciativa(id);
    if (!res.success) setErrorMsg(res.error);
  }

  // Toggle "Outros quarters": o servidor já traz itens em aberto de outros
  // quarters; quando ativo, restringe a visão ao quarter selecionado.
  const visibleIniciativas = localHideOthers
    ? iniciativas.filter((i) => i.quarterId === localQuarterId)
    : iniciativas;

  const sorted = [...visibleIniciativas].sort((a, b) => {
    let valA: any;
    let valB: any;
    switch (sortKey) {
      case "name":
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case "frente":
        valA = a.frente.name.toLowerCase();
        valB = b.frente.name.toLowerCase();
        break;
      case "member":
        // Pelo primeiro responsável — a lista já vem alfabética do servidor,
        // então itens compartilhados caem sob o primeiro nome da equipe.
        valA = (a.members[0]?.name ?? "").toLowerCase();
        valB = (b.members[0]?.name ?? "").toLowerCase();
        break;
      case "status":
        valA = a.status;
        valB = b.status;
        break;
      case "priority":
        valA = PRIORITY_ORDER[a.priority] ?? 99;
        valB = PRIORITY_ORDER[b.priority] ?? 99;
        break;
      case "startDate":
        valA = a.startDate ? new Date(a.startDate as any).getTime() : 0;
        valB = b.startDate ? new Date(b.startDate as any).getTime() : 0;
        break;
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Segmenta as iniciativas por frente: um grupo por frente, ordenados
  // alfabeticamente; a ordenação das colunas continua valendo dentro de cada grupo.
  const groupedByFrente = (() => {
    const map = new Map<string, { frenteId: string; frenteName: string; items: typeof sorted }>();
    for (const ini of sorted) {
      let group = map.get(ini.frenteId);
      if (!group) {
        group = { frenteId: ini.frenteId, frenteName: ini.frente.name, items: [] };
        map.set(ini.frenteId, group);
      }
      group.items.push(ini);
    }
    return [...map.values()].sort((a, b) =>
      a.frenteName.localeCompare(b.frenteName, "pt-BR")
    );
  })();

  const hasFilters =
    localStatuses.length > 0 ||
    localPriorities.length > 0 ||
    localFrenteIds.length > 0 ||
    localMemberIds.length > 0 ||
    currentQuery.length > 0;
  const activeFrentes = frentes.filter((f) => f.isActive);
  const activeMembers = members.filter((m) => m.isActive);

  const tableComputedWidth =
    SELECT_COL_WIDTH +
    orderedCols.reduce((sum, col) => sum + (effectiveWidths[col.key] ?? col.defaultWidth), 0) +
    ACTIONS_COL_WIDTH;

  return (
    <div>
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        {/* min-w-0 + flex-1: quem quebra é a linha de texto, não a barra de
            controles, que fica à direita como em /iniciativas. */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Iniciativas
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Gerencie as iniciativas do time de Growth
          </p>
          {localQuarterId && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {localHideOthers
                ? "Mostrando apenas iniciativas deste quarter"
                : "Mostrando itens do quarter + iniciativas em aberto de outros quarters"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {/* O quarter mora na barra de filtros, como no /roadmap e nos OKRs. */}
          {/* View toggle */}
          <SegmentedToggle
            ariaLabel="Modo de visualização"
            value={currentView}
            items={[
              { value: "table", label: "Tabela", icon: Table2, href: buildUrl({ view: "" }) },
              { value: "gantt", label: "Gantt", icon: GanttChartSquare, href: buildUrl({ view: "gantt" }) },
            ]}
          />

          {localQuarterId && (
            <ExportCsvButton
              nomeBase="Iniciativas"
              disabled={sorted.length === 0}
              colunas={["Nome", "Status", "Prioridade", "Frente", "Responsáveis", "Início", "Fim", "Lançamento", "Análise", "Resultado", "Quarter", "OKR", "Link do documento"]}
              // O que está na tela: já filtrado (inclusive pela busca) e ordenado.
              linhas={() =>
                sorted.map((i) => [
                  i.name,
                  getStatusMeta("iniciativa", i.status).label,
                  PRIORITY_OPTIONS.find((p) => p.value === i.priority)?.label ?? i.priority,
                  i.frente.name,
                  i.members.map((m) => m.name).join(", "),
                  diaPtBr(i.startDate),
                  diaPtBr(i.endDate),
                  diaPtBr(i.launchDate),
                  diaPtBr(i.analysisDate),
                  i.resultado ? (RESULTADO_CONFIG[i.resultado]?.label ?? i.resultado) : "",
                  `Q${i.quarter.quarter} ${i.quarter.year}`,
                  i.okr?.objective ?? "",
                  i.docLink ?? "",
                ])
              }
            />
          )}

          {localQuarterId && (
            <Button variant="primary" size="md" onClick={openCreate}>
              <ClipboardList size={16} />
              Nova Iniciativa
            </Button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          className="mb-4 text-sm px-4 py-3 rounded-xl"
          style={{
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────── */}
      {/* Sempre visível: o quarter mora aqui, e sem quarter escolhido a pessoa
          precisa dele para sair do vazio. Os demais filtros só fazem sentido
          com um quarter. */}
        <Card className="flex flex-wrap gap-4 items-center mb-6" padding="12px 16px">
          {/* Status era uma fileira de pills ocupando uma linha inteira do card
              — o único filtro com desenho próprio. Agora é dropdown como os
              vizinhos. */}
          <div className="flex gap-2 flex-wrap items-center ml-auto">
            {/* Quarter com o mesmo componente dos vizinhos. Obrigatório:
                clicar no já escolhido só fecha o menu (o `single` limparia). */}
            <MultiSelect
              single
              label="Quarter"
              selected={localQuarterId ? [localQuarterId] : []}
              onChange={(next) => {
                if (next[0]) handleQuarterChange(next[0]);
              }}
              options={quarters.map((q) => ({
                value: q.id,
                label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
              }))}
            />

            {localQuarterId && (
            <>
            <SearchField
              value={currentQuery}
              onSearch={(q) => router.replace(buildUrl({ q }))}
              placeholder="Buscar iniciativa…"
              label="Buscar iniciativa por nome"
            />

            <MultiSelect
              label="Status"
              selected={localStatuses}
              onChange={handleStatusChange}
              options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            />

            <MultiSelect
              label="Frentes"
              selected={localFrenteIds}
              onChange={handleFrenteChange}
              options={activeFrentes.map((f) => ({ value: f.id, label: f.name }))}
            />

            <MultiSelect
              label="Membros"
              selected={localMemberIds}
              onChange={handleMemberChange}
              options={activeMembers.map((m) => ({ value: m.id, label: m.name }))}
            />

            <MultiSelect
              label="Prioridades"
              selected={localPriorities}
              onChange={handlePriorityChange}
              options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
            />

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs underline"
                style={{
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Limpar
              </button>
            )}

            {/* Ocultar iniciativas em aberto de outros quarters */}
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
                  : "Ocultar iniciativas em aberto de outros quarters"
              }
            >
              {localHideOthers ? <EyeOff size={13} /> : <Eye size={13} />}
              Outros quarters
            </button>
            </>
            )}
          </div>
        </Card>

      {/* ── Content ──────────────────────────────────── */}
      {!localQuarterId ? (
        <Card padding={0}>
          <EmptyState
            icon={ClipboardList}
            title="Selecione um quarter"
            description="Escolha um quarter para visualizar as iniciativas"
          />
        </Card>
      ) : sorted.length === 0 ? (
        <Card padding={0}>
          <EmptyState
            icon={ClipboardList}
            // Com filtro ativo a lista vazia é "nenhum resultado", não "não existe
            // nada" — oferecer "criar" aqui mandava a pessoa duplicar o que só
            // estava escondido pelos filtros.
            title={hasFilters ? "Nenhuma iniciativa com esses filtros" : "Nenhuma iniciativa encontrada"}
            description={
              hasFilters
                ? "Ajuste ou limpe os filtros para ver as iniciativas do quarter"
                : "Crie a primeira iniciativa do quarter"
            }
            action={
              hasFilters
                ? { label: "Limpar filtros", onClick: clearFilters }
                : { label: "Nova Iniciativa", onClick: openCreate }
            }
          />
        </Card>
      ) : !prefs.ready ? (
        // Antes do load das prefs (localStorage): skeleton neutro (sem DnD) pra
        // SSR e primeiro render do cliente baterem — evita mismatch do dnd-kit.
        <Card className="overflow-hidden" padding={0} style={{ minHeight: 320 }} />
      ) : (
        <Card className="overflow-hidden" padding={0}>
          <div className="overflow-x-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <table
                ref={tableRef}
                className="text-sm"
                style={{
                  tableLayout: "fixed",
                  width: tableComputedWidth,
                  minWidth: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <colgroup>
                  <col style={{ width: SELECT_COL_WIDTH }} />
                  {orderedCols.map((col) => (
                    <col
                      key={col.key}
                      data-col={col.key}
                      style={{ width: effectiveWidths[col.key] ?? col.defaultWidth }}
                    />
                  ))}
                  <col style={{ width: ACTIONS_COL_WIDTH }} />
                </colgroup>
                <thead>
                  <SortableContext
                    items={orderedCols.map((c) => c.key)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        background: "var(--bg-app)",
                      }}
                    >
                      <th className="px-4 py-3" style={{ width: SELECT_COL_WIDTH }}>
                        <SelectCheckbox
                          checked={sorted.length > 0 && sorted.every((i) => selectedIds.has(i.id))}
                          indeterminate={
                            sorted.some((i) => selectedIds.has(i.id)) &&
                            !sorted.every((i) => selectedIds.has(i.id))
                          }
                          onToggle={() => toggleSelectAll(sorted.map((i) => i.id))}
                          ariaLabel="Selecionar todas"
                          title="Selecionar todas"
                        />
                      </th>
                      {orderedCols.map((col) => (
                        <SortableColumnHeader
                          key={col.key}
                          colKey={col.key}
                          label={col.label}
                          sortKey={col.sortKey}
                          width={effectiveWidths[col.key] ?? col.defaultWidth}
                          currentSortKey={sortKey}
                          sortDir={sortDir}
                          onSort={(key) => toggleSort(key as SortKey)}
                          onResizeStart={startResize}
                          resizingColKey={resizingColKey}
                        />
                      ))}
                      <th
                        className="px-4 py-3"
                        style={{ width: ACTIONS_COL_WIDTH }}
                      />
                    </tr>
                  </SortableContext>
                </thead>
                <tbody>
                  {groupedByFrente.map((group, groupIdx) => (
                    <Fragment key={group.frenteId}>
                      {/* Cabeçalho da frente */}
                      <tr
                        style={{
                          background: "var(--bg-app)",
                          borderTop:
                            groupIdx > 0 ? "1px solid var(--border-subtle)" : "none",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <td colSpan={orderedCols.length + 2} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-semibold uppercase"
                              style={{
                                color: "var(--text-secondary)",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {group.frenteName}
                            </span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {group.items.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {group.items.map((ini, idx) => (
                        <IniciativaRow
                          key={ini.id}
                          ini={ini}
                          isLast={idx === group.items.length - 1}
                          selected={selectedIds.has(ini.id)}
                          orderedCols={orderedCols}
                          localQuarterId={localQuarterId}
                          onToggleSelect={toggleSelect}
                          onOpen={openDetail}
                          onEdit={openEdit}
                          onDelete={requestDelete}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <DragOverlay dropAnimation={null}>
                {activeColId ? (
                  <div
                    style={{
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 14px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
                      whiteSpace: "nowrap",
                      opacity: 0.95,
                    }}
                  >
                    {INI_COLS.find((c) => c.key === activeColId)?.label}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
          <div
            className="px-4 py-2 text-xs"
            style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
          >
            {sorted.length} iniciativa{sorted.length !== 1 ? "s" : ""}
          </div>
        </Card>
      )}

      <BulkEditBar
        count={selectedIds.size}
        statusOptions={STATUS_OPTIONS}
        quarters={quarters}
        members={activeMembers}
        okrs={okrs}
        onApply={handleBulkApply}
        onClear={clearSelection}
        busy={bulkBusy}
        message={bulkMsg?.text ?? null}
        messageTone={bulkMsg?.tone}
      />

      {/* Modal form */}
      {showForm && (
        <IniciativaForm
          mode={editingIniciativa ? "edit" : "create"}
          iniciativa={editingIniciativa ?? undefined}
          quarters={quarters}
          frentes={frentes}
          members={members}
          initialOkrs={okrs}
          selectedQuarterId={localQuarterId}
          onSuccess={closeForm}
          onCancel={closeForm}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir iniciativa"
          message="Tem certeza que deseja excluir esta iniciativa? Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
