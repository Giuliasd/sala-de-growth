"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Table2, GanttChartSquare, ClipboardList } from "lucide-react";
import { updateIniciativaDates } from "@/actions/iniciativas";
import { GanttTimeline } from "./GanttTimeline";
import { GanttBar } from "./GanttBar";
import { GanttTooltip, type TooltipIniciativa } from "./GanttTooltip";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getAusenciaBarStyle } from "@/components/shared/AusenciaTypeBadge";
import { PRIORITY_OPTIONS } from "@/components/shared/PriorityBadge";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { formatMemberNames, formatMemberFirstNames } from "@/components/shared/MemberChips";
import { QuarterDropdown } from "@/components/shared/QuarterSelector";
import dynamic from "next/dynamic";
import { useEstadoDaProp } from "@/hooks/useEstadoDaProp";

// Formulário só abre sob demanda (modal): fica fora do bundle inicial da tela.
const IniciativaForm = dynamic(
  () => import("@/components/iniciativas/IniciativaForm").then((m) => ({ default: m.IniciativaForm })),
  { ssr: false }
);

// ─── Constants ────────────────────────────────────────────────────
const PX_PER_DAY = 14;
const LABEL_W = 220; // px — sticky left column
const ROW_H = 44;    // px — each row

// ─── Date helpers (UTC-safe) ──────────────────────────────────────
function toUTC(date: Date | string | null): Date | null {
  if (!date) return null;
  const d = new Date(date as any);
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

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function fmtShort(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", timeZone: "UTC",
  });
}

// ─── Types ────────────────────────────────────────────────────────
type QuarterItem = {
  id: string; year: number; quarter: number;
  startDate: Date | string; endDate: Date | string; isActive: boolean;
};
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };

