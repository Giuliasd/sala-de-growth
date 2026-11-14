import type { getQuarterReport } from "@/actions/relatorios";

export type Report = Awaited<ReturnType<typeof getQuarterReport>>;

export const ROLE_LABELS: Record<string, string> = {
  VISITANTE: "Visitante",
  COLABORADOR: "Colaborador",
  LIDERANCA: "Liderança",
};

export const RESULTADO_LABEL: Record<string, string> = {
  SUCESSO: "Sucesso",
  PARCIAL: "Parcial",
  FALHA: "Falha",
};

export const AUSENCIA_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  LICENCA_MEDICA: "Licença médica",
  LICENCA_MATERNIDADE: "Licença maternidade",
  DAY_OFF: "Day Off",
  OUTROS: "Outros",
};

type ReportAusencia = Report["ausencias"][number];

/** Responsáveis de uma entrega em uma linha só; "—" quando não há nenhum. */
export function formatResponsaveis(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "—";
}

/** Agrupa ausências por pessoa (ordem alfabética), somando os dias de cada uma. */
export function groupAusenciasByMember(ausencias: ReportAusencia[]): {
  memberId: string;
  memberName: string;
  totalDias: number;
  items: ReportAusencia[];
}[] {
  const map = new Map<string, { memberId: string; memberName: string; totalDias: number; items: ReportAusencia[] }>();
  for (const a of ausencias) {
    const g = map.get(a.memberId) ?? { memberId: a.memberId, memberName: a.memberName, totalDias: 0, items: [] };
    g.totalDias += a.dias;
    g.items.push(a);
    map.set(a.memberId, g);
  }
  return [...map.values()].sort((a, b) => a.memberName.localeCompare(b.memberName, "pt-BR"));
}

function formatReportDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatValue(value: number, unit: string): string {
  if (unit === "REAL") {
    return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  }
  if (unit === "PORCENTAGEM") {
    return `${value}%`;
  }
  return value.toLocaleString("pt-BR");
}

export function resultadoText(resultado: string | null): string {
  return resultado ? RESULTADO_LABEL[resultado] ?? resultado : "—";
}

/** Agrupa itens por frente, ordenando as frentes alfabeticamente. */
export function groupByFrente<T extends { frente: string }>(
  items: T[],
): { frente: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const arr = map.get(it.frente);
    if (arr) arr.push(it);
    else map.set(it.frente, [it]);
  }
  return [...map.entries()]
    .map(([frente, groupItems]) => ({ frente, items: groupItems }))
    .sort((a, b) => a.frente.localeCompare(b.frente, "pt-BR"));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CELL = 'style="border:1px solid #ccc;padding:6px;"';
const HEAD = 'style="border:1px solid #ccc;padding:6px;text-align:left;"';

