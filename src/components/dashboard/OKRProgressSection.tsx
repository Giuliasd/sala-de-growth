import Link from "next/link";
import { Target } from "lucide-react";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { Card } from "@/components/shared/Card";
import { CardHeader } from "@/components/shared/CardHeader";
import { diasDesde, krParado } from "@/lib/precisa-de-voce";

function formatOKRValue(value: number, unit: string): string {
  if (unit === "REAL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  if (unit === "PORCENTAGEM") {
    return `${value}%`;
  }
  return value.toString();
}

/** Cor do percentual, na mesma escala da barra (ProgressBar variant="dynamic"). */
function progressTextColor(pct: number): string {
  if (pct <= 33) return "var(--color-peach)";
  if (pct <= 66) return "var(--progress-mid-text)";
  return "var(--color-forest)";
}

type OKRItem = {
  id: string;
  objective: string;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
  unit: string;
  lastUpdatedAt: Date | string | null;
  frente: { id: string; name: string };
};

interface OKRProgressSectionProps {
  okrs: OKRItem[];
  overallProgress: number;
  quarterStart?: Date | string | null;
  quarterEnd?: Date | string | null;
  /** Hoje (meia-noite UTC da data local), para o "sem atualização há N dias". */
  hoje: Date;
}

/** KRs à vista antes do "Ver todos": o card responde "quem precisa de atenção". */
const MAX_VISIVEIS = 3;

/**
 * Progresso dos OKRs, ordenado pelo RITMO: o KR mais atrás do tempo decorrido
 * do quarter vem primeiro. Antes eram todos, agrupados por frente — 38% no dia
 * 20 e no dia 80 pareciam a mesma coisa, e o KR que pedia atenção ficava no
 * meio da lista. O marcador de cada barra é o tempo decorrido.
 */
export function OKRProgressSection({
  okrs,
  overallProgress,
  quarterStart,
  quarterEnd,
  hoje,
}: OKRProgressSectionProps) {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Time elapsed calculation (UTC days)
  let timeElapsedPct: number | null = null;
  let elapsedDays: number | null = null;
  let totalDays: number | null = null;

  if (quarterStart && quarterEnd) {
    const now = new Date();
    const startMs = new Date(quarterStart as any).setUTCHours(0, 0, 0, 0);
    const endMs = new Date(quarterEnd as any).setUTCHours(0, 0, 0, 0);
    const nowMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const total = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
    const elapsed = Math.max(0, Math.min(total, Math.round((nowMs - startMs) / (1000 * 60 * 60 * 24)) + 1));
    totalDays = total;
    elapsedDays = elapsed;
    timeElapsedPct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  }

  // Mais atrás do ritmo primeiro; sem as datas do quarter, o menor progresso.
  const ritmo = timeElapsedPct ?? 0;
  const ordenados = [...okrs].sort(
    (a, b) => a.progressPercent - ritmo - (b.progressPercent - ritmo)
  );
  const visiveis = ordenados.slice(0, MAX_VISIVEIS);

  return (
    <Card padding={28} style={{ borderRadius: "var(--radius-lg)" }}>
      {/* Cabeçalho padrão do design system. O de antes era montado à mão e o
          bloco do título não encolhia: em card estreito o título empurrava a
          porcentagem para fora da borda. */}
      <CardHeader
        icon={Target}
        title="Progresso dos OKRs"
        subtitle={okrs.length > 0 ? "Abaixo do ritmo primeiro" : `Atualizado em ${today}`}
        className="mb-6"
        actions={
          <span
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: progressTextColor(overallProgress) }}
          >
            {overallProgress.toFixed(1)}%
          </span>
        }
      />

      {okrs.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nenhum OKR cadastrado neste quarter.
        </p>
      ) : (
        <>
          {timeElapsedPct !== null && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Tempo decorrido do quarter
                </p>
                <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {elapsedDays} de {totalDays} dias
                </span>
              </div>
              <ProgressBar value={timeElapsedPct} variant="time" />
            </div>
          )}

          <div className="mb-6" style={{ height: 1, background: "var(--border-subtle)" }} />

          <div className="space-y-3">
            {visiveis.map((okr) => {
              const pct = Math.min(100, Math.max(0, okr.progressPercent));
              const parado = krParado(okr.lastUpdatedAt, hoje);
              const dias = diasDesde(okr.lastUpdatedAt, hoje);
              return (
                <div
                  key={okr.id}
                  className="space-y-2"
                  style={{
                    background: "var(--bg-app)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium leading-snug line-clamp-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {okr.objective}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {okr.frente.name}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-sm font-bold font-mono tabular-nums"
                      style={{ color: progressTextColor(okr.progressPercent) }}
                    >
                      {okr.progressPercent.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    variant="dynamic"
                    marker={timeElapsedPct ?? undefined}
                    markerTitle={
                      timeElapsedPct !== null
                        ? `${timeElapsedPct.toFixed(0)}% do quarter decorrido`
                        : undefined
                    }
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatOKRValue(okr.currentValue, okr.unit)} / {formatOKRValue(okr.targetValue, okr.unit)}
                    </p>
                    {parado && (
                      <p className="text-xs" style={{ color: "var(--status-late-text)" }}>
                        {dias === null ? "Nunca atualizado" : `Sem atualização há ${dias} dias`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Link
            href="/okrs"
            className="inline-block mt-4 text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--brand-primary)" }}
          >
            {okrs.length > MAX_VISIVEIS ? `Ver todos os ${okrs.length} OKRs` : "Ver OKRs"}
          </Link>
        </>
      )}
    </Card>
  );
}
