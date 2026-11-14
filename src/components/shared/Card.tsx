import { forwardRef, HTMLAttributes } from "react";

/** Espaçamento interno da superfície. `compact` é para listas densas. */
export type CardDensity = "default" | "compact";

const DENSITY_PADDING: Record<CardDensity, string> = {
  default: "20px 24px",
  compact: "12px",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding interno (número em px ou string CSS). Vence `density` se informado. */
  padding?: number | string;
  /**
   * Densidade do espaçamento. `default` é o card de sempre (métricas, destaques);
   * `compact` é para contexto de lista densa — painel de checkpoints, roadmap —
   * onde o padding de 24px empurrava o conteúdo principal para baixo da dobra.
   */
  density?: CardDensity;
  /** Se true, ganha hover que "levanta" o card (útil em listas clicáveis). */
  interactive?: boolean;
}

// Superfície padrão do app: fundo + borda + sombra + cantos, via tokens.
// Substitui o objeto de estilo recopiado em OKRCard, WeeklyActivity, Perfil, etc.
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding, density = "default", interactive = false, className = "", style, children, ...props }, ref) => {
    // `padding` explícito continua mandando — nenhum uso existente muda.
    const resolvedPadding = padding ?? DENSITY_PADDING[density];
    return (
      <div
        ref={ref}
        className={`${interactive ? "u-transition u-hover-raise" : ""} ${className}`.trim()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: resolvedPadding,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
