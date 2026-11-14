"use client"

import { useRouter } from "next/navigation"
import { ChevronDown, ClipboardList, FlaskConical, Target, Users } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Card } from "@/components/shared/Card"
import { Badge } from "@/components/shared/Badge"
import { EmptyState } from "@/components/shared/EmptyState"
import { SegmentedToggle } from "@/components/shared/SegmentedToggle"
import { DetailModalLink } from "@/components/shared/DetailModal"
import { isIniciativaConcluida } from "@/lib/statusConfig"
import type { MemberRole, OKRUnit } from "@/generated/prisma/enums"
import { QuarterDropdown } from "@/components/shared/QuarterSelector";

type MemberStat = {
  id: string
  name: string
  email: string
  role: MemberRole
  iniciativas: {
    id: string
    name: string
    status: string
    priority: string
    resultado: string | null
    frente: { name: string }
  }[]
  experimentos: {
    id: string
    name: string
    status: string
    resultado: string | null
    frente: { name: string }
  }[]
  okrs: {
    id: string
    objective: string
    progressPercent: number
    targetValue: number
    currentValue: number
    unit: OKRUnit
    frente: { name: string }
  }[]
}

interface Props {
  quarters: {
    id: string
    year: number
    quarter: number
    isActive: boolean
    startDate: Date | string
  }[]
  selectedQuarterId: string | null
  memberStats: MemberStat[]
  view: "trimestral" | "mensal"
  selectedMonth: number | null
}

const ROLE_LABELS: Record<string, string> = {
  VISITANTE: "Visitante",
  COLABORADOR: "Colaborador",
  LIDERANCA: "Liderança",
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
}

function formatValue(value: number, unit: OKRUnit): string {
  if (unit === "REAL") {
    return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
  }
  if (unit === "PORCENTAGEM") {
    return `${value}%`
  }
  return value.toLocaleString("pt-BR")
}

function getQuarterMonthNames(startDate: Date | string): [string, string, string] {
  const d = new Date(startDate)
  return [0, 1, 2].map((i) => {
    const month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1))
    const name = month.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" })
    return name.charAt(0).toUpperCase() + name.slice(1)
  }) as [string, string, string]
}

