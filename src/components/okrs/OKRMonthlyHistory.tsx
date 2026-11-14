"use client";

import { Clock, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatOKRValue } from "./OKRCard";
import { quarterWeekCount, weeklySeriesFromUpdates } from "@/lib/okr";
import { OKRUnit } from "@/generated/prisma/enums";
import { OKRUpdateMeta } from "./OKRUpdateMeta";
import {
  CHART_FONT,
  formatDiaCurto,
  formatEixoY,
  margemEsquerda,
  ticksUnicos,
  useLarguraDoContainer,
} from "./chart-utils";
import {
  CursorTooltip,
  TooltipLine,
  TooltipTitle,
  useCursorTooltip,
} from "@/components/shared/CursorTooltip";

/**
 * Histórico de um KR de média mensal.
 *
 * A média esconde o que interessa: "4,5% → 4,2%" não diz qual mês mudou nem
 * como cada mês se comportou. Aqui o eixo é o **tempo em semanas do quarter** e
 * cada ponto é o valor do mês que foi mexido — valores independentes, nunca a
 * média. Abaixo, a lista de alterações diz qual mês mudou em cada atualização.
 */

export type MonthlyEntry = {
  id: string;
  previousValue: number;
  newValue: number;
  monthValue1: number | null;
  monthValue2: number | null;
  monthValue3: number | null;
  date: Date | string;
  member: { name: string };
  note?: string | null;
  porNaoResponsavel?: boolean;
  podeApagar?: boolean;
};

type TipData = {
  semana: number;
  mes: number | null;
  valor: number;
  data: Date | string;
  bateu: boolean;
};

const MESES = [1, 2, 3] as const;

function mesesDe(e: MonthlyEntry): (number | null)[] {
  return [e.monthValue1, e.monthValue2, e.monthValue3];
}

/** Linhas antigas (antes do snapshot por mês) não têm o que comparar. */
function temSnapshot(e: MonthlyEntry): boolean {
  return mesesDe(e).some((v) => v !== null && v !== undefined);
}

/**
 * Linha por semana do quarter. O eixo X é o quarter inteiro (não só as semanas
 * com atualização), senão duas atualizações seguidas parecem cobrir o trimestre.
 */
function WeeklyLineChart({
  history,
  quarterStart,
  quarterEnd,
  target,
  unit,
  direction,
}: {
  history: MonthlyEntry[];
  quarterStart: Date | string;
  quarterEnd: Date | string;
  target: number;
  unit: OKRUnit;
  direction: "cresce" | "reduz";
}) {
  const { ref, largura: W } = useLarguraDoContainer();
  const { tip, bind } = useCursorTooltip<TipData>();

  const pontos = weeklySeriesFromUpdates(history, quarterStart);
  const semanas = quarterWeekCount(quarterStart, quarterEnd);

  const valores = pontos.map((p) => p.value);
  const minV = Math.min(target, ...valores);
  const maxV = Math.max(target, ...valores);
  const flat = maxV === minV;
  const spanV = flat ? 1 : maxV - minV;

  const rotuloY = (v: number) => formatEixoY(v, unit);
  // Faixa curta (2,9 a 3,0) fazia dois ticks virarem o mesmo "3%" na tela.
  const yTicks = ticksUnicos(flat ? [minV] : [minV, minV + spanV / 2, maxV], rotuloY);

  const H = 176;
  const pad = { top: 18, right: 14, bottom: 26, left: margemEsquerda(yTicks.map(rotuloY)) };
  const innerW = Math.max(W - pad.left - pad.right, 1);
  const innerH = H - pad.top - pad.bottom;

  const x = (week: number) =>
    pad.left + ((week - 1) / Math.max(1, semanas - 1)) * innerW;
  const y = (v: number) =>
    flat ? pad.top + innerH / 2 : pad.top + innerH - ((v - minV) / spanV) * innerH;

  const linePath = pontos
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.week).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  // Rótulos de semana de 2 em 2 num quarter de 13 — todos ficariam ilegíveis.
  const passo = semanas > 8 ? 2 : 1;
  const semanasRotuladas = Array.from({ length: semanas }, (_, i) => i + 1).filter(
    (s) => s === 1 || s === semanas || (s - 1) % passo === 0
  );

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Valores por semana do quarter"
        style={{ display: "block" }}
      >
        {yTicks.map((tick, i) => (
          <g key={`y-${i}`}>
            <line
              x1={pad.left}
              y1={y(tick)}
              x2={W - pad.right}
              y2={y(tick)}
              stroke="var(--border-subtle)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text
              x={pad.left - 8}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize={CHART_FONT}
              fill="var(--text-muted)"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {rotuloY(tick)}
            </text>
          </g>
        ))}

        {/* Meta: a régua de cada mês. Fica acima da linha porque cruzar a meta é a
            leitura principal do gráfico. */}
        <line
          x1={pad.left}
          y1={y(target)}
          x2={W - pad.right}
          y2={y(target)}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <text
          x={W - pad.right}
          y={y(target) - 5}
          textAnchor="end"
          fontSize={CHART_FONT}
          fill="var(--text-muted)"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          meta {rotuloY(target)}
        </text>

        {pontos.length >= 2 && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {pontos.map((p) => {
          const bateu = direction === "reduz" ? p.value <= target : p.value >= target;
          return (
            <g key={`p-${p.week}`}>
              <circle
                cx={x(p.week)}
                cy={y(p.value)}
                r={3}
                fill={bateu ? "var(--color-forest)" : "var(--peach-strong)"}
                stroke="var(--bg-app)"
                strokeWidth={1.5}
              />
              <circle
                cx={x(p.week)}
                cy={y(p.value)}
                r={10}
                fill="transparent"
                {...bind({ semana: p.week, mes: p.month ?? null, valor: p.value, data: p.date, bateu })}
              />
            </g>
          );
        })}

        {semanasRotuladas.map((s) => (
          <text
            key={`x-${s}`}
            x={x(s)}
            y={H - pad.bottom + 16}
            textAnchor={s === 1 ? "start" : s === semanas ? "end" : "middle"}
            fontSize={CHART_FONT}
            fill="var(--text-muted)"
          >
            S{s}
          </text>
        ))}
      </svg>

      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>{formatOKRValue(tip.data.valor, unit)}</TooltipTitle>
          <TooltipLine>
            Semana {tip.data.semana}
            {tip.data.mes ? ` · Mês ${tip.data.mes}` : ""}
          </TooltipLine>
          <TooltipLine dim>
            {formatDiaCurto(tip.data.data)} · {tip.data.bateu ? "meta batida" : "abaixo da meta"}
          </TooltipLine>
        </CursorTooltip>
      )}
    </div>
  );
}

