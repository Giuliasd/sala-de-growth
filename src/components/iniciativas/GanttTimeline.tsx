// Pure presentational component — no state, no interactivity.

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

interface GanttTimelineProps {
  rangeStart: Date;
  rangeEnd: Date;
  pixelsPerDay: number;
  totalDays: number;
  /**
   * Fins de quarter dentro do range, já em pixels. Viram divisória tracejada
   * com rótulo — a mesma marca que o calendário mensal usa no último dia do
   * trimestre, para as três visões contarem a mesma história.
   */
  quarterEnds?: { id: string; label: string; leftPx: number }[];
  /**
   * Faixas nomeadas no cabeçalho (hoje: travas de férias). Quem desenha o corpo
   * repete a faixa nas linhas; aqui fica só o rótulo, para não repetir o nome
   * em cada linha do gráfico.
   */
  bands?: { id: string; label: string; leftPx: number; widthPx: number }[];
}

export function GanttTimeline({
  rangeStart,
  rangeEnd,
  pixelsPerDay,
  totalDays,
  quarterEnds = [],
  bands = [],
}: GanttTimelineProps) {
  const ganttWidth = totalDays * pixelsPerDay;

  // ── Month segments ──────────────────────────────────────────────
  const months: { label: string; leftPx: number; widthPx: number }[] = [];
  let cur = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
  while (cur <= rangeEnd) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const visStart = cur < rangeStart ? rangeStart : cur;
    const visEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    const leftPx = diffDays(visStart, rangeStart) * pixelsPerDay;
    const widthPx = (diffDays(visEnd, visStart) + 1) * pixelsPerDay;
    const label = cur.toLocaleDateString("pt-BR", {
      month: "long",
      timeZone: "UTC",
    });
    months.push({ label: label.charAt(0).toUpperCase() + label.slice(1), leftPx, widthPx });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }

  // ── Week markers (Mondays) ──────────────────────────────────────
  const weeks: { leftPx: number; label: string; widthPx: number }[] = [];
  let weekCur = new Date(rangeStart);
  const dow = weekCur.getUTCDay();
  if (dow !== 1) {
    weekCur = addDays(weekCur, dow === 0 ? 1 : 8 - dow);
  }
  while (weekCur <= rangeEnd) {
    // A última semana costuma ser parcial: com 7 dias fixos ela ultrapassava o
    // fim do range, esticando a área de rolagem além do gráfico — sobrava uma
    // faixa vazia no fim, sem fundo nem divisórias de linha.
    const diasRestantes = diffDays(rangeEnd, weekCur) + 1;
    weeks.push({
      leftPx: diffDays(weekCur, rangeStart) * pixelsPerDay,
      label: weekCur.getUTCDate().toString(),
      widthPx: Math.min(7, diasRestantes) * pixelsPerDay,
    });
    weekCur = addDays(weekCur, 7);
  }

  return (
    <div
      className="relative select-none"
      style={{ width: ganttWidth, height: 56 }}
    >
      {/* Month row (top half) */}
      {months.map((m, i) => (
        <div
          key={i}
          className="absolute top-0 flex items-center overflow-hidden"
          style={{
            left: m.leftPx,
            width: m.widthPx,
            height: 28,
            background: "var(--bg-app)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="px-2 text-xs font-semibold truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            {m.label}
          </span>
        </div>
      ))}

      {/* Week row (bottom half) */}
      {weeks.map((w, i) => (
        <div
          key={i}
          className="absolute bottom-0"
          style={{
            left: w.leftPx,
            width: w.widthPx,
            height: 28,
            borderRight: "1px solid var(--border-subtle)",
            opacity: 0.6,
          }}
        >
          <span
            className="absolute left-1 top-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {w.label}
          </span>
        </div>
      ))}

      {/* Faixas nomeadas (travas de férias) */}
      {bands.map((b) => (
        <div
          key={b.id}
          className="absolute top-0 flex items-center overflow-hidden"
          style={{
            left: b.leftPx,
            width: b.widthPx,
            height: 28,
            background: "var(--blush-soft)",
            borderLeft: "2px solid var(--blush)",
            borderRight: "2px solid var(--blush)",
            zIndex: 3,
          }}
        >
          <span
            className="px-1 text-[10px] font-semibold uppercase tracking-wide truncate"
            style={{ color: "var(--blush-strong)" }}
          >
            {b.label}
          </span>
        </div>
      ))}

      {/* Fim de quarter */}
      {quarterEnds.map((q) => (
        <div
          key={q.id}
          className="absolute top-0 bottom-0 flex items-end"
          style={{ left: q.leftPx, borderLeft: "2px dashed var(--peach)", zIndex: 2 }}
        >
          {/* Rótulo na base da faixa de semanas: no topo ele caía exatamente
              sobre o nome do mês, já que o fim do quarter é uma virada de mês. */}
          <span
            className="text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap pl-1"
            style={{ color: "var(--peach-strong)", lineHeight: "12px", paddingBottom: 2 }}
          >
            Fim {q.label}
          </span>
        </div>
      ))}

      {/* Divider lines */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: "var(--border-subtle)" }} />
      <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "var(--border-subtle)" }} />
      <div className="absolute left-0 right-0 h-px" style={{ top: 28, background: "var(--border-subtle)" }} />
    </div>
  );
}
