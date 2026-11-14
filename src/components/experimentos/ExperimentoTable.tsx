"use client";

import { useState, useEffect, useRef, Fragment, memo, useCallback, useMemo, useOptimistic, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Plus,
  ChevronDown,
  Pencil,
  Trash2,
  ExternalLink,
  ArrowRight,
  ListChecks,
  MessageCircle,
  BarChart2,
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
import { deleteExperimento, updateExperimentoScores, bulkUpdateExperimentos } from "@/actions/experimentos";
import { Button } from "@/components/shared/Button";
import { BulkEditBar, SelectCheckbox, type BulkEditPatch } from "@/components/shared/BulkEditBar";
import { type ExperimentoItem } from "./ExperimentoCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { ExperimentosKanban } from "./ExperimentosKanban";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ICEBadge } from "@/components/shared/ICEBadge";
import { Avatar } from "@/components/shared/Avatar";
import { MemberChips } from "@/components/shared/MemberChips";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { SortableColumnHeader } from "@/components/shared/SortableColumnHeader";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { SearchField } from "@/components/shared/SearchField";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import { RESULTADO_CONFIG } from "@/components/shared/ResultadoBadge";
import { diaPtBr } from "@/lib/csv";
import { getStatusMeta } from "@/lib/statusConfig";
import { getStatusAccentColor } from "@/lib/statusColors";
import { calculateICEScore, getICEAction } from "@/lib/ice";
import { toast } from "@/components/shared/Toast";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import Link from "next/link";
import dynamic from "next/dynamic";

// Formulário só abre sob demanda (modal): fica fora do bundle inicial da tela.
const ExperimentoForm = dynamic(
  () => import("@/components/experimentos/ExperimentoForm").then((m) => ({ default: m.ExperimentoForm })),
  { ssr: false }
);

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };
type OKRItem = { id: string; objective: string };
type SortKey = "name" | "frente" | "member" | "status" | "iceScore" | "startDate";

type ColDef = { key: string; label: string; sortKey?: SortKey; defaultWidth: number };

const EXP_COLS: ColDef[] = [
  { key: "name", label: "Nome", sortKey: "name", defaultWidth: 210 },
  { key: "member", label: "Responsável", sortKey: "member", defaultWidth: 140 },
  // Larguras maiores que as de /iniciativas porque os rótulos são maiores:
  // "Resultados apresentados" e "Executar Agora · ICE 6.0" nasciam cortados, e
  // só quem redimensionava a coluna via a pill inteira.
  { key: "status", label: "Status", sortKey: "status", defaultWidth: 200 },
  { key: "iceScore", label: "ICE", sortKey: "iceScore", defaultWidth: 220 },
  { key: "startDate", label: "Início", sortKey: "startDate", defaultWidth: 85 },
  { key: "endDate", label: "Fim", defaultWidth: 75 },
  { key: "okr", label: "OKR", defaultWidth: 160 },
  { key: "doc", label: "Doc", defaultWidth: 56 },
];

const DEFAULT_ORDER = EXP_COLS.map((c) => c.key);
const DEFAULT_WIDTHS = Object.fromEntries(EXP_COLS.map((c) => [c.key, c.defaultWidth]));
const ACTIONS_COL_WIDTH = 100;
const SELECT_COL_WIDTH = 44;

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function buildUrl(
  base: Record<string, string | string[] | null | undefined>,
  overrides: Record<string, string | string[]>
) {
  const params = new URLSearchParams();
  const merged = { ...base, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    const value = Array.isArray(v) ? v.filter(Boolean).join(",") : v;
    if (value) params.set(k, value);
  }
  const qs = params.toString();
  return qs ? `/experimentos?${qs}` : "/experimentos";
}

