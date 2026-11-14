"use client";

import { AlertTriangle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { PaceStatus } from "@/lib/okr";

/**
 * Peças de acompanhamento do KR: o estado de ritmo, a sparkline do histórico e
 * a leitura mensal da média.
 *
 * A régua é sempre a mesma: **progresso comparado ao tempo decorrido do
 * quarter**. Sem esse denominador, 38% no dia 20 e no dia 80 são o mesmo
 * número na tela.
 */

// Os rótulos falam de RESULTADO, não de atualização: ao lado do selo de KR
// parado, "Atrasado" lia como "atrasado para atualizar". As chaves internas
// seguem curtas; o que muda é o que a pessoa lê.
const PACE_CONFIG: Record<
  PaceStatus,
  { label: string; bg: string; color: string; icon: typeof TrendingUp }
> = {
  adiantado: {
    label: "Acima do esperado",
    bg: "var(--sage-soft)",
    color: "var(--color-forest)",
    icon: TrendingUp,
  },
  "no-ritmo": {
    label: "Dentro do esperado",
    bg: "var(--sky-soft)",
    color: "var(--sky-strong)",
    icon: Minus,
  },
  atrasado: {
    label: "Abaixo do esperado",
    bg: "var(--peach-soft)",
    color: "var(--peach-strong)",
    icon: TrendingDown,
  },
};

export function PaceChip({
  status,
  gap,
}: {
  status: PaceStatus;
  /** Pontos percentuais de diferença entre progresso e tempo decorrido. */
  gap: number;
}) {
  const cfg = PACE_CONFIG[status];
  const Icon = cfg.icon;
  const sinal = gap > 0 ? "+" : "";
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 text-xs font-medium px-2 py-0.5 whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color, borderRadius: "var(--radius-full)" }}
      data-tooltip={`${cfg.label} — ${sinal}${gap.toFixed(0)} pontos entre o progresso e o tempo decorrido do quarter`}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

/** Selo de KR parado: diferente de atrasado, e o modo de falha mais comum. */
export function StaleChip({ dias }: { dias: number | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 text-xs font-medium px-2 py-0.5 whitespace-nowrap"
      style={{
        background: "var(--butter-soft)",
        color: "var(--butter-strong)",
        borderRadius: "var(--radius-full)",
      }}
      data-tooltip="Sem atualização recente — o valor na tela pode não ser o valor de hoje"
    >
      <AlertTriangle size={11} />
      {dias === null ? "Nunca atualizado" : `Parado há ${dias} dias`}
    </span>
  );
}

/**
 * Os três meses da média mensal. A média sozinha esconde o mês ruim: 4,5% de
 * média com 6,0 / 5,5 / 2,0 é uma queda, não um patamar.
 */
export function MonthlyBreakdown({
  values,
  target,
  format,
  direction = "cresce",
}: {
  values: (number | null)[];
  target: number;
  format: (v: number) => string;
  /** Em KR de redução (churn, CAC), o mês bom é o que fica ABAIXO da meta. */
  direction?: "cresce" | "reduz";
}) {
  return (
    <div className="flex items-center gap-1.5">
      {values.map((v, i) => {
        const preenchido = v !== null && v !== undefined;
        const bateu = preenchido && (direction === "reduz" ? v <= target : v >= target);
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-xs font-mono tabular-nums px-1.5 py-0.5"
            style={{
              borderRadius: "var(--radius-sm)",
              background: preenchido
                ? bateu
                  ? "var(--sage-soft)"
                  : "var(--peach-soft)"
                : "var(--bg-app)",
              color: preenchido
                ? bateu
                  ? "var(--color-forest)"
                  : "var(--peach-strong)"
                : "var(--text-muted)",
            }}
            data-tooltip={`Mês ${i + 1}${preenchido ? "" : " — sem valor"}`}
          >
            <span style={{ opacity: 0.6 }}>M{i + 1}</span>
            {preenchido ? format(v) : "—"}
          </span>
        );
      })}
    </div>
  );
}