/** HTML do relatório completo — colável no Google Docs preservando formatação. */
export function buildReportHtml(report: Report, quarterLabel: string, periodo: string): string {
  const { summary, okrs, entregas, membros } = report;
  const p: string[] = [];

  p.push(`<h1>Relatório de Growth — ${escapeHtml(quarterLabel)}</h1>`);
  if (periodo) p.push(`<p><em>${escapeHtml(periodo)}</em></p>`);

  p.push(`<h2>Resumo geral</h2>`);
  p.push("<ul>");
  p.push(`<li><strong>OKRs:</strong> ${summary.okrCount} · progresso médio ${summary.avgProgress}%</li>`);
  p.push(`<li><strong>Iniciativas:</strong> ${summary.iniTotal} (${summary.iniConcluidas} concluídas)</li>`);
  p.push(`<li><strong>Experimentos:</strong> ${summary.expTotal} (${summary.expConcluidos} concluídos)</li>`);
  p.push(`<li><strong>Entregas concluídas:</strong> ${summary.entregasConcluidas}</li>`);
  p.push(
    `<li><strong>Resultados:</strong> ${summary.resultados.SUCESSO} sucesso · ${summary.resultados.PARCIAL} parcial · ${summary.resultados.FALHA} falha</li>`,
  );
  p.push("</ul>");

  p.push(`<h2>OKRs do quarter</h2>`);
  if (okrs.length === 0) {
    p.push("<p>Nenhum OKR cadastrado neste quarter.</p>");
  } else {
    p.push('<table style="border-collapse:collapse;width:100%;">');
    p.push(
      `<tr><th ${HEAD}>Objetivo</th><th ${HEAD}>Frente</th><th ${HEAD}>Progresso</th><th ${HEAD}>Atual / Meta</th></tr>`,
    );
    okrs.forEach((o) => {
      p.push(
        `<tr><td ${CELL}>${escapeHtml(o.objective)}</td><td ${CELL}>${escapeHtml(o.frente)}</td><td ${CELL}>${o.progressPercent}%</td><td ${CELL}>${escapeHtml(formatValue(o.currentValue, o.unit))} / ${escapeHtml(formatValue(o.targetValue, o.unit))}</td></tr>`,
      );
    });
    p.push("</table>");
  }

  p.push(`<h2>Ações realizadas (entregas concluídas)</h2>`);
  if (entregas.length === 0) {
    p.push("<p>Nenhuma entrega concluída neste quarter.</p>");
  } else {
    groupByFrente(entregas).forEach((g) => {
      p.push(`<h3>${escapeHtml(g.frente)} (${g.items.length})</h3>`);
      p.push('<table style="border-collapse:collapse;width:100%;">');
      p.push(
        `<tr><th ${HEAD}>Entrega</th><th ${HEAD}>Tipo</th><th ${HEAD}>Responsável</th><th ${HEAD}>Resultado</th></tr>`,
      );
      g.items.forEach((e) => {
        p.push(
          `<tr><td ${CELL}>${escapeHtml(e.name)}</td><td ${CELL}>${e.tipo === "iniciativa" ? "Iniciativa" : "Experimento"}</td><td ${CELL}>${escapeHtml(formatResponsaveis(e.memberNames))}</td><td ${CELL}>${escapeHtml(resultadoText(e.resultado))}</td></tr>`,
        );
      });
      p.push("</table>");
    });
  }

  p.push(`<h2>Ausências no quarter</h2>`);
  if (report.ausencias.length === 0) {
    p.push("<p>Nenhuma ausência registrada neste quarter.</p>");
  } else {
    p.push('<table style="border-collapse:collapse;width:100%;">');
    p.push(
      `<tr><th ${HEAD}>Pessoa</th><th ${HEAD}>Tipo</th><th ${HEAD}>Período</th><th ${HEAD}>Duração</th></tr>`,
    );
    groupAusenciasByMember(report.ausencias).forEach((g) => {
      g.items.forEach((a) => {
        p.push(
          `<tr><td ${CELL}>${escapeHtml(g.memberName)}</td><td ${CELL}>${escapeHtml(AUSENCIA_LABEL[a.type] ?? a.type)}</td><td ${CELL}>${formatReportDate(a.startDate)} – ${formatReportDate(a.endDate)}</td><td ${CELL}>${a.dias} dia${a.dias === 1 ? "" : "s"}</td></tr>`,
        );
      });
    });
    p.push("</table>");
  }

  p.push(`<h2>Performance por pessoa</h2>`);
  membros.forEach((m) => {
    p.push(`<h3>${escapeHtml(m.name)} — ${escapeHtml(ROLE_LABELS[m.role] ?? m.role)}</h3>`);
    p.push(
      `<p>${m.iniTotal} iniciativa(s) · ${m.expTotal} experimento(s) · ${m.okrs.length} OKR(s) · <strong>${m.entregasConcluidas} entrega(s) concluída(s)</strong> (${m.resultados.SUCESSO} sucesso, ${m.resultados.PARCIAL} parcial, ${m.resultados.FALHA} falha)</p>`,
    );
    if (m.entregas.length > 0) {
      p.push("<ul>");
      m.entregas.forEach((e) => {
        p.push(
          `<li>${escapeHtml(e.name)} <em>(${e.tipo === "iniciativa" ? "iniciativa" : "experimento"}, ${escapeHtml(e.frente)}${e.resultado ? ` — ${escapeHtml(resultadoText(e.resultado))}` : ""})</em></li>`,
        );
      });
      p.push("</ul>");
    }
    if (m.okrs.length > 0) {
      p.push("<ul>");
      m.okrs.forEach((o) => {
        p.push(`<li>OKR: ${escapeHtml(o.objective)} — ${o.progressPercent}%</li>`);
      });
      p.push("</ul>");
    }
  });

  return `<div>${p.join("")}</div>`;
}

