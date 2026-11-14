"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Target,
  Copy,
  Check,
  CheckCircle2,
  Palmtree,
} from "lucide-react";
import {
  type Report,
  ROLE_LABELS,
  RESULTADO_LABEL,
  formatValue,
  groupByFrente,
  groupAusenciasByMember,
  formatResponsaveis,
  buildReportHtml,
  buildReportText,
} from "@/lib/relatorio-report";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { QuarterDropdown } from "@/components/shared/QuarterSelector";

interface Props {
  quarters: {
    id: string;
    year: number;
    quarter: number;
    isActive: boolean;
    startDate: Date | string;
  }[];
  selectedQuarterId: string | null;
  report: Report | null;
}

const RESULTADO_STYLE: Record<string, { bg: string; borderColor: string; textColor: string }> = {
  SUCESSO: { bg: "var(--sage-soft)", borderColor: "var(--sage)", textColor: "var(--color-forest)" },
  PARCIAL: { bg: "var(--butter-soft)", borderColor: "var(--butter)", textColor: "var(--butter-strong)" },
  FALHA: { bg: "var(--blush-soft)", borderColor: "var(--blush)", textColor: "var(--blush-strong)" },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatFullDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function progressColor(pct: number): string {
  if (pct >= 80) return "var(--color-forest)";
  if (pct >= 50) return "var(--brand-primary)";
  return "var(--peach)";
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function RelatorioView({ quarters, selectedQuarterId, report }: Props) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);
  const quarterLabel = selectedQuarter ? `Q${selectedQuarter.quarter} ${selectedQuarter.year}` : "";
  const periodo =
    report?.quarter
      ? `Período: ${formatFullDate(report.quarter.startDate)} – ${formatFullDate(report.quarter.endDate)}`
      : "";

  async function handleCopy() {
    if (!report) return;
    const html = buildReportHtml(report, quarterLabel, periodo);
    const text = buildReportText(report, quarterLabel, periodo);
    try {
      if (navigator.clipboard && typeof window.ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 3000);
    }
  }

  const membersWithActivity =
    report?.membros.filter(
      (m) => m.iniTotal > 0 || m.expTotal > 0 || m.okrs.length > 0,
    ) ?? [];
  const membersWithoutActivity =
    report?.membros.filter(
      (m) => m.iniTotal === 0 && m.expTotal === 0 && m.okrs.length === 0,
    ) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Relatórios
          </h1>
          {quarterLabel && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Relatório geral do time · {quarterLabel}
              {periodo ? ` · ${periodo.replace("Período: ", "")}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {quarters.length > 0 && selectedQuarterId && (
            <QuarterDropdown
              quarters={quarters}
              value={selectedQuarterId}
              onChange={(v) => router.push(`/relatorios?quarter=${v}`)}
            />
          )}

          {report && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
              style={{
                borderRadius: "var(--radius-md)",
                background: copyState === "done" ? "var(--sage-soft)" : "var(--brand-primary)",
                color: copyState === "done" ? "var(--color-forest)" : "#fff",
                border: "none",
                cursor: "pointer",
              }}
              data-tooltip="Copiar relatório completo (cole no Google Docs)"
            >
              {copyState === "done" ? (
                <>
                  <Check size={15} /> Copiado!
                </>
              ) : copyState === "error" ? (
                <>Erro ao copiar</>
              ) : (
                <>
                  <Copy size={15} /> Copiar relatório
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sem quarters */}
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

      {report && (
        <>
          {/* Resumo geral — stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Progresso médio dos OKRs"
              value={`${report.summary.avgProgress}%`}
              subtitle={`${report.summary.okrCount} OKRs`}
              icon={Target}
              accentBg="var(--sage-soft)"
              accentColor="var(--color-forest)"
            />
            <MetricCard
              label="Iniciativas concluídas"
              value={report.summary.iniConcluidas}
              subtitle={`${report.summary.iniTotal} planejadas`}
              icon={ClipboardList}
              accentBg="var(--peach-soft)"
              accentColor="var(--peach)"
            />
            <MetricCard
              label="Experimentos concluídos"
              value={report.summary.expConcluidos}
              subtitle={`${report.summary.expResultados.SUCESSO} sucesso · ${report.summary.expResultados.PARCIAL} parcial · ${report.summary.expResultados.FALHA} falha`}
              icon={FlaskConical}
              accentBg="var(--sky-soft)"
              accentColor="var(--sky)"
            />
            <MetricCard
              label="Taxa de conclusão"
              value={`${report.summary.taxaConclusao}%`}
              subtitle={`${report.summary.entregasConcluidas} de ${report.summary.planejadoTotal} planejados`}
              icon={CheckCircle2}
              accentBg="var(--butter-soft)"
              accentColor="var(--butter-strong)"
            />
          </div>

          {/* OKRs do quarter */}
          <Section title="OKRs do quarter" icon={Target}>
            {report.okrs.length === 0 ? (
              <EmptyLine>Nenhum OKR cadastrado neste quarter.</EmptyLine>
            ) : (
              <ul className="space-y-4">
                {report.okrs.map((okr) => (
                  <li key={okr.id}>
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                        {okr.objective}
                      </span>
                      <span className="text-sm font-bold shrink-0" style={{ color: "var(--brand-primary)" }}>
                        {okr.progressPercent}%
                      </span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "var(--bg-app)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(okr.progressPercent, 100)}%`, background: progressColor(okr.progressPercent) }}
                      />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                      {okr.frente} · {formatValue(okr.currentValue, okr.unit)} / {formatValue(okr.targetValue, okr.unit)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Entregas concluídas */}
          <Section title={`Ações realizadas · ${report.entregas.length} entrega${report.entregas.length === 1 ? "" : "s"}`} icon={CheckCircle2}>
            {report.entregas.length === 0 ? (
              <EmptyLine>Nenhuma entrega concluída neste quarter.</EmptyLine>
            ) : (
              <div className="space-y-5">
                {groupByFrente(report.entregas).map((g) => (
                  <div key={g.frente}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                        {g.frente}
                      </span>
                      <Badge bg="var(--bg-app)" color="var(--text-muted)" borderColor="var(--border-subtle)">
                        {g.items.length}
                      </Badge>
                    </div>
                    <ul className="space-y-2.5">
                      {g.items.map((e) => (
                        <li key={`${e.tipo}-${e.id}`} className="flex items-start gap-3">
                          {e.tipo === "iniciativa" ? (
                            <ClipboardList size={15} className="mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                          ) : (
                            <FlaskConical size={15} className="mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <a
                              href={`/${e.tipo === "iniciativa" ? "iniciativas" : "experimentos"}/${e.id}`}
                              className="text-sm font-medium leading-tight hover:underline block"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {e.name}
                            </a>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                              {formatResponsaveis(e.memberNames)}
                            </p>
                          </div>
                          {e.resultado && <ResultadoBadge resultado={e.resultado} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Ausências no quarter */}
          <Section
            title={`Ausências no quarter · ${report.ausencias.length} registro${report.ausencias.length === 1 ? "" : "s"}`}
            icon={Palmtree}
          >
            {report.ausencias.length === 0 ? (
              <EmptyLine>Nenhuma ausência registrada neste quarter.</EmptyLine>
            ) : (
              <div className="space-y-5">
                {groupAusenciasByMember(report.ausencias).map((g) => (
                  <div key={g.memberId}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                        {g.memberName}
                      </span>
                      <Badge bg="var(--bg-app)" color="var(--text-muted)" borderColor="var(--border-subtle)">
                        {g.totalDias} dia{g.totalDias === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <ul className="space-y-2">
                      {g.items.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <StatusBadge status={a.type} type="ausencia" />
                          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                            {formatFullDate(a.startDate)} – {formatFullDate(a.endDate)}
                          </span>
                          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                            {a.dias} dia{a.dias === 1 ? "" : "s"}
                          </span>
                          {a.notes && (
                            <span className="text-xs italic truncate" style={{ color: "var(--text-muted)" }}>
                              {a.notes}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Performance por pessoa */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Performance por pessoa
            </h2>

            {membersWithActivity.map((m) => (
              <MemberReportCard key={m.id} member={m} />
            ))}

            {membersWithoutActivity.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                  Sem atividade neste quarter
                </p>
                <Card className="flex flex-wrap gap-x-6 gap-y-2" padding="16px 20px">
                  {membersWithoutActivity.map((m) => (
                    <span key={m.id} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {m.name}
                    </span>
                  ))}
                </Card>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <Card padding={24} style={{ borderRadius: 16 }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text-muted)" }}>
        <Icon size={14} />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

function ResultadoBadge({ resultado }: { resultado: string }) {
  const cfg = RESULTADO_STYLE[resultado];
  if (!cfg) return null;
  return (
    <Badge className="shrink-0" bg={cfg.bg} borderColor={cfg.borderColor} color={cfg.textColor}>
      {RESULTADO_LABEL[resultado] ?? resultado}
    </Badge>
  );
}

type MemberReport = Report extends { membros: (infer M)[] } ? M : never;

function MemberReportCard({ member }: { member: MemberReport }) {
  return (
    <Card className="overflow-hidden" padding={0} style={{ borderRadius: 16 }}>
      <div className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div
          className="flex items-center justify-center shrink-0 font-bold text-white text-sm select-none"
          style={{ width: 40, height: 40, borderRadius: "var(--radius-md)", background: "var(--brand-primary)" }}
        >
          {getInitials(member.name)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base leading-tight" style={{ color: "var(--text-primary)" }}>
            {member.name}
          </h3>
        </div>
        <Badge
          className="shrink-0"
          bg={member.role === "LIDERANCA" ? "var(--accent-subtle)" : "var(--bg-app)"}
          color={member.role === "LIDERANCA" ? "var(--brand-primary)" : "var(--text-secondary)"}
          borderColor="var(--border-subtle)"
        >
          {ROLE_LABELS[member.role] ?? member.role}
        </Badge>
        <div className="flex items-center gap-5 text-sm shrink-0" style={{ color: "var(--text-secondary)" }}>
          <span className="flex items-center gap-1.5" data-tooltip="Iniciativas">
            <ClipboardList size={14} style={{ color: "var(--text-muted)" }} />
            <span className="font-medium">{member.iniTotal}</span>
          </span>
          <span className="flex items-center gap-1.5" data-tooltip="Experimentos">
            <FlaskConical size={14} style={{ color: "var(--text-muted)" }} />
            <span className="font-medium">{member.expTotal}</span>
          </span>
          <span className="flex items-center gap-1.5" data-tooltip="OKRs">
            <Target size={14} style={{ color: "var(--text-muted)" }} />
            <span className="font-medium">{member.okrs.length}</span>
          </span>
          <span className="flex items-center gap-1.5" data-tooltip="Entregas concluídas" style={{ color: "var(--color-forest)" }}>
            <CheckCircle2 size={14} />
            <span className="font-semibold">{member.entregasConcluidas}</span>
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2">
        {/* Entregas concluídas */}
        <div className="px-6 py-5" style={{ borderRight: "1px solid var(--border-subtle)" }}>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text-muted)" }}>
            <CheckCircle2 size={13} />
            Entregas concluídas ({member.entregasConcluidas})
          </h4>
          {member.entregas.length === 0 ? (
            <EmptyLine>Nenhuma entrega concluída neste quarter.</EmptyLine>
          ) : (
            <ul className="space-y-2.5">
              {member.entregas.map((e, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  {e.tipo === "iniciativa" ? (
                    <ClipboardList size={14} className="mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  ) : (
                    <FlaskConical size={14} className="mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
                      {e.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {e.frente}
                    </p>
                  </div>
                  {e.resultado && <ResultadoBadge resultado={e.resultado} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* OKRs */}
        <div className="px-6 py-5">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text-muted)" }}>
            <Target size={13} />
            OKRs responsável ({member.okrs.length})
          </h4>
          {member.okrs.length === 0 ? (
            <EmptyLine>Não é responsável por OKRs neste quarter.</EmptyLine>
          ) : (
            <ul className="space-y-4">
              {member.okrs.map((okr) => (
                <li key={okr.id}>
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                      {okr.objective}
                    </span>
                    <span className="text-sm font-bold shrink-0" style={{ color: "var(--brand-primary)" }}>
                      {okr.progressPercent}%
                    </span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "var(--bg-app)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(okr.progressPercent, 100)}%`, background: progressColor(okr.progressPercent) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