export type GanttIniciativa = {
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

type AusenciaItem = {
  id: string; type: string;
  startDate: Date | string; endDate: Date | string;
  notes: string | null;
  member: { id: string; name: string };
};

interface GanttChartProps {
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  iniciativas: GanttIniciativa[];
  ausencias: AusenciaItem[];
  selectedQuarterId: string | null;
  currentFrenteIds: string[];
  currentMemberIds: string[];
  currentPriorities: string[];
  currentView: "table" | "gantt";
}

// ─── Drag state (stored in refs to avoid stale closure issues) ────
interface DragRef {
  id: string;
  type: "move" | "left" | "right";
  startX: number;
  initStart: Date;
  initEnd: Date;
}

interface LivePos {
  id: string;
  startDate: Date;
  endDate: Date;
}

// ─── Absence type labels ──────────────────────────────────────────
const AUSENCIA_LABELS: Record<string, string> = {
  FERIAS: "Férias",
  LICENCA_MEDICA: "Licença Médica",
  LICENCA_MATERNIDADE: "Licença Maternidade",
  DAY_OFF: "Day Off",
  OUTROS: "Outros",
};

export function GanttChart({
  quarters,
  frentes,
  members,
  iniciativas,
  ausencias,
  selectedQuarterId,
  currentFrenteIds,
  currentMemberIds,
  currentPriorities,
  currentView,
}: GanttChartProps) {
  const router = useRouter();

  // ── Local copies for optimistic updates ────────────────────────
  const [localIni, setLocalIni] = useEstadoDaProp<GanttIniciativa[]>(iniciativas);

  // ── Filters (mirrored locally for instant feedback) ─────────────
  const activeQ = quarters.find((q) => q.isActive);
  const [localQuarterId, setLocalQuarterId] = useState(selectedQuarterId ?? activeQ?.id ?? "");
  const [localFrenteIds, setLocalFrenteIds] = useState(currentFrenteIds);
  const [localMemberIds, setLocalMemberIds] = useState(currentMemberIds);
  const [localPriorities, setLocalPriorities] = useState(currentPriorities);

  // ── Drag state via refs ─────────────────────────────────────────
  const dragRef = useRef<DragRef | null>(null);
  const livePosRef = useRef<LivePos | null>(null);
  const [livePos, setLivePos] = useState<LivePos | null>(null);

  // ── Tooltip / edit state ────────────────────────────────────────
  const [tooltip, setTooltip] = useState<GanttIniciativa | null>(null);
  const [editTarget, setEditTarget] = useState<GanttIniciativa | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ── Collapsed frente groups ─────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // ── Drag handlers ───────────────────────────────────────────────
  const calcLivePos = useCallback((clientX: number): LivePos | null => {
    const drag = dragRef.current;
    if (!drag) return null;
    const deltaX = clientX - drag.startX;
    const deltaDays = Math.round(deltaX / PX_PER_DAY);

    let newStart = new Date(drag.initStart);
    let newEnd = new Date(drag.initEnd);

    if (drag.type === "move") {
      newStart = addDays(drag.initStart, deltaDays);
      newEnd = addDays(drag.initEnd, deltaDays);
    } else if (drag.type === "left") {
      newStart = addDays(drag.initStart, deltaDays);
      if (newStart >= drag.initEnd) newStart = addDays(drag.initEnd, -1);
    } else {
      newEnd = addDays(drag.initEnd, deltaDays);
      if (newEnd <= drag.initStart) newEnd = addDays(drag.initStart, 1);
    }

    return { id: drag.id, startDate: newStart, endDate: newEnd };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const pos = calcLivePos(e.clientX);
      if (!pos) return;
      // A prévia só muda quando o arraste cruza um dia: sem esta checagem, cada
      // pixel de mouse re-renderizava o Gantt inteiro.
      const prev = livePosRef.current;
      if (
        prev &&
        prev.id === pos.id &&
        prev.startDate.getTime() === pos.startDate.getTime() &&
        prev.endDate.getTime() === pos.endDate.getTime()
      ) return;
      livePosRef.current = pos;
      setLivePos(pos);
    };

    const onUp = () => {
      const pos = livePosRef.current;
      if (pos) {
        setLocalIni((prev) =>
          prev.map((ini) =>
            ini.id === pos.id
              ? { ...ini, startDate: pos.startDate, endDate: pos.endDate }
              : ini
          )
        );
        updateIniciativaDates(pos.id, toDateStr(pos.startDate), toDateStr(pos.endDate));
      }
      dragRef.current = null;
      livePosRef.current = null;
      setLivePos(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [calcLivePos, setLocalIni]);

  function startDrag(
    e: React.MouseEvent,
    ini: GanttIniciativa,
    type: "move" | "left" | "right"
  ) {
    e.preventDefault();
    const s = toUTC(ini.startDate);
    const en = toUTC(ini.endDate);
    if (!s || !en) return;
    dragRef.current = { id: ini.id, type, startX: e.clientX, initStart: s, initEnd: en };
  }

  // ── URL builder ─────────────────────────────────────────────────
  function buildUrl(
    overrides: Partial<
      Record<"quarter" | "view", string> & Record<"frente" | "member" | "priority", string[]>
    >
  ) {
    const vals = {
      quarter: localQuarterId,
      frente: localFrenteIds,
      member: localMemberIds,
      priority: localPriorities,
      view: currentView === "gantt" ? "gantt" : "",
      ...overrides,
    };
    const p = new URLSearchParams();
    const setMulti = (key: string, list: string[]) => {
      const joined = list.filter(Boolean).join(",");
      if (joined) p.set(key, joined);
    };
    if (vals.quarter) p.set("quarter", vals.quarter);
    setMulti("frente", vals.frente);
    setMulti("member", vals.member);
    setMulti("priority", vals.priority);
    if (vals.view) p.set("view", vals.view);
    return `/iniciativas?${p.toString()}`;
  }

  function changeQuarter(id: string) {
    setLocalQuarterId(id);
    setLocalFrenteIds([]);
    setLocalMemberIds([]);
    setLocalPriorities([]);
    router.push(buildUrl({ quarter: id, frente: [], member: [], priority: [] }));
  }

  function handleFrenteChange(ids: string[]) {
    setLocalFrenteIds(ids);
    router.push(buildUrl({ frente: ids }));
  }

  function handleMemberChange(ids: string[]) {
    setLocalMemberIds(ids);
    router.push(buildUrl({ member: ids }));
  }

  function handlePriorityChange(priorities: string[]) {
    setLocalPriorities(priorities);
    router.push(buildUrl({ priority: priorities }));
  }

  // ── Quarter geometry ────────────────────────────────────────────
  const selectedQuarter = quarters.find((q) => q.id === localQuarterId);
  const quarterStart = selectedQuarter ? toUTC(selectedQuarter.startDate)! : null;
  const quarterEnd = selectedQuarter ? toUTC(selectedQuarter.endDate)! : null;
  const totalDays = quarterStart && quarterEnd ? diffDays(quarterEnd, quarterStart) + 1 : 0;
  const ganttWidth = totalDays * PX_PER_DAY;

  // Today line
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayX =
    quarterStart && todayUTC >= quarterStart && todayUTC <= quarterEnd!
      ? diffDays(todayUTC, quarterStart) * PX_PER_DAY
      : null;

  // ── Group by frente ─────────────────────────────────────────────
  const groups: { frenteId: string; frenteName: string; items: GanttIniciativa[] }[] = [];
  const frenteMap = new Map<string, { frenteName: string; items: GanttIniciativa[] }>();
  for (const ini of localIni) {
    if (!frenteMap.has(ini.frenteId)) {
      frenteMap.set(ini.frenteId, { frenteName: ini.frente.name, items: [] });
    }
    frenteMap.get(ini.frenteId)!.items.push(ini);
  }
  frenteMap.forEach(({ frenteName, items }, frenteId) => {
    groups.push({ frenteId, frenteName, items });
  });
  groups.sort((a, b) => a.frenteName.localeCompare(b.frenteName));

  // ── Absence bands (vertical) ────────────────────────────────────
  const absenceBands =
    quarterStart && quarterEnd
      ? ausencias.map((a) => {
          const s = toUTC(a.startDate)!;
          const e = toUTC(a.endDate)!;
          const clampedStart = s < quarterStart ? quarterStart : s;
          const clampedEnd = e > quarterEnd ? quarterEnd : e;
          const leftPx = diffDays(clampedStart, quarterStart) * PX_PER_DAY;
          const widthPx = (diffDays(clampedEnd, clampedStart) + 1) * PX_PER_DAY;
          return { ...a, leftPx, widthPx };
        })
      : [];

  // ── Bar position helpers ────────────────────────────────────────
  function barGeometry(ini: GanttIniciativa) {
    if (!quarterStart) return null;
    const isLive = livePos?.id === ini.id;
    const s = toUTC(isLive ? livePos!.startDate : ini.startDate);
    const e = toUTC(isLive ? livePos!.endDate : ini.endDate);
    if (!s || !e) return null;
    const leftPx = diffDays(s, quarterStart) * PX_PER_DAY;
    const widthPx = Math.max((diffDays(e, s) + 1) * PX_PER_DAY, PX_PER_DAY);
    return { leftPx, widthPx, isLive };
  }

  // ── Total row count for absence band height ─────────────────────
  const visibleRows = groups.reduce(
    (sum, g) => sum + 1 + (collapsed.has(g.frenteId) ? 0 : g.items.length),
    0
  );
  const gridHeight = visibleRows * ROW_H;

  // ── Edit form helpers ───────────────────────────────────────────
  function openEdit(ini: GanttIniciativa) {
    setTooltip(null);
    setEditTarget(ini);
    setShowForm(true);
  }

  const activeFrentes = frentes.filter((f) => f.isActive);
  const activeMembers = members.filter((m) => m.isActive);

  if (!localQuarterId || !selectedQuarter) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Iniciativas</h1>
          <div className="flex items-center gap-3">
            <QuarterDropdown quarters={quarters} value={localQuarterId} onChange={changeQuarter} />
            <ViewToggle currentView={currentView} ganttUrl={buildUrl({ view: "gantt" })} tableUrl={buildUrl({ view: "" })} />
          </div>
        </div>
        <Card padding={0}>
          <EmptyState
            icon={ClipboardList}
            title="Selecione um quarter"
            description="Escolha um quarter para visualizar o Gantt"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Iniciativas</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Q{selectedQuarter.quarter} {selectedQuarter.year} ·{" "}
            {fmtShort(selectedQuarter.startDate)} – {fmtShort(selectedQuarter.endDate)}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Mostrando itens do quarter + iniciativas em aberto de outros quarters
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Quarter com o mesmo componente dos filtros ao lado (como na
              tabela). Obrigatório: clicar no já escolhido só fecha o menu. */}
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
          {/* Frente filter */}
          <MultiSelect
            label="Frentes"
            selected={localFrenteIds}
            onChange={handleFrenteChange}
            options={activeFrentes.map((f) => ({ value: f.id, label: f.name }))}
          />
          {/* Member filter */}
          <MultiSelect
            label="Membros"
            selected={localMemberIds}
            onChange={handleMemberChange}
            options={activeMembers.map((m) => ({ value: m.id, label: m.name }))}
          />
          {/* Priority filter */}
          <MultiSelect
            label="Prioridades"
            selected={localPriorities}
            onChange={handlePriorityChange}
            options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
          />

          <ViewToggle currentView={currentView} ganttUrl={buildUrl({ view: "gantt" })} tableUrl={buildUrl({ view: "" })} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: "var(--brand-primary)", opacity: 0.7 }}
          />
          Hoje
        </span>
        <span className="flex items-center gap-1.5">
          {/* Mesmo desenho da legenda do calendário de checkpoints. */}
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{
              background: getAusenciaBarStyle("FERIAS").bg,
              borderLeft: `2px solid ${getAusenciaBarStyle("FERIAS").color}`,
            }}
          />
          Ausência
        </span>
        <span style={{ color: "var(--border-default)" }}>
          Arraste as barras para mover · bordas para redimensionar
        </span>
      </div>

      {/* Gantt container */}
      <Card className="overflow-hidden" padding={0}>
        <div className="overflow-x-auto" style={{ cursor: livePos ? "grabbing" : "default" }}>
          <div style={{ minWidth: LABEL_W + ganttWidth }}>

            {/* ── Timeline header ────────────────────────────── */}
            <div className="flex sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-app)" }}>
              {/* Label column header */}
              <div
                className="sticky left-0 z-40 shrink-0 flex items-end px-3 pb-1"
                style={{ width: LABEL_W, minWidth: LABEL_W, background: "var(--bg-app)", borderRight: "1px solid var(--border-subtle)" }}
              >
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Iniciativa</span>
              </div>
              {/* Timeline */}
              <GanttTimeline
                rangeStart={quarterStart!}
                rangeEnd={quarterEnd!}
                pixelsPerDay={PX_PER_DAY}
                totalDays={totalDays}
              />
            </div>

            {/* ── Rows ──────────────────────────────────────── */}
            <div className="relative">
              {/* Absence bands (absolute, span full grid height) */}
              {absenceBands.map((band, i) => (
                <div
                  key={i}
                  // Cor por TIPO, como no calendário de checkpoints e no
                  // roadmap de /ausencias: férias, day off e licença se
                  // reconhecem pela cor sem precisar do tooltip. Antes eram
                  // todas butter, o que também colidia com a linha de "hoje".
                  className="absolute top-0 bottom-0 border-l-2 opacity-40 pointer-events-none z-0"
                  style={{
                    left: LABEL_W + band.leftPx,
                    width: band.widthPx,
                    background: getAusenciaBarStyle(band.type).bg,
                    borderLeftColor: getAusenciaBarStyle(band.type).color,
                  }}
                  data-tooltip={`${band.member.name} — ${AUSENCIA_LABELS[band.type] ?? band.type}: ${fmtShort(band.startDate)} – ${fmtShort(band.endDate)}`}
                />
              ))}

              {/* Today line */}
              {todayX !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20"
                  style={{ left: LABEL_W + todayX, background: "var(--brand-primary)", opacity: 0.7 }}
                />
              )}

              {localIni.length === 0 && (
                <div className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Nenhuma iniciativa neste quarter.
                </div>
              )}

              {groups.map(({ frenteId, frenteName, items }) => (
                <div key={frenteId}>
                  {/* Frente header row */}
                  <div
                    className="flex cursor-pointer select-none"
                    style={{ height: ROW_H, background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        next.has(frenteId) ? next.delete(frenteId) : next.add(frenteId);
                        return next;
                      })
                    }
                  >
                    <div
                      className="sticky left-0 z-10 flex items-center gap-2 px-3 shrink-0"
                      style={{ width: LABEL_W, minWidth: LABEL_W, background: "var(--bg-app)", borderRight: "1px solid var(--border-subtle)" }}
                    >
                      <span
                        className="text-xs font-semibold uppercase tracking-wide truncate"
                        style={{ color: "var(--brand-primary)" }}
                      >
                        {frenteName}
                      </span>
                      <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                        {collapsed.has(frenteId) ? "▶" : "▼"} {items.length}
                      </span>
                    </div>
                    {/* Empty grid area for frente row */}
                    <div style={{ width: ganttWidth }} />
                  </div>

                  {/* Initiative rows */}
                  {!collapsed.has(frenteId) &&
                    items.map((ini) => {
                      const geo = barGeometry(ini);
                      const hasBar = geo !== null;
                      const isLive = livePos?.id === ini.id;

                      return (
                        <div
                          key={ini.id}
                          className="flex transition-colors"
                          style={{ height: ROW_H, borderBottom: "1px solid var(--border-subtle)" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-app)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          {/* Sticky label */}
                          <div
                            className="sticky left-0 z-10 flex items-center gap-2 px-3 shrink-0"
                            style={{ width: LABEL_W, minWidth: LABEL_W, background: "var(--bg-surface)", borderRight: "1px solid var(--border-subtle)" }}
                          >
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-xs font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                                data-tooltip={ini.name}
                              >
                                {ini.name}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span
                                  className="text-xs truncate"
                                  style={{ color: "var(--text-muted)" }}
                                  data-tooltip={formatMemberNames(ini.members)}
                                >
                                  {formatMemberFirstNames(ini.members)}
                                </span>
                              </div>
                            </div>
                            <StatusBadge status={ini.status} type="iniciativa" itemId={ini.id} />
                          </div>

                          {/* Bar area */}
                          <div
                            className="relative"
                            style={{ width: ganttWidth }}
                          >
                            {hasBar ? (
                              <GanttBar
                                id={ini.id}
                                name={ini.name}
                                status={ini.status}
                                leftPx={geo!.leftPx}
                                widthPx={geo!.widthPx}
                                rowHeight={ROW_H}
                                isLive={isLive}
                                isForeignQuarter={ini.quarterId !== localQuarterId}
                                onDragStart={(e, type) => startDrag(e, ini, type)}
                                onClick={() => setTooltip(ini)}
                              />
                            ) : (
                              <div className="absolute inset-y-0 left-2 flex items-center">
                                <span className="text-xs italic" style={{ color: "var(--border-default)" }}>Sem data</span>
                              </div>
                            )}

                            {/* Live drag date tooltip */}
                            {isLive && livePos && (
                              <div
                                className="absolute top-0.5 z-30 text-xs px-2 py-0.5 rounded pointer-events-none whitespace-nowrap"
                                style={{
                                  left: geo!.leftPx,
                                  background: "var(--bg-tooltip)",
                                  border: "1px solid var(--border-tooltip)",
                                  color: "white",
                                  borderRadius: "var(--radius-sm)",
                                }}
                              >
                                {fmtShort(livePos.startDate)} → {fmtShort(livePos.endDate)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Tooltip panel */}
      {tooltip && (
        <GanttTooltip
          ini={tooltip}
          onClose={() => setTooltip(null)}
          onEdit={() => openEdit(tooltip)}
        />
      )}

      {/* Edit modal */}
      {showForm && editTarget && (
        <IniciativaForm
          mode="edit"
          iniciativa={editTarget}
          quarters={quarters}
          frentes={frentes}
          members={members}
          initialOkrs={editTarget.okr ? [editTarget.okr] : []}
          selectedQuarterId={localQuarterId}
          onSuccess={() => { setShowForm(false); setEditTarget(null); }}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}

// ─── Small view toggle component ──────────────────────────────────
function ViewToggle({
  currentView,
  ganttUrl,
  tableUrl,
}: {
  currentView: "table" | "gantt";
  ganttUrl: string;
  tableUrl: string;
}) {
  return (
    <SegmentedToggle
      ariaLabel="Modo de visualização"
      value={currentView}
      items={[
        { value: "table", label: "Tabela", icon: Table2, href: tableUrl },
        { value: "gantt", label: "Gantt", icon: GanttChartSquare, href: ganttUrl },
      ]}
    />
  );
}
