import { getQuarters } from "@/actions/quarters";
import { getTeamMembers } from "@/actions/team-members";
import { getAusencias, getConflicts } from "@/actions/ausencias";
import { getTravasFerias } from "@/actions/travas-ferias";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { TravasFeriasCard } from "@/components/ausencias/TravasFeriasCard";
import { ConflictAlerts } from "@/components/ausencias/ConflictAlerts";
import { AusenciasRoadmap } from "@/components/ausencias/AusenciasRoadmap";
import { AusenciasTable } from "@/components/ausencias/AusenciasTable";
import { NewAusenciaButton } from "@/components/ausencias/NewAusenciaButton";
import { Card } from "@/components/shared/Card";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import Link from "next/link";
import type { Metadata } from "next";
import { AusenciasFilters } from "@/components/ausencias/AusenciasFilters";

export const metadata: Metadata = {
  title: "Ausências | Sala de Growth",
  description: "Gerenciamento de ausências da equipe.",
};

type Period = "quarter" | "6months" | "year";

function addDays(date: Date, days: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toUTCMidnight(date: Date | string): Date {
  const d = new Date(date as any);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AusenciasPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    quarter?: string;
    member?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const period = (params.period ?? "quarter") as Period;
  const memberFilter = params.member;
  const typeFilter = params.type;

  const [quarters, todosMembros, currentMember] = await Promise.all([
    getQuarters(),
    getTeamMembers(),
    getCurrentMember(),
  ]);

  // Visitante não aparece em /ausencias: ele não registra ausência (o gate de
  // edição barra), então uma linha vazia no roadmap e um filtro que nunca traz
  // nada só ocupavam espaço.
  const members = todosMembros.filter((m) => m.role !== MemberRole.VISITANTE);
  const idsVisiveis = new Set(members.map((m) => m.id));
  const canManageTravas = currentMember.role === MemberRole.LIDERANCA;

  const activeQuarter = quarters.find((q) => q.isActive) ?? quarters[0];
  const selectedQuarterId = params.quarter ?? activeQuarter?.id;
  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);

  // ── Range ──────────────────────────────────────────────────────────
  const today = toUTCMidnight(new Date());
  let rangeStart: Date;
  let rangeEnd: Date;
  let pixelsPerDay: number;

  if (period === "6months") {
    rangeStart = today;
    rangeEnd = addDays(today, 180);
    pixelsPerDay = 7;
  } else if (period === "year") {
    rangeStart = today;
    rangeEnd = addDays(today, 365);
    pixelsPerDay = 3;
  } else {
    rangeStart = selectedQuarter ? toUTCMidnight(selectedQuarter.startDate) : today;
    rangeEnd = selectedQuarter
      ? toUTCMidnight(selectedQuarter.endDate)
      : addDays(today, 90);
    pixelsPerDay = 14;
  }

  // ── Janela das travas ──────────────────────────────────────────
  // O card de travas não segue o período/quarter escolhido: mostra o quarter
  // ativo + até 4 quarters seguintes, só entre os que já estão cadastrados.
  const quartersAsc = [...quarters].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const activeIdx = activeQuarter ? quartersAsc.findIndex((q) => q.id === activeQuarter.id) : -1;
  const travasQuarters = activeIdx >= 0 ? quartersAsc.slice(activeIdx, activeIdx + 5) : [];
  const firstQ = travasQuarters[0];
  const lastQ = travasQuarters[travasQuarters.length - 1];
  const travasStart = firstQ ? toUTCMidnight(firstQ.startDate) : rangeStart;
  const travasEnd = lastQ ? toUTCMidnight(lastQ.endDate) : rangeEnd;
  const quarterLabel = (q: { quarter: number; year: number }) => `Q${q.quarter} ${q.year}`;
  const travasWindowLabel = !firstQ
    ? "no período"
    : firstQ === lastQ
      ? quarterLabel(firstQ)
      : `${quarterLabel(firstQ)} – ${quarterLabel(lastQ)}`;

  // ── Fetch ──────────────────────────────────────────────────────────
  const [todasAusencias, conflicts, travas, travasCard, feriasNaJanela] = await Promise.all([
    getAusencias({
      ...(memberFilter && { memberId: memberFilter }),
      ...(typeFilter && { type: typeFilter }),
      rangeStart,
      rangeEnd,
    }),
    getConflicts(rangeStart, rangeEnd),
    getTravasFerias({ rangeStart, rangeEnd }),
    getTravasFerias({ rangeStart: travasStart, rangeEnd: travasEnd }),
    getAusencias({ type: "FERIAS", rangeStart: travasStart, rangeEnd: travasEnd }),
  ]);

  // Ausência de visitante some junto com a pessoa — senão ela reapareceria na
  // tabela sem ter linha no roadmap.
  const ausencias = todasAusencias.filter((a) => idsVisiveis.has(a.memberId));

  /** Quem tem férias marcadas dentro de cada trava — vira aviso no card. */
  const travasComConflitos = travasCard.map((t) => ({
    id: t.id,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    notes: t.notes,
    conflitos: [
      ...new Set(
        feriasNaJanela
          .filter(
            (a) =>
              idsVisiveis.has(a.memberId) &&
              new Date(a.startDate) <= new Date(t.endDate) &&
              new Date(a.endDate) >= new Date(t.startDate)
          )
          .map((a) => a.member.name)
      ),
    ],
  }));

  // ── URL builder ────────────────────────────────────────────────────
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const base: Record<string, string> = {};
    if (period !== "quarter") base.period = period;
    if (selectedQuarterId) base.quarter = selectedQuarterId;
    if (memberFilter) base.member = memberFilter;
    if (typeFilter) base.type = typeFilter;
    const merged = { ...base, ...overrides };
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/ausencias${qs ? `?${qs}` : ""}`;
  }

  const periodLabel = `${fmtShort(rangeStart)} – ${fmtShort(rangeEnd)}`;

  const PERIOD_LABELS: Record<Period, string> = {
    quarter: "Quarter",
    "6months": "6 meses",
    year: "12 meses",
  };

  const activeMembers = members.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      {/* pb-2: 32px separando o cabeçalho do conteúdo, como em /iniciativas e
          no dashboard; os blocos seguintes ficam a 24px. */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Ausências do Time
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Visualize férias, licenças e indisponibilidades do time
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period pill toggle */}
          <SegmentedToggle
            ariaLabel="Período"
            value={period}
            items={(["quarter", "6months", "year"] as Period[]).map((p) => ({
              value: p,
              label: PERIOD_LABELS[p],
              href: buildUrl({
                period: p === "quarter" ? undefined : p,
                quarter: p !== "quarter" ? undefined : selectedQuarterId,
              }),
            }))}
          />

          <NewAusenciaButton members={members} />
        </div>
      </div>

      {/* ── Conflict alerts (always visible) ───────────────────────── */}
      <ConflictAlerts conflicts={conflicts} />

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      {/* Mesmo desenho das outras listas: rótulo do período à esquerda e os
          filtros em dropdown encostados à direita. */}
      <Card className="flex flex-wrap items-center justify-between gap-4" padding="12px 16px">
        {/* Period label */}
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {periodLabel}
        </span>

        <AusenciasFilters
          quarters={quarters}
          selectedQuarterId={selectedQuarterId ?? ""}
          showQuarter={period === "quarter"}
          members={activeMembers}
          memberFilter={memberFilter ?? ""}
        />
      </Card>

      {/* ── Travas de férias ───────────────────────────────────────── */}
      <TravasFeriasCard
        travas={travasComConflitos}
        windowLabel={travasWindowLabel}
        canManage={canManageTravas}
      />

      {/* ── Roadmap ────────────────────────────────────────────────── */}
      <AusenciasRoadmap
        members={members}
        ausencias={ausencias}
        travas={travas}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        pixelsPerDay={pixelsPerDay}
      />

      {/* ── Table ──────────────────────────────────────────────────── */}
      <AusenciasTable ausencias={ausencias} members={members} />
    </div>
  );
}
