"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Pill de filtro — o botão liga/desliga das barras de filtro (ex.: "Ocultar
 * concluídos", "Apenas comunicações", uma tag, uma pessoa).
 *
 * Regra do design system: **todas as pills de uma barra têm a mesma caixa** —
 * text-xs, px-2 py-1, borda de 1px e raio cheio (25px de altura). O que muda
 * de uma para outra é só a COR. Antes cada tipo tinha o próprio padding e a
 * barra dos checkpoints ficou com três alturas lado a lado (a de tag mais
 * baixa, a de pessoa mais baixa ainda). Não recrie a pill com classes locais:
 * use esta, passando as cores.
 *
 * `colors` pinta a pill (tag, categoria). Sem ele: neutra quando inativa e
 * verde da marca quando ativa. `dimmed` esmaece as não escolhidas quando o
 * grupo já tem alguma escolhida.
 */
export function FilterPill({
  active,
  onClick,
  children,
  icon,
  colors,
  activeRing = false,
  dimmed = false,
  ariaLabel,
  className = "",
  style,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Ícone ou avatar à esquerda do texto (até 16px, para não mudar a altura). */
  icon?: ReactNode;
  /**
   * Cores próprias da pill. `always` = pintada ligada ou desligada (tag, que se
   * reconhece pela cor); senão só quando ativa (categoria).
   */
  colors?: { bg: string; text: string; border: string; always?: boolean };
  /** Marca o ativo com um anel da marca — para pills que já são coloridas. */
  activeRing?: boolean;
  dimmed?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const pintada = colors && (colors.always || active);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`text-xs leading-4 font-medium px-2 py-1 inline-flex items-center gap-1 shrink-0 transition-colors ${className}`}
      style={{
        borderRadius: "var(--radius-full)",
        border: `1px solid ${
          pintada ? colors.border : active ? "var(--color-forest)" : "var(--border-default)"
        }`,
        background: pintada ? colors.bg : active ? "var(--sage-soft)" : "var(--bg-surface)",
        color: pintada ? colors.text : active ? "var(--color-forest)" : "var(--text-secondary)",
        outline: activeRing && active ? "2px solid var(--brand-primary)" : "none",
        outlineOffset: 1,
        opacity: dimmed ? 0.5 : 1,
        cursor: "pointer",
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