export function OKRMonthlyHistory({
  history,
  target,
  unit,
  direction,
  quarterStart,
  quarterEnd,
  onDelete,
}: {
  /** Mais novo primeiro, como vem de `getOKRHistory`. */
  history: MonthlyEntry[];
  target: number;
  unit: OKRUnit;
  direction: "cresce" | "reduz";
  quarterStart: Date | string;
  quarterEnd: Date | string;
  /** Pede para apagar a atualização; a confirmação é de quem renderiza. */
  onDelete?: (id: string) => void;
}) {
  const temPontos = history.length > 0;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-xs font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
        Valores por semana
      </p>

      {temPontos ? (
        <WeeklyLineChart
          history={history}
          quarterStart={quarterStart}
          quarterEnd={quarterEnd}
          target={target}
          unit={unit}
          direction={direction}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: "var(--text-muted)" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nenhuma atualização registrada ainda.
          </p>
        </div>
      )}

      {temPontos && (
        <>
          <p
            className="text-xs font-semibold mt-5 mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Alterações
          </p>
          <ul className="space-y-3">
            {history.map((entry, idx) => {
              // Compara com a atualização anterior (o próximo item da lista,
              // que vem em ordem decrescente) para dizer o mês que mexeu.
              const anterior = history[idx + 1];
              const atual = mesesDe(entry);
              const antes = anterior && temSnapshot(anterior) ? mesesDe(anterior) : null;

              const mudancas = temSnapshot(entry)
                ? MESES.map((m, i) => ({
                    mes: m,
                    de: antes ? antes[i] : null,
                    para: atual[i],
                  })).filter((c) => c.para !== c.de && c.para !== null && c.para !== undefined)
                : [];

              return (
                <li key={entry.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {mudancas.length > 0 ? (
                      mudancas.map((c) => {
                        const delta = c.de === null ? null : (c.para as number) - c.de;
                        const cor =
                          delta === null || delta === 0
                            ? "var(--text-muted)"
                            : delta > 0
                            ? "var(--progress-high)"
                            : "var(--progress-low)";
                        const Icon =
                          delta === null || delta === 0
                            ? Minus
                            : delta > 0
                            ? TrendingUp
                            : TrendingDown;
                        return (
                          <span
                            key={c.mes}
                            className="inline-flex items-center gap-1 font-mono tabular-nums px-1.5 py-0.5"
                            style={{
                              borderRadius: "var(--radius-sm)",
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-subtle)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <span style={{ opacity: 0.6 }}>M{c.mes}</span>
                            {c.de !== null && (
                              <>
                                {formatOKRValue(c.de, unit)}
                                <Icon size={10} style={{ color: cor }} />
                              </>
                            )}
                            {formatOKRValue(c.para as number, unit)}
                          </span>
                        );
                      })
                    ) : (
                      // Linhas gravadas antes do snapshot por mês só têm a média.
                      <span
                        className="font-mono tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        média {formatOKRValue(entry.previousValue, unit)} →{" "}
                        {formatOKRValue(entry.newValue, unit)}
                      </span>
                    )}
                  </div>
                  <OKRUpdateMeta entry={entry} onDelete={onDelete} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
