"use client";

import { useEffect, useId, useState } from "react";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";
import { getOKRHistory, deleteOKRUpdate } from "@/actions/okrs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatOKRValue } from "./OKRCard";
import { OKRUnit } from "@/generated/prisma/enums";
import { OKRMonthlyHistory } from "./OKRMonthlyHistory";
import { OKRUpdateMeta } from "./OKRUpdateMeta";
import {
  CHART_FONT,
  formatDiaCurto,
  formatDiaHora,
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

type HistoryEntry = {
  id: string;
  previousValue: number;
  newValue: number;
  monthValue1: number | null;
  monthValue2: number | null;
  monthValue3: number | null;
  date: Date | string;
  member: { name: string };
  note: string | null;
  porNaoResponsavel: boolean;
  podeApagar: boolean;
};

type TipData = { valor: number; delta: number; quando: number; quem: string };

// Gráfico de evolução do OKR: eixo X = data de atualização, eixo Y = valor registrado.
function HistoryChart({ history, unit }: { history: HistoryEntry[]; unit: OKRUnit }) {
  const { ref, largura: W } = useLarguraDoContainer();
  const { tip, bind } = useCursorTooltip<TipData>();
  const gradId = useId();

  const points = history
    .map((h) => ({
      t: new Date(h.date as any).getTime(),
      v: h.newValue,
      delta: h.newValue - h.previousValue,
      quem: h.member.name,
    }))
    .sort((a, b) => a.t - b.t);

  const values = points.map((p) => p.v);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const flat = maxV === minV;
  const spanV = flat ? 1 : maxV - minV;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const spanT = maxT - minT || 1;

  const rotuloY = (v: number) => formatEixoY(v, unit);
  const yTicks = ticksUnicos(flat ? [minV] : [minV, minV + spanV / 2, maxV], rotuloY);

  const H = 168;
  const pad = {
    top: 14,
    right: 14,
    bottom: 28,
    left: margemEsquerda(yTicks.map(rotuloY)),
  };
  const innerW = Math.max(W - pad.left - pad.right, 1);
  const innerH = H - pad.top - pad.bottom;

  const x = (t: number) =>
    points.length === 1 ? pad.left + innerW / 2 : pad.left + ((t - minT) / spanT) * innerW;
  const y = (v: number) =>
    flat ? pad.top + innerH / 2 : pad.top + innerH - ((v - minV) / spanV) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ");
  const baseY = pad.top + innerH;
  const areaPath = `${linePath} L ${x(points[points.length - 1].t).toFixed(1)} ${baseY} L ${x(points[0].t).toFixed(1)} ${baseY} Z`;

  // Rótulos do eixo X: sempre extremos + o do meio, mas descartando os que ficariam
  // sobrepostos (as datas são escaladas por tempo, então podem se agrupar).
  const MIN_LABEL_GAP = 56;
  const candidates =
    points.length <= 2
      ? points.map((_, i) => i)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xIdx: number[] = [];
  candidates.forEach((i) => {
    const isEnd = i === 0 || i === points.length - 1;
    const px = x(points[i].t);
    const tooClose = xIdx.some((j) => Math.abs(x(points[j].t) - px) < MIN_LABEL_GAP);
    if (isEnd || !tooClose) xIdx.push(i);
  });

  const ultimo = points.length - 1;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label="Evolução do valor do KR" style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {yTicks.map((tick, i) => {
          const yy = y(tick);
          return (
            <g key={`y-${i}`}>
              <line
                x1={pad.left}
                y1={yy}
                x2={W - pad.right}
                y2={yy}
                stroke="var(--border-subtle)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text
                x={pad.left - 8}
                y={yy + 3}
                textAnchor="end"
                fontSize={CHART_FONT}
                fill="var(--text-muted)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {rotuloY(tick)}
              </text>
            </g>
          );
        })}

        {points.length >= 2 && <path d={areaPath} fill={`url(#${gradId})`} />}
        <path
          d={linePath}
          fill="none"
          stroke="var(--brand-primary)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <g key={`p-${i}`}>
            {i === ultimo && (
              <circle cx={x(p.t)} cy={y(p.v)} r={7} fill="var(--brand-primary)" opacity={0.16} />
            )}
            <circle
              cx={x(p.t)}
              cy={y(p.v)}
              r={i === ultimo ? 3.5 : 2.5}
              fill="var(--brand-primary)"
              stroke="var(--bg-app)"
              strokeWidth={1.5}
            />
            {/* Alvo de hover maior que o ponto, para não exigir pontaria. */}
            <circle
              cx={x(p.t)}
              cy={y(p.v)}
              r={10}
              fill="transparent"
              {...bind({ valor: p.v, delta: p.delta, quando: p.t, quem: p.quem })}
            />
          </g>
        ))}

        {xIdx.map((i) => (
          <text
            key={`x-${i}`}
            x={x(points[i].t)}
            y={H - pad.bottom + 17}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize={CHART_FONT}
            fill="var(--text-muted)"
          >
            {formatDiaCurto(new Date(points[i].t))}
          </text>
        ))}
      </svg>

      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>{formatOKRValue(tip.data.valor, unit)}</TooltipTitle>
          <TooltipLine>{formatDiaHora(tip.data.quando)}</TooltipLine>
          <TooltipLine dim>
            {tip.data.quem}
            {tip.data.delta !== 0 &&
              ` · ${tip.data.delta > 0 ? "+" : "−"}${formatOKRValue(Math.abs(tip.data.delta), unit)}`}
          </TooltipLine>
        </CursorTooltip>
      )}
    </div>
  );
}

