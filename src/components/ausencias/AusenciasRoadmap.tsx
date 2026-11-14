"use client";

import { useState } from "react";
import { CalendarX, CalendarOff } from "lucide-react";
import { GanttTimeline } from "@/components/iniciativas/GanttTimeline";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  CursorTooltip,
  TooltipTitle,
  TooltipLine,
  TooltipHint,
  useCursorTooltip,
} from "@/components/shared/CursorTooltip";
import {
  getAusenciaBarStyle,
  getAusenciaLabel,
} from "@/components/shared/AusenciaTypeBadge";
import { AusenciaForm, type AusenciaEditTarget } from "./AusenciaForm";

// ─── Date helpers (UTC) ────────────────────────────────────────────
function toUTC(date: Date | string): Date {
  const d = new Date(date as any);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(date: Date | string): string {
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ─── Types ─────────────────────────────────────────────────────────
type MemberItem = { id: string; name: string; isActive: boolean };

export type RoadmapAusencia = {
  id: string;
  memberId: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
  member: { id: string; name: string };
};

/** Janela em que ninguém pode tirar férias — vale para o time todo. */
export type RoadmapTrava = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
};

interface AusenciasRoadmapProps {
  members: MemberItem[];
  ausencias: RoadmapAusencia[];
  travas?: RoadmapTrava[];
  rangeStart: Date | string;
  rangeEnd: Date | string;
  pixelsPerDay: number;
}

// Mesmas medidas do roadmap: seção de altura variável por lanes (uma lane por
// ausência), barras de 28px com borda-l-4.
const LABEL_W = 224;
const ITEM_H = 38; // altura de cada slot de lane
const BAR_H = 28; // altura da barra dentro do slot
const SECTION_PAD = 6; // padding vertical no topo/base de cada seção de membro

export function AusenciasRoadmap({
  members,
  ausencias,
  travas = [],
  rangeStart,
  rangeEnd,
  pixelsPerDay,
}: AusenciasRoadmapProps) {
  const { tip: tooltip, bind: bindTooltip } = useCursorTooltip<RoadmapAusencia>();
  const [editTarget, setEditTarget] = useState<AusenciaEditTarget | null>(null);

  const rStart = toUTC(rangeStart);
  const rEnd = toUTC(rangeEnd);
  const totalDays = diffDays(rEnd, rStart) + 1;
  const ganttWidth = totalDays * pixelsPerDay;

  // Today line
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayX =
    todayUTC >= rStart && todayUTC <= rEnd
      ? diffDays(todayUTC, rStart) * pixelsPerDay
      : null;

  const activeMembers = members.filter((m) => m.isActive);

  // Travas de férias: faixa vertical atravessando todas as linhas. Recorta no
  // range visível, igual às barras de ausência.
  const travaBands = travas
    .map((t) => {
      const s = toUTC(t.startDate);
      const e = toUTC(t.endDate);
      const inicio = s < rStart ? rStart : s;
      const fim = e > rEnd ? rEnd : e;
      if (inicio > rEnd || fim < rStart) return null;
      return {
        id: t.id,
        label: t.name,
        notes: t.notes,
        startDate: t.startDate,
        endDate: t.endDate,
        leftPx: diffDays(inicio, rStart) * pixelsPerDay,
        widthPx: Math.max((diffDays(fim, inicio) + 1) * pixelsPerDay, pixelsPerDay),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  function barGeometry(aus: RoadmapAusencia) {
    const s = toUTC(aus.startDate);
    const e = toUTC(aus.endDate);
    const clampedStart = s < rStart ? rStart : s;
    const clampedEnd = e > rEnd ? rEnd : e;
    if (clampedStart > rEnd || clampedEnd < rStart) return null;
    const leftPx = diffDays(clampedStart, rStart) * pixelsPerDay;
    const widthPx = Math.max((diffDays(clampedEnd, clampedStart) + 1) * pixelsPerDay, pixelsPerDay);
    return { leftPx, widthPx };
  }

  return (
    <>
      <Card className="overflow-hidden" padding={0}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: LABEL_W + ganttWidth }}>

            {/* ── Timeline header ────────────────────────────── */}
            <div
              className="flex sticky top-0 z-40"
              style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-app)" }}
            >
              <div
                className="sticky left-0 z-40 shrink-0 flex items-end px-3 pb-1"
                style={{
                  width: LABEL_W,
                  minWidth: LABEL_W,
                  background: "var(--bg-app)",
                  borderRight: "1px solid var(--border-subtle)",
                }}
              >
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  Membro
                </span>
              </div>
              <GanttTimeline
                rangeStart={rStart}
                rangeEnd={rEnd}
                pixelsPerDay={pixelsPerDay}
                totalDays={totalDays}
                bands={travaBands}
              />
            </div>

            {/* ── Member rows ───────────────────────────────── */}
            {activeMembers.length === 0 ? (
              <EmptyState icon={CalendarX} title="Nenhum membro ativo cadastrado" />
            ) : (
              activeMembers.map((member, memberIdx) => {
                const memberAusencias = ausencias
                  .filter((a) => a.memberId === member.id)
                  .sort(
                    (a, b) => toUTC(a.startDate).getTime() - toUTC(b.startDate).getTime()
                  );
                // Uma lane por ausência (mesmo comportamento do roadmap); mínimo 1
                // pra o membro sem ausência ainda ocupar uma linha.
                const numLanes = Math.max(1, memberAusencias.length);
                const sectionH = SECTION_PAD * 2 + numLanes * ITEM_H;
                const isLastRow = memberIdx === activeMembers.length - 1;

                return (
                  <div
                    key={member.id}
                    className="flex"
                    style={{
                      height: sectionH,
                      borderBottom: isLastRow ? "none" : "1px solid var(--border-subtle)",
                    }}
                  >
                    {/* Sticky member label */}
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
                      <Avatar name={member.name} size={28} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {member.name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {memberAusencias.length}{" "}
                          {memberAusencias.length === 1 ? "ausência" : "ausências"}
                        </p>
                      </div>
                    </div>

                    {/* Bar area */}
                    <div className="relative" style={{ width: ganttWidth, overflow: "hidden" }}>
                      {/* Travas de férias, atrás das barras */}
                      {travaBands.map((b) => (
                        <div
                          key={b.id}
                          className="absolute inset-y-0 pointer-events-none"
                          style={{
                            left: b.leftPx,
                            width: b.widthPx,
                            background: "var(--blush-soft)",
                            borderLeft: "2px solid var(--blush)",
                            borderRight: "2px solid var(--blush)",
                            opacity: 0.75,
                            zIndex: 0,
                          }}
                        />
                      ))}

                      {/* Today line */}
                      {todayX !== null && (
                        <div
                          className="absolute inset-y-0 w-0.5 pointer-events-none"
                          style={{ left: todayX, background: "var(--brand-primary)", opacity: 0.7, zIndex: 5 }}
                        />
                      )}

                      {memberAusencias.map((aus, lane) => {
                        const geo = barGeometry(aus);
                        if (!geo) return null;
                        const barStyle = getAusenciaBarStyle(aus.type);
                        const label = getAusenciaLabel(aus.type);
                        const showLabel = geo.widthPx > 60;
                        const topPx = SECTION_PAD + lane * ITEM_H + (ITEM_H - BAR_H) / 2;

                        return (
                          <div
                            key={aus.id}
                            className="absolute flex items-center gap-1.5 px-2 rounded select-none border-l-4 transition-all cursor-pointer overflow-hidden z-10"
                            style={{
                              left: geo.leftPx,
                              width: geo.widthPx,
                              top: topPx,
                              height: BAR_H,
                              background: barStyle.bg,
                              borderLeftColor: barStyle.color,
                              color: barStyle.color,
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
                              bindTooltip(aus).onMouseEnter(e);
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.boxShadow = "none";
                              bindTooltip(aus).onMouseLeave();
                            }}
                            onClick={() =>
                              setEditTarget({
                                id: aus.id,
                                memberId: aus.memberId,
                                type: aus.type,
                                startDate: aus.startDate,
                                endDate: aus.endDate,
                                notes: aus.notes,
                              })
                            }
                          >
                            <CalendarOff size={13} strokeWidth={2} className="shrink-0 pointer-events-none" />
                            {showLabel && (
                              <span className="text-xs font-medium truncate pointer-events-none">
                                {label}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Card>

      {/* Hover tooltip */}
      {tooltip && (
        <CursorTooltip x={tooltip.x} y={tooltip.y}>
          <TooltipTitle>{getAusenciaLabel(tooltip.data.type)}</TooltipTitle>
          <TooltipLine>
            {fmtDate(tooltip.data.startDate)} – {fmtDate(tooltip.data.endDate)}
          </TooltipLine>
          {tooltip.data.notes && (
            <TooltipLine dim italic>
              {tooltip.data.notes}
            </TooltipLine>
          )}
          <TooltipHint>Clique para editar</TooltipHint>
        </CursorTooltip>
      )}

      {/* Edit modal */}
      {editTarget && (
        <AusenciaForm
          mode="edit"
          ausencia={editTarget}
          members={members}
          onSuccess={() => {
            setEditTarget(null);
          }}
          onCancel={() => setEditTarget(null)}
        />
      )}
    </>
  );
}
