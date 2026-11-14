"use client";

import {
  useCursorTooltip,
  CursorTooltip,
  TooltipTitle,
  TooltipLine,
} from "@/components/shared/CursorTooltip";

export type ChipMember = { id: string; name: string };

/**
 * Responsáveis de um item, como pilha de chips.
 *
 * Iniciativa, experimento e checkpoint têm N responsáveis, todos com o mesmo
 * peso. Este é o jeito canônico de mostrar isso: até `max` chips com o primeiro
 * nome e, se sobrar gente, um chip "+N" que abre o tooltip com a lista inteira.
 * O truncamento é o que mantém o padrão utilizável em linha de tabela e card
 * compacto — não aumente `max` sem olhar o layout mais apertado que o usa.
 *
 * Não recrie a pilha localmente nem volte a renderizar só o primeiro nome: um
 * item com 3 donos mostrando 1 é informação errada, não resumo.
 */
export function MemberChips({
  members,
  max = 2,
  emptyLabel,
  tooltipTitle,
}: {
  members: ChipMember[];
  /** Quantos chips nominais antes de agrupar o resto em "+N". */
  max?: number;
  /** Texto quando não há responsável. Omitir para não renderizar nada. */
  emptyLabel?: string;
  /**
   * Título do tooltip. Só mude quando `members` já não for a lista completa —
   * ex.: a coluna da tabela mostra o primeiro fora do componente e passa
   * apenas o resto, então "Responsáveis" mentiria sobre o que está listado.
   */
  tooltipTitle?: string;
}) {
  const { tip, bind } = useCursorTooltip<ChipMember[]>();

  if (members.length === 0) {
    return emptyLabel ? (
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {emptyLabel}
      </span>
    ) : null;
  }

  const shown = members.slice(0, max);
  const hidden = members.slice(max);

  return (
    <>
      <span className="inline-flex items-center gap-1 min-w-0">
        {shown.map((m) => (
          <Chip key={m.id} label={m.name.split(" ")[0]} />
        ))}
        {hidden.length > 0 && (
          <span {...bind(members)}>
            <Chip label={`+${hidden.length}`} />
          </span>
        )}
      </span>

      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>
            {tooltipTitle ?? (tip.data.length === 1 ? "Responsável" : "Responsáveis")}
          </TooltipTitle>
          {tip.data.map((m) => (
            <TooltipLine key={m.id}>{m.name}</TooltipLine>
          ))}
        </CursorTooltip>
      )}
    </>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 shrink-0"
      style={{
        background: "var(--accent-subtle)",
        color: "var(--brand-primary)",
        borderRadius: "var(--radius-full)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Mesma lista, em texto puro — para onde não cabe chip (célula densa de tabela,
 * exportação, título acessível).
 *
 * A implementação mora em `lib/members` porque ESTE arquivo é "use client", e
 * componente de servidor não pode chamar função exportada por módulo cliente.
 * O reexport mantém os call sites antigos funcionando.
 */
export { formatMemberNames, formatMemberFirstNames } from "@/lib/members";