const EXPERIMENTO_STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "EM_ANDAMENTO", label: "Em Andamento" },
  { value: "AGUARDANDO_RESULTADOS", label: "Aguardando resultados" },
  { value: "RELATORIO_PRONTO", label: "Relatório pronto" },
  { value: "RESULTADOS_APRESENTADOS", label: "Resultados apresentados" },
  { value: "PAUSADO", label: "Pausado" },
  { value: "ARQUIVADO", label: "Arquivado" },
];

const ICE_ACTION_OPTIONS = [
  { value: "EXECUTAR_AGORA", label: "Executar Agora" },
  { value: "EM_SEGUIDA", label: "Em Seguida" },
  { value: "BACKLOG", label: "Backlog" },
  { value: "ARQUIVAR", label: "Arquivar" },
];

function renderExperimentoCell(
  colKey: string,
  exp: ExperimentoItem,
  effectiveQuarterId: string
): React.ReactNode {
  switch (colKey) {
    case "name":
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {exp.name}
            </span>
            {exp.quarterId !== effectiveQuarterId && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-sm whitespace-nowrap shrink-0"
                style={{
                  background: "var(--bg-app)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
                data-tooltip={`Originalmente de Q${exp.quarter?.quarter} ${exp.quarter?.year}`}
              >
                Q{exp.quarter?.quarter} {exp.quarter?.year}
              </span>
            )}
          </div>
          {exp._count && (exp._count.checkpoints > 0 || exp._count.comments > 0) && (
            <div className="flex items-center gap-3">
              {exp._count.checkpoints > 0 && (
                <div
                  className="flex items-center gap-1 text-[10px] font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ListChecks size={10} />
                  {exp._count.checkpoints}
                </div>
              )}
              {exp._count.comments > 0 && (
                <div
                  className="flex items-center gap-1 text-[10px] font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  <MessageCircle size={10} />
                  {exp._count.comments}
                </div>
              )}
            </div>
          )}
        </div>
      );

    case "frente":
      return (
        <span className="text-xs truncate block" style={{ color: "var(--text-secondary)" }}>
          {exp.frente.name}
        </span>
      );

    case "member":
      // Mesma anatomia da coluna de Iniciativas: avatar + primeiro nome do
      // primeiro responsável; os demais viram "+N", com os nomes no tooltip.
      return exp.members.length > 0 ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar name={exp.members[0].name} size={20} />
          <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
            {exp.members[0].name.split(" ")[0]}
          </span>
          {exp.members.length > 1 && (
            <MemberChips
              members={exp.members.slice(1)}
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
      return <StatusBadge status={exp.status} type="experimento" itemId={exp.id} />;

    case "iceScore":
      return <ICEBadge action={exp.iceAction} iceScore={exp.iceScore} />;

    case "startDate":
      return (
        <span className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
          {formatDate(exp.startDate)}
        </span>
      );

    case "endDate":
      return (
        <span className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
          {formatDate(exp.endDate)}
        </span>
      );

    case "okr":
      return exp.okr ? (
        <span
          className="text-xs block truncate"
          style={{ color: "var(--brand-primary)" }}
          data-tooltip={exp.okr.objective}
        >
          {exp.okr.objective}
        </span>
      ) : (
        <span style={{ color: "var(--border-default)" }}>—</span>
      );

    case "doc":
      return exp.docLink ? (
        <a
          href={exp.docLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={exp.docLink} data-tooltip={exp.docLink}
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

interface ExperimentoTableProps {
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  okrs: OKRItem[];
  experimentos: ExperimentoItem[];
  selectedQuarterId: string | null;
  currentStatuses: string[];
  currentFrenteIds: string[];
  currentMemberIds: string[];
  currentIceActions: string[];
  /** Busca vigente na URL (`?q=`): nome, objetivo e descrição. */
  currentQuery?: string;
  hideOtherQuarters?: boolean;
  userEmail: string;
  /** Visitante só lê — hoje isso só muda o kanban (arrastar e editar). */
  canEdit?: boolean;
}

// Linha da tabela, memoizada: marcar a seleção de um item (ou mudar qualquer
// outro estado da tabela) re-renderizava TODAS as linhas — badges, TagSelect,
// chips de responsáveis. Agora só a linha cujas props mudaram. Por isso a
// tabela passa handlers estáveis (useCallback) que recebem o item, em vez de
// closures criadas por linha, e o orderedCols memoizado.
const ExperimentoRow = memo(function ExperimentoRow({
  exp,
  isLast,
  selected,
  orderedCols,
  quarterId,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  exp: ExperimentoItem;
  isLast: boolean;
  selected: boolean;
  orderedCols: ColDef[];
  quarterId: string;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (exp: ExperimentoItem) => void;
  onDelete: (exp: ExperimentoItem) => void;
}) {
  return (
    <tr
      className="transition-colors cursor-pointer hover:bg-forest-soft/30"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        boxShadow: `inset 4px 0 0 ${getStatusAccentColor("experimento", exp.status)}`,
      }}
      onClick={() => onOpen(exp.id)}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <SelectCheckbox
          checked={selected}
          onToggle={() => onToggleSelect(exp.id)}
          ariaLabel={`Selecionar ${exp.name}`}
        />
      </td>
      {orderedCols.map((col) => (
        <td key={col.key} className="px-4 py-3" style={{ overflow: "hidden" }}>
          {renderExperimentoCell(col.key, exp, quarterId)}
        </td>
      ))}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <Link
            href={`/experimentos/${exp.id}`}
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
              onEdit(exp);
            }}
            title="Editar"
            aria-label="Editar"
          >
            <Pencil size={13} />
          </IconButton>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onDelete(exp);
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

type ExperimentoScores = { impactScore: number; confidenceScore: number; effortScore: number };

function comScores(exp: ExperimentoItem, scores: ExperimentoScores | undefined): ExperimentoItem {
  if (!scores) return exp;
  const iceScore = calculateICEScore(scores.impactScore, scores.confidenceScore, scores.effortScore);
  return { ...exp, ...scores, iceScore, iceAction: getICEAction(iceScore) };
}

export function ExperimentoTable({
  quarters,
  frentes,
  members,
  okrs,
  experimentos,
  selectedQuarterId,
  currentStatuses,
  currentFrenteIds,
  currentMemberIds,
  currentIceActions,
  currentQuery = "",
  hideOtherQuarters = true,
  userEmail,
  canEdit = true,
}: ExperimentoTableProps) {
  const router = useRouter();
  const [localHideOthers, setLocalHideOthers] = useState(hideOtherQuarters);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ExperimentoItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  const [sortKey, setSortKey] = useState<SortKey>("iceScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editingScore, setEditingScore] = useState<{
    expId: string;
    field: "impact" | "confidence" | "effort";
  } | null>(null);

  // Seleção em massa (apenas na view "lista").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ text: string; tone: "info" | "error" } | null>(null);

  // Column preferences (lista view only)
  const prefs = useTablePreferences("experimentos", userEmail, DEFAULT_ORDER, DEFAULT_WIDTHS);
  const [resizingColKey, setResizingColKey] = useState<string | null>(null);
  const effectiveWidths = prefs.widths;
  const tableRef = useRef<HTMLTableElement>(null);

  // DnD state
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  useEffect(() => {
    // Mount guard: defer client-only UI (DnD, persisted view) until after
    // hydration. setState-in-effect é intencional aqui — só roda uma vez.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const saved = localStorage.getItem("experimentos-view-mode");
    if (saved === "lista" || saved === "kanban" || saved === "analise") {
      setViewMode(saved);
    }
  }, []);

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

  useEffect(() => {
    if (!editingScore) return;
    function close() {
      setEditingScore(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [editingScore]);

  // Memoizado: vai como prop para cada linha (memo); um array novo a cada
  // render derrubaria o memo de todas.
  const orderedCols = useMemo(
    () => prefs.order.map((key) => EXP_COLS.find((c) => c.key === key)).filter(Boolean) as ColDef[],
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

  // Notas I/C/E editadas na visão Análise aparecem na hora, com o ICE
  // recalculado (mesma conta do servidor, lib/ice). O otimista vale até a
  // transição terminar — já com a página re-renderizada pela action — e some
  // sozinho se ela falhar, voltando ao valor salvo.
  const [scoresOtimistas, aplicarScoreOtimista] = useOptimistic(
    {} as Record<string, ExperimentoScores>,
    (atual, { id, scores }: { id: string; scores: ExperimentoScores }) => ({ ...atual, [id]: scores })
  );

  function handleScoreEdit(
    expId: string,
    field: "impact" | "confidence" | "effort",
    newValue: number,
    // Já com o otimista aplicado: duas notas editadas em seguida não podem
    // mandar o valor antigo da primeira.
    exp: ExperimentoItem
  ) {
    setEditingScore(null);
    const scores = {
      impactScore: field === "impact" ? newValue : exp.impactScore,
      confidenceScore: field === "confidence" ? newValue : exp.confidenceScore,
      effortScore: field === "effort" ? newValue : exp.effortScore,
    };
    startTransition(async () => {
      aplicarScoreOtimista({ id: expId, scores });
      const res = await updateExperimentoScores(expId, scores);
      if (!res.success) toast(res.error ?? "Erro ao atualizar os scores.", "error");
    });
  }

  // Remove da seleção ids que sumiram da lista (mudança de filtro/quarter).
  // Sincroniza estado local com uma prop externa — uso legítimo de efeito.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(experimentos.map((e) => e.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => (valid.has(id) ? next.add(id) : (changed = true)));
      return changed ? next : prev;
    });
  }, [experimentos]);

  // Sair da view lista descarta seleção e mensagem.
  useEffect(() => {
    if (viewMode !== "lista") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(new Set());
      setBulkMsg(null);
    }
  }, [viewMode]);

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
    const res = await bulkUpdateExperimentos(ids, patch);
    setBulkBusy(false);
    if (!res.success) {
      setBulkMsg({ text: res.error, tone: "error" });
      return;
    }
    if (res.data.skipped > 0) {
      setBulkMsg({
        text: `${res.data.updated} atualizado${res.data.updated !== 1 ? "s" : ""}, ${res.data.skipped} sem permissão para editar.`,
        tone: "info",
      });
    } else {
      setBulkMsg(null);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "iceScore" ? "desc" : "asc");
    }
  }

  function handleViewChange(val: ViewMode) {
    setViewMode(val);
    localStorage.setItem("experimentos-view-mode", val);
  }

  const activeQuarter = quarters.find((q) => q.isActive);
  const effectiveQuarterId = selectedQuarterId || activeQuarter?.id || "";

  const baseParams = {
    quarter: effectiveQuarterId,
    status: currentStatuses,
    frente: currentFrenteIds,
    member: currentMemberIds,
    iceAction: currentIceActions,
    outros: localHideOthers ? "" : "1",
    q: currentQuery,
  };

  function openCreate() {
    setEditTarget(null);
    setShowForm(true);
  }

  const openEdit = useCallback((exp: ExperimentoItem) => {
    setEditTarget(exp);
    setShowForm(true);
  }, []);

  const openDetail = useCallback((id: string) => router.push(`/experimentos/${id}`), [router]);
  const requestDelete = useCallback(
    (exp: ExperimentoItem) => setDeleteTarget({ id: exp.id, name: exp.name }),
    []
  );

  function handleSuccess() {
    setShowForm(false);
    setEditTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    await deleteExperimento(id);
  }

  function setStatuses(next: string[]) {
    router.push(buildUrl(baseParams, { status: next, quarter: effectiveQuarterId }));
  }

  function setFrentes(next: string[]) {
    router.push(buildUrl(baseParams, { frente: next, quarter: effectiveQuarterId }));
  }

  function setIceActions(next: string[]) {
    router.push(buildUrl(baseParams, { iceAction: next, quarter: effectiveQuarterId }));
  }

  function setMembers(next: string[]) {
    router.push(buildUrl(baseParams, { member: next, quarter: effectiveQuarterId }));
  }

  function clearFilters() {
    router.push(
      buildUrl({ quarter: effectiveQuarterId }, localHideOthers ? {} : { outros: "1" })
    );
  }

  function toggleHideOthers() {
    const next = !localHideOthers;
    setLocalHideOthers(next);
    router.push(buildUrl(baseParams, { outros: next ? "" : "1", quarter: effectiveQuarterId }));
  }

  const hasFilters =
    currentStatuses.length > 0 ||
    currentFrenteIds.length > 0 ||
    currentMemberIds.length > 0 ||
    currentIceActions.length > 0 ||
    currentQuery.length > 0;

  // Toggle "Outros quarters": o servidor já traz experimentos em aberto de
  // outros quarters; quando ativo, restringe a visão ao quarter selecionado.
  const visibleExperimentos = localHideOthers
    ? experimentos.filter((e) => e.quarterId === effectiveQuarterId)
    : experimentos;

  const sorted = [...visibleExperimentos].sort((a, b) => {
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
        // Pelo primeiro responsável — a lista já vem alfabética do servidor.
        valA = (a.members[0]?.name ?? "").toLowerCase();
        valB = (b.members[0]?.name ?? "").toLowerCase();
        break;
      case "status":
        valA = a.status;
        valB = b.status;
        break;
      case "iceScore":
        valA = a.iceScore;
        valB = b.iceScore;
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

  // Segmenta os experimentos por frente: um grupo por frente, ordenados
  // alfabeticamente; a ordenação das colunas continua valendo dentro de cada grupo.
  const groupedByFrente = (() => {
    const map = new Map<string, { frenteId: string; frenteName: string; items: typeof sorted }>();
    for (const exp of sorted) {
      let group = map.get(exp.frenteId);
      if (!group) {
        group = { frenteId: exp.frenteId, frenteName: exp.frente.name, items: [] };
        map.set(exp.frenteId, group);
      }
      group.items.push(exp);
    }
    return [...map.values()].sort((a, b) =>
      a.frenteName.localeCompare(b.frenteName, "pt-BR")
    );
  })();

  const ANALISE_EXCLUDED = ["RELATORIO_PRONTO", "RESULTADOS_APRESENTADOS", "AGUARDANDO_RESULTADOS"];
  const analiseFiltered =
    viewMode === "analise"
      ? [...visibleExperimentos]
          .filter((e) => !ANALISE_EXCLUDED.includes(e.status))
          .map((e) => comScores(e, scoresOtimistas[e.id]))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      : sorted;

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
            Experimentos
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Priorize experimentos com base no ICE Score
          </p>
          {effectiveQuarterId && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {localHideOthers
                ? "Mostrando apenas experimentos deste quarter"
                : "Mostrando itens do quarter + experimentos em aberto de outros quarters"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {/* O quarter mora na barra de filtros, como no /roadmap e nos OKRs. */}
          {mounted && <ViewToggle value={viewMode} onChange={handleViewChange} />}

          <ExportCsvButton
            nomeBase="Experimentos"
            disabled={sorted.length === 0}
            colunas={["Nome", "Status", "Frente", "Responsáveis", "Quarter", "Início", "Fim", "Impacto", "Confiança", "Esforço", "ICE", "Ação ICE", "Resultado", "Objetivo", "Descrição", "OKR", "Link do documento"]}
            // O que está na tela: já filtrado (inclusive pela busca) e ordenado.
            linhas={() =>
              sorted.map((e) => [
                e.name,
                getStatusMeta("experimento", e.status).label,
                e.frente.name,
                e.members.map((m) => m.name).join(", "),
                `Q${e.quarter.quarter} ${e.quarter.year}`,
                diaPtBr(e.startDate),
                diaPtBr(e.endDate),
                e.impactScore,
                e.confidenceScore,
                e.effortScore,
                e.iceScore,
                ICE_ACTION_OPTIONS.find((a) => a.value === e.iceAction)?.label ?? e.iceAction,
                e.resultado ? (RESULTADO_CONFIG[e.resultado]?.label ?? e.resultado) : "",
                e.objective,
                e.description,
                e.okr?.objective ?? "",
                e.docLink ?? "",
              ])
            }
          />

          <Button variant="primary" size="md" onClick={openCreate}>
            <FlaskConical size={16} />
            Novo Experimento
          </Button>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────── */}
      {/* Mesmo desenho da barra de /iniciativas: uma linha só, status em pills
          à esquerda e o resto em MultiSelect encostado à direita. Antes eram
          três blocos rotulados (Frente, Ação ICE, Status), que davam ao card o
          dobro da altura e um espaçamento próprio. */}
      <Card className="flex flex-wrap gap-4 items-center mb-6" padding="12px 16px">
        <div className="flex gap-2 flex-wrap items-center ml-auto">
          {/* Quarter com o mesmo componente dos vizinhos. Obrigatório: clicar
              no já escolhido só fecha o menu (o `single` limparia). Trocar de
              quarter zera os outros filtros, como antes. */}
          <MultiSelect
            single
            label="Quarter"
            selected={effectiveQuarterId ? [effectiveQuarterId] : []}
            onChange={(next) => {
              if (next[0])
                router.push(
                  buildUrl(
                    { ...baseParams, status: null, frente: null, member: null, iceAction: null },
                    { quarter: next[0] }
                  )
                );
            }}
            options={quarters.map((q) => ({
              value: q.id,
              label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
            }))}
          />

          <SearchField
            value={currentQuery}
            onSearch={(q) => router.replace(buildUrl(baseParams, { q, quarter: effectiveQuarterId }))}
            placeholder="Buscar experimento…"
            label="Buscar experimento por nome, objetivo ou descrição"
          />

          <MultiSelect
            label="Status"
            selected={currentStatuses}
            onChange={setStatuses}
            options={EXPERIMENTO_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          />

          <MultiSelect
            label="Frentes"
            selected={currentFrenteIds}
            onChange={setFrentes}
            options={activeFrentes.map((f) => ({ value: f.id, label: f.name }))}
          />

          <MultiSelect
            label="Membros"
            selected={currentMemberIds}
            onChange={setMembers}
            options={activeMembers.map((m) => ({ value: m.id, label: m.name }))}
          />

          <MultiSelect
            label="Ação ICE"
            selected={currentIceActions}
            onChange={setIceActions}
            options={ICE_ACTION_OPTIONS.map((a) => ({ value: a.value, label: a.label }))}
          />

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs underline"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Limpar
            </button>
          )}

          {/* Ocultar experimentos em aberto de outros quarters */}
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
                : "Ocultar experimentos em aberto de outros quarters"
            }
          >
            {localHideOthers ? <EyeOff size={13} /> : <Eye size={13} />}
            Outros quarters
          </button>
        </div>
      </Card>

      {/* ── Content ──────────────────────────────────── */}
      {sorted.length === 0 ? (
        <Card padding={0}>
          <EmptyState
            icon={FlaskConical}
            // Com filtro ativo a lista vazia é "nenhum resultado", não "não existe
            // nada" (ver IniciativaTable).
            title={hasFilters ? "Nenhum experimento com esses filtros" : "Nenhum experimento ainda"}
            description={
              hasFilters
                ? "Ajuste ou limpe os filtros para ver os experimentos"
                : "Crie seu primeiro experimento e priorize com base no ICE Score"
            }
            action={
              hasFilters
                ? { label: "Limpar filtros", onClick: clearFilters }
                : { label: "Criar Experimento", onClick: openCreate }
            }
          />
        </Card>
      ) : (
        <>
          {!mounted ? (
            // Antes da hidratação: skeleton neutro (sem DnD) pra SSR e primeiro
            // render do cliente baterem — evita mismatch de aria do dnd-kit.
            <Card className="overflow-hidden" padding={0} style={{ minHeight: 320 }} />
          ) : viewMode === "lista" ? (
            <>
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
                              checked={sorted.length > 0 && sorted.every((e) => selectedIds.has(e.id))}
                              indeterminate={
                                sorted.some((e) => selectedIds.has(e.id)) &&
                                !sorted.every((e) => selectedIds.has(e.id))
                              }
                              onToggle={() => toggleSelectAll(sorted.map((e) => e.id))}
                              ariaLabel="Selecionar todos"
                              title="Selecionar todos"
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
                          <th className="px-4 py-3" style={{ width: ACTIONS_COL_WIDTH }} />
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
                          {group.items.map((exp, idx) => (
                            <ExperimentoRow
                              key={exp.id}
                              exp={exp}
                              isLast={idx === group.items.length - 1}
                              selected={selectedIds.has(exp.id)}
                              orderedCols={orderedCols}
                              quarterId={effectiveQuarterId}
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
                        {EXP_COLS.find((c) => c.key === activeColId)?.label}
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
              <div
                className="px-4 py-2 text-xs"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                {sorted.length} experimento{sorted.length !== 1 ? "s" : ""}
              </div>
            </Card>
            <BulkEditBar
              count={selectedIds.size}
              statusOptions={EXPERIMENTO_STATUS_OPTIONS}
              quarters={quarters}
              members={activeMembers}
              okrs={okrs}
              onApply={handleBulkApply}
              onClear={clearSelection}
              busy={bulkBusy}
              message={bulkMsg?.text ?? null}
              messageTone={bulkMsg?.tone}
            />
            </>
          ) : viewMode === "analise" ? (
            <div className="flex flex-col gap-3">
              {analiseFiltered.length === 0 ? (
                <Card padding={0}>
                  <EmptyState
                    icon={BarChart2}
                    title="Nenhum experimento para análise"
                    description="Nenhum experimento para análise com os filtros atuais."
                  />
                </Card>
              ) : (
                <>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {analiseFiltered.length} experimento
                    {analiseFiltered.length !== 1 ? "s" : ""} · excluindo Concluídos e Aguardando
                    Resultados
                  </p>
                  {(() => {
                    const grouped = new Map<string, typeof analiseFiltered>();
                    for (const exp of analiseFiltered) {
                      const key = exp.frente.name;
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(exp);
                    }
                    return Array.from(grouped.entries()).map(([frenteName, items]) => (
                      <div key={frenteName} className="flex flex-col gap-3">
                        <p
                          className="text-xs font-semibold uppercase tracking-widest"
                          style={{ color: "var(--text-muted)", paddingLeft: 2 }}
                        >
                          {frenteName}
                        </p>
                        {items.map((exp) => (
                          <Card
                            key={exp.id}
                            interactive
                            className="flex gap-5 items-start"
                            padding="20px 24px"
                            style={{
                              borderLeft: `4px solid ${getStatusAccentColor(
                                "experimento",
                                exp.status
                              )}`,
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <Link
                                  href={`/experimentos/${exp.id}`}
                                  className="text-base font-semibold leading-snug hover:underline"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {exp.name}
                                </Link>
                                <ICEBadge action={exp.iceAction} iceScore={exp.iceScore} />
                              </div>
                              <p
                                className="text-xs mb-2 leading-snug"
                                style={{ color: "var(--text-muted)" }}
                              >
                                <span style={{ fontWeight: 500 }}>Objetivo:</span> {exp.objective}
                              </p>
                              <p
                                className="text-sm leading-relaxed line-clamp-2"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {exp.description}
                              </p>
                            </div>

                            <div
                              className="flex shrink-0 overflow-hidden"
                              style={{
                                background: "var(--bg-app)",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-subtle)",
                                width: 200,
                              }}
                            >
                              {(
                                [
                                  {
                                    label: "Impacto",
                                    short: "I",
                                    value: exp.impactScore,
                                    field: "impact",
                                  },
                                  {
                                    label: "Confiança",
                                    short: "C",
                                    value: exp.confidenceScore,
                                    field: "confidence",
                                  },
                                  {
                                    label: "Esforço",
                                    short: "E",
                                    value: exp.effortScore,
                                    field: "effort",
                                  },
                                ] as {
                                  label: string;
                                  short: string;
                                  value: number;
                                  field: "impact" | "confidence" | "effort";
                                }[]
                              ).map(({ label, short, value, field }, idx) => {
                                const isEditing =
                                  editingScore?.expId === exp.id &&
                                  editingScore?.field === field;
                                return (
                                  <div
                                    key={short}
                                    className="flex-1 flex flex-col items-center justify-center py-3"
                                    style={{
                                      borderLeft:
                                        idx > 0
                                          ? "1px solid var(--border-subtle)"
                                          : undefined,
                                    }}
                                    data-tooltip={label}
                                  >
                                    <span
                                      className="text-xs font-semibold uppercase tracking-wider mb-1"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {short}
                                    </span>
                                    {isEditing ? (
                                      <div
                                        className="flex flex-col gap-0.5"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {[1, 2, 3, 4, 5].map((n) => (
                                          <button
                                            key={n}
                                            onClick={() =>
                                              handleScoreEdit(exp.id, field, n, exp)
                                            }
                                            className="w-6 h-5 text-xs flex items-center justify-center transition-colors"
                                            style={{
                                              background:
                                                n === value
                                                  ? "var(--brand-primary)"
                                                  : "var(--bg-surface)",
                                              color:
                                                n === value ? "white" : "var(--text-secondary)",
                                              borderRadius: "var(--radius-sm)",
                                              border: `1px solid ${
                                                n === value
                                                  ? "var(--brand-primary)"
                                                  : "var(--border-subtle)"
                                              }`,
                                              cursor: "pointer",
                                              fontWeight: n === value ? 700 : 400,
                                            }}
                                          >
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingScore({ expId: exp.id, field });
                                        }}
                                        className="text-sm font-semibold flex items-center gap-0.5 group"
                                        style={{
                                          color: "var(--text-primary)",
                                          background: "none",
                                          border: "none",
                                          cursor: "pointer",
                                          padding: 0,
                                        }}
                                        data-tooltip={`Editar ${label}`}
                                      >
                                        {value % 1 === 0 ? value : value.toFixed(1)}
                                        <Pencil
                                          size={9}
                                          style={{ opacity: 0, transition: "opacity 0.15s" }}
                                          className="group-hover:opacity-50"
                                        />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </Card>
                        ))}
                      </div>
                    ));
                  })()}
                </>
              )}
            </div>
          ) : (
            <ExperimentosKanban
              experimentos={sorted}
              acaoIceFilter={currentIceActions}
              onSetListView={() => handleViewChange("lista")}
              quarters={quarters}
              frentes={frentes}
              members={members}
              okrs={okrs}
              canEdit={canEdit}
            />
          )}
        </>
      )}

      {/* Modal form */}
      {showForm && (
        <ExperimentoForm
          mode={editTarget ? "edit" : "create"}
          experimento={editTarget ?? undefined}
          quarters={quarters}
          frentes={frentes}
          members={members}
          initialOkrs={okrs}
          selectedQuarterId={effectiveQuarterId}
          onSuccess={handleSuccess}
          onCancel={() => {
            setShowForm(false);
            setEditTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir experimento"
          message={`Excluir "${deleteTarget.name}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