/** Versão texto puro (fallback de clipboard e leitura fora do Docs). */
export function buildReportText(report: Report, quarterLabel: string, periodo: string): string {
  const { summary, okrs, entregas, membros } = report;
  const lines: string[] = [];

  lines.push(`RELATÓRIO DE GROWTH — ${quarterLabel}`);
  if (periodo) lines.push(periodo);
  lines.push("");
  lines.push("RESUMO GERAL");
  lines.push(`- OKRs: ${summary.okrCount} · progresso médio ${summary.avgProgress}%`);
  lines.push(`- Iniciativas: ${summary.iniTotal} (${summary.iniConcluidas} concluídas)`);
  lines.push(`- Experimentos: ${summary.expTotal} (${summary.expConcluidos} concluídos)`);
  lines.push(`- Entregas concluídas: ${summary.entregasConcluidas}`);
  lines.push(
    `- Resultados: ${summary.resultados.SUCESSO} sucesso · ${summary.resultados.PARCIAL} parcial · ${summary.resultados.FALHA} falha`,
  );
  lines.push("");

  lines.push("OKRs DO QUARTER");
  if (okrs.length === 0) lines.push("- Nenhum OKR cadastrado.");
  okrs.forEach((o) => {
    lines.push(
      `- ${o.objective} (${o.frente}) — ${o.progressPercent}% · ${formatValue(o.currentValue, o.unit)} / ${formatValue(o.targetValue, o.unit)}`,
    );
  });
  lines.push("");

  lines.push("AÇÕES REALIZADAS (ENTREGAS CONCLUÍDAS)");
  if (entregas.length === 0) lines.push("- Nenhuma entrega concluída.");
  groupByFrente(entregas).forEach((g) => {
    lines.push("");
    lines.push(`${g.frente} (${g.items.length})`);
    g.items.forEach((e) => {
      lines.push(
        `  - ${e.name} [${e.tipo === "iniciativa" ? "Iniciativa" : "Experimento"}] · ${formatResponsaveis(e.memberNames)} · ${resultadoText(e.resultado)}`,
      );
    });
  });
  lines.push("");

  lines.push("AUSÊNCIAS NO QUARTER");
  if (report.ausencias.length === 0) lines.push("- Nenhuma ausência registrada.");
  groupAusenciasByMember(report.ausencias).forEach((g) => {
    lines.push(`- ${g.memberName} (${g.totalDias} dia${g.totalDias === 1 ? "" : "s"} no total):`);
    g.items.forEach((a) => {
      lines.push(
        `  • ${AUSENCIA_LABEL[a.type] ?? a.type} · ${formatReportDate(a.startDate)} – ${formatReportDate(a.endDate)} · ${a.dias} dia${a.dias === 1 ? "" : "s"}`,
      );
    });
  });
  lines.push("");

  lines.push("PERFORMANCE POR PESSOA");
  membros.forEach((m) => {
    lines.push("");
    lines.push(`${m.name} — ${ROLE_LABELS[m.role] ?? m.role}`);
    lines.push(
      `  ${m.iniTotal} iniciativa(s) · ${m.expTotal} experimento(s) · ${m.okrs.length} OKR(s) · ${m.entregasConcluidas} entrega(s) concluída(s)`,
    );
    m.entregas.forEach((e) => {
      lines.push(`  • ${e.name} (${e.tipo}, ${e.frente}${e.resultado ? ` — ${resultadoText(e.resultado)}` : ""})`);
    });
    m.okrs.forEach((o) => {
      lines.push(`  • OKR: ${o.objective} — ${o.progressPercent}%`);
    });
  });

  return lines.join("\n");
}
