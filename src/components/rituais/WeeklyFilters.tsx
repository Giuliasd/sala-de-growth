"use client";

import { useRouter } from "next/navigation";
import { MultiSelect } from "@/components/shared/MultiSelect";

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };

export type WeekOption = {
  /** Segunda-feira da semana, em ISO (yyyy-mm-dd). É o valor que vai na URL. */
  value: string;
  label: string;
};

/**
 * Filtros da Weekly: quarter, mês e semana.
 *
 * A Weekly sempre mostrou a semana corrente e só ela — não dava para olhar o
 * que vem na próxima nem revisar a passada. Os três se encaixam: o quarter
 * recorta os meses, o mês recorta as semanas, e a semana é o que a visão
 * exibe. Trocar um filtro de cima zera os de baixo, que a página reescolhe
 * pelo "hoje" ou pelo começo do período.
 *
 * Os três usam o gatilho compacto das barras de filtro de /iniciativas e
 * /experimentos — é uma barra de filtros, não o seletor de contexto da página.
 */
export function WeeklyFilters({
  quarters,
  selectedQuarterId,
  months,
  selectedMonth,
  weekForMonth,
  weeks,
  selectedWeek,
  currentWeek,
}: {
  quarters: QuarterItem[];
  selectedQuarterId: string;
  /** Meses do quarter — recortam a lista de semanas. */
  months: { value: string; label: string }[];
  selectedMonth: string;
  /** Semana em que cada mês abre — vai na URL junto com o mês. */
  weekForMonth: Record<string, string | undefined>;
  weeks: WeekOption[];
  selectedWeek: string;
  /** Segunda-feira da semana de hoje — o default da visão. */
  currentWeek: string;
}) {
  const router = useRouter();
  const foraDaSemanaAtual = selectedWeek !== currentWeek;

  function navegar(params: Record<string, string | undefined>) {
    const search = new URLSearchParams({ view: "weekly" });
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
    router.push(`/rituais?${search.toString()}`);
  }

  return (
    <>
      {quarters.length > 0 && (
        <MultiSelect
          single
          label="Quarter"
          selected={selectedQuarterId ? [selectedQuarterId] : []}
          // Trocar de quarter cai no primeiro mês dele — a semana atual quase
          // nunca existe no quarter que se acabou de escolher.
          onChange={(next) => navegar({ quarter: next[0] })}
          options={quarters.map((q) => ({
            value: q.id,
            label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
          }))}
        />
      )}

      {months.length > 0 && (
        <MultiSelect
          single
          label="Mês"
          selected={selectedMonth ? [selectedMonth] : []}
          // Sem a semana, a página ignora o mês e volta para o de hoje.
          onChange={(next) =>
            navegar({
              quarter: selectedQuarterId,
              month: next[0],
              week: next[0] ? weekForMonth[next[0]] : undefined,
            })
          }
          options={months}
        />
      )}

      {weeks.length > 0 && (
        <MultiSelect
          single
          label="Semana"
          selected={selectedWeek ? [selectedWeek] : []}
          onChange={(next) =>
            navegar({ quarter: selectedQuarterId, month: selectedMonth, week: next[0] })
          }
          options={weeks.map((w) =>
            w.value === currentWeek ? { ...w, label: `${w.label} · atual` } : w
          )}
        />
      )}

      {foraDaSemanaAtual && (
        // Volta para o default com um clique — sem ele, reencontrar a semana de
        // hoje exigia lembrar em que mês ela cai.
        <button
          type="button"
          onClick={() => navegar({})}
          className="text-xs px-2.5 py-1.5"
          style={{
            background: "var(--bg-app)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          data-tooltip="Voltar para a semana atual"
        >
          Semana atual
        </button>
      )}
    </>
  );
}