export function GestaoView({
  quarters,
  selectedQuarterId,
  memberStats,
  view,
  selectedMonth,
}: Props) {
  const router = useRouter()

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId)
  const quarterLabel = selectedQuarter
    ? `Q${selectedQuarter.quarter} ${selectedQuarter.year}`
    : ""

  const monthNames = selectedQuarter
    ? getQuarterMonthNames(selectedQuarter.startDate)
    : (["Mês 1", "Mês 2", "Mês 3"] as [string, string, string])

  const activeMonthIdx = (selectedMonth ?? 1) - 1

  function buildUrl(params: Record<string, string | undefined>) {
    const base = new URLSearchParams()
    if (selectedQuarterId) base.set("quarter", selectedQuarterId)
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) base.set(k, v)
      else base.delete(k)
    })
    return `/gestao?${base.toString()}`
  }

  const periodLabel =
    view === "mensal" ? `em ${monthNames[activeMonthIdx]}` : "neste quarter"

  const membersWithActivity = memberStats.filter(
    (m) =>
      m.iniciativas.length > 0 || m.experimentos.length > 0 || m.okrs.length > 0,
  )
  const membersWithoutActivity = memberStats.filter(
    (m) =>
      m.iniciativas.length === 0 &&
      m.experimentos.length === 0 &&
      m.okrs.length === 0,
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Acompanhamento
          </h1>
          {quarterLabel && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Performance por membro · {quarterLabel}
            </p>
          )}
        </div>
        {quarters.length > 0 && selectedQuarterId && (
          <QuarterDropdown
            quarters={quarters}
            value={selectedQuarterId}
            onChange={(v) => router.push( buildUrl({ quarter: v }), )}
          />
        )}
      </div>

      {/* View toggle + month tabs */}
      {selectedQuarterId && (
        <div className="flex items-center gap-4">
          {/* Trimestral / Mensal toggle */}
          <SegmentedToggle
            ariaLabel="Período"
            value={view}
            onChange={(v) =>
              router.push(
                v === "mensal"
                  ? buildUrl({ view: "mensal", month: "1" })
                  : buildUrl({ view: undefined, month: undefined }),
              )
            }
            items={[
              { value: "trimestral", label: "Trimestral" },
              { value: "mensal", label: "Mensal" },
            ]}
          />

          {/* Month tabs (only in mensal view) */}
          {view === "mensal" && (
            <div className="flex gap-2">
              {monthNames.map((name, idx) => {
                const active = idx === activeMonthIdx
                return (
                  <button
                    key={idx}
                    onClick={() =>
                      router.push(buildUrl({ view: "mensal", month: String(idx + 1) }))
                    }
                    className="text-sm font-medium px-4 py-1.5 rounded-xl transition-all"
                    style={{
                      background: active ? "var(--accent-subtle)" : "transparent",
                      color: active ? "var(--brand-primary)" : "var(--text-muted)",
                      border: active
                        ? "1px solid var(--brand-primary)"
                        : "1px solid transparent",
                    }}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state: no quarters */}
      {!selectedQuarterId && (
        <Card className="p-8 text-center">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Nenhum quarter cadastrado.{" "}
            <a href="/configuracoes/quarters" style={{ color: "var(--brand-primary)" }}>
              Crie um quarter
            </a>{" "}
            para começar.
          </p>
        </Card>
      )}

      {/* Member cards */}
      {selectedQuarterId && (
        <div className="space-y-6">
          {memberStats.length === 0 && (
            <Card padding={0}>
              <EmptyState icon={Users} title="Nenhum membro ativo encontrado" />
            </Card>
          )}

          {membersWithActivity.map((member) => (
            <MemberCard key={member.id} member={member} periodLabel={periodLabel} />
          ))}

          {/* Members without activity in the period */}
          {membersWithoutActivity.length > 0 && (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Sem atividade {periodLabel}
              </p>
              <Card className="flex flex-wrap gap-x-6 gap-y-2" padding="16px 20px">
                {membersWithoutActivity.map((m) => (
                  <span
                    key={m.id}
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {m.name}
                  </span>
                ))}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemberCard({
  member,
  periodLabel,
}: {
  member: MemberStat
  periodLabel: string
}) {
  const initials = getInitials(member.name)
  const conclusoesIniciativas = member.iniciativas.filter(
    (i) => isIniciativaConcluida(i.status),
  ).length
  const conclusoesExperimentos = member.experimentos.filter(
    (e) => e.status === "RELATORIO_PRONTO" || e.status === "RESULTADOS_APRESENTADOS",
  ).length

  return (
    <Card className="overflow-hidden" padding={0} style={{ borderRadius: 16 }}>
      {/* Member header */}
      <div
        className="flex items-center gap-4 px-6 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div
          className="flex items-center justify-center shrink-0 font-bold text-white text-sm select-none"
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--radius-md)",
            background: "var(--brand-primary)",
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className="font-semibold text-base leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {member.name}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {member.email}
          </p>
        </div>

        <Badge
          className="shrink-0"
          bg={member.role === "LIDERANCA" ? "var(--accent-subtle)" : "var(--bg-app)"}
          color={member.role === "LIDERANCA" ? "var(--brand-primary)" : "var(--text-secondary)"}
          borderColor="var(--border-subtle)"
        >
          {ROLE_LABELS[member.role as string] ?? member.role}
        </Badge>

        {/* Quick stats */}
        <div
          className="flex items-center gap-5 text-sm shrink-0"
          style={{ color: "var(--text-secondary)" }}
        >
          <span className="flex items-center gap-1.5">
            <ClipboardList size={14} style={{ color: "var(--text-muted)" }} />
            <span className="font-medium">{member.iniciativas.length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <FlaskConical size={14} style={{ color: "var(--text-muted)" }} />
            <span className="font-medium">{member.experimentos.length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Target size={14} style={{ color: "var(--text-muted)" }} />
            <span className="font-medium">{member.okrs.length}</span>
          </span>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-2">
        {/* Iniciativas */}
        <div
          className="px-6 py-5"
          style={{ borderRight: "1px solid var(--border-subtle)" }}
        >
          <h3
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            <ClipboardList size={13} />
            Iniciativas ({member.iniciativas.length})
            {conclusoesIniciativas > 0 && (
              <span
                className="ml-auto text-xs font-semibold"
                style={{ color: "var(--color-forest)" }}
              >
                {conclusoesIniciativas} concluída{conclusoesIniciativas > 1 ? "s" : ""}
              </span>
            )}
          </h3>
          {member.iniciativas.length === 0 ? (
            <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
              Nenhuma iniciativa {periodLabel}.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {member.iniciativas.map((ini) => (
                <li key={ini.id} className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    <StatusBadge status={ini.status} type="iniciativa" showIcon={false} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DetailModalLink
                      id={ini.id}
                      type="iniciativa"
                      className="text-sm font-medium leading-tight hover:underline block"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {ini.name}
                    </DetailModalLink>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {ini.frente.name}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Experimentos + OKRs */}
        <div className="px-6 py-5 space-y-6">
          {/* Experimentos */}
          <div>
            <h3
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              <FlaskConical size={13} />
              Experimentos ({member.experimentos.length})
              {conclusoesExperimentos > 0 && (
                <span
                  className="ml-auto text-xs font-semibold"
                  style={{ color: "var(--color-forest)" }}
                >
                  {conclusoesExperimentos} concluído{conclusoesExperimentos > 1 ? "s" : ""}
                </span>
              )}
            </h3>
            {member.experimentos.length === 0 ? (
              <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
                Nenhum experimento {periodLabel}.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {member.experimentos.map((exp) => (
                  <li key={exp.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      <StatusBadge
                        status={exp.status}
                        type="experimento"
                        showIcon={false}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <DetailModalLink
                        id={exp.id}
                        type="experimento"
                        className="text-sm font-medium leading-tight hover:underline block"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {exp.name}
                      </DetailModalLink>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {exp.frente.name}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* OKRs — always shown regardless of month filter */}
          {member.okrs.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 20 }}>
              <h3
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                <Target size={13} />
                OKRs responsável ({member.okrs.length})
              </h3>
              <ul className="space-y-4">
                {member.okrs.map((okr) => (
                  <li key={okr.id}>
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span
                        className="text-sm font-medium leading-snug"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {okr.objective}
                      </span>
                      <span
                        className="text-sm font-bold shrink-0"
                        style={{ color: "var(--brand-primary)" }}
                      >
                        {Math.round(okr.progressPercent)}%
                      </span>
                    </div>
                    <div
                      className="w-full rounded-full overflow-hidden"
                      style={{ height: 6, background: "var(--bg-app)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(okr.progressPercent, 100)}%`,
                          background:
                            okr.progressPercent >= 80
                              ? "var(--color-forest)"
                              : okr.progressPercent >= 50
                              ? "var(--brand-primary)"
                              : "var(--peach)",
                        }}
                      />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                      {okr.frente.name} · {formatValue(okr.currentValue, okr.unit)} /{" "}
                      {formatValue(okr.targetValue, okr.unit)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