/**
 * Histórico do KR. Em média mensal o eixo do tempo não ajuda — o que se quer
 * ver é cada mês por si, então aí quem desenha é `OKRMonthlyHistory`.
 */
export function OKRHistory({
  okrId,
  unit,
  monthly,
}: {
  okrId: string;
  unit: OKRUnit;
  /** Presente só em KR de média mensal. */
  monthly?: {
    target: number;
    direction: "cresce" | "reduz";
    quarterStart: Date | string;
    quarterEnd: Date | string;
  };
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    getOKRHistory(okrId)
      .then((data) => setHistory(data as HistoryEntry[]))
      .finally(() => setLoading(false));
  }, [okrId]);

  async function confirmarApagar() {
    const id = apagandoId;
    setApagandoId(null);
    if (!id) return;
    setErroApagar(null);
    const res = await deleteOKRUpdate(id);
    if (!res.success) {
      setErroApagar(res.error);
      return;
    }
    setHistory((await getOKRHistory(okrId)) as HistoryEntry[]);
  }

  const aoApagar = (id: string) => {
    setErroApagar(null);
    setApagandoId(id);
  };

  const feedback = (
    <>
      {erroApagar && (
        <p
          className="text-xs mt-3 px-3 py-2"
          style={{
            borderRadius: "var(--radius-md)",
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
          }}
        >
          {erroApagar}
        </p>
      )}
      {apagandoId && (
        <ConfirmDialog
          title="Apagar atualização"
          message="Tem certeza que deseja apagar esta atualização? O valor do KR volta ao da atualização anterior. Esta ação não pode ser desfeita."
          confirmLabel="Apagar"
          onConfirm={confirmarApagar}
          onCancel={() => setApagandoId(null)}
        />
      )}
    </>
  );

  if (loading) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Carregando histórico...
        </p>
      </div>
    );
  }

  if (monthly) {
    return (
      <>
        <OKRMonthlyHistory
          history={history}
          target={monthly.target}
          unit={unit}
          direction={monthly.direction}
          quarterStart={monthly.quarterStart}
          quarterEnd={monthly.quarterEnd}
          onDelete={aoApagar}
        />
        {feedback}
      </>
    );
  }

  if (history.length === 0) {
    return (
      <div
        className="rounded-xl p-4 flex items-center gap-2"
        style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
      >
        <Clock size={14} style={{ color: "var(--text-muted)" }} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Nenhuma atualização registrada ainda.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-xs font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
        Histórico de Atualizações
      </p>

      {/* Gráfico de evolução (eixo X = data de atualização) */}
      {history.length >= 2 && (
        <div className="mb-5">
          <HistoryChart history={history} unit={unit} />
        </div>
      )}

      {/* Timeline */}
      <ul className="relative space-y-0">
        {/* Vertical line */}
        <div
          className="absolute left-[7px] top-2 bottom-2 w-px"
          style={{ background: "var(--border-default)" }}
        />

        {history.map((entry, idx) => {
          const delta = entry.newValue - entry.previousValue;
          const isUp = delta > 0;
          const isNeutral = delta === 0;

          const dotColor = isNeutral
            ? "var(--text-muted)"
            : isUp
            ? "var(--progress-high)"
            : "var(--progress-low)";

          return (
            <li key={entry.id} className="flex items-start gap-3 pb-4 last:pb-0">
              {/* Dot */}
              <div
                className="shrink-0 mt-0.5 flex items-center justify-center z-10"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "var(--radius-full)",
                  background: dotColor,
                  boxShadow: `0 0 0 3px var(--bg-app)`,
                }}
              >
                {isUp ? (
                  <TrendingUp size={9} color="white" strokeWidth={2.5} />
                ) : isNeutral ? null : (
                  <TrendingDown size={9} color="white" strokeWidth={2.5} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs font-medium font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {formatOKRValue(entry.previousValue, unit)} → {formatOKRValue(entry.newValue, unit)}
                  </span>
                  <span
                    className="text-xs font-semibold font-mono tabular-nums"
                    style={{ color: isNeutral ? "var(--text-muted)" : dotColor }}
                  >
                    ({isUp ? "+" : ""}{formatOKRValue(delta % 1 === 0 ? delta : Number(delta.toFixed(1)), unit)})
                  </span>
                </div>
                <OKRUpdateMeta entry={entry} onDelete={aoApagar} />
              </div>
            </li>
          );
        })}
      </ul>
      {feedback}
    </div>
  );
}
