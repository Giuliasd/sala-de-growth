import type { LucideIcon } from "lucide-react";
import { Info, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Aviso/callout canônico do produto. Uma faixa suave, coesa com os badges de
 * status: fundo na variante `-soft` da família + texto/ícone na `-strong`
 * (o par legível nos dois temas) + borda fina no tom da família — sem o
 * contorno escuro que destoava dos avisos antigos.
 *
 * Variantes semânticas (mesma paleta do design system):
 * - `info`    → sky   (informação neutra)
 * - `warning` → butter (atenção / ação necessária)
 * - `danger`  → blush (erro / bloqueio)
 * - `success` → sage  (tudo certo / confirmação)
 *
 * Anatomia: ícone (topo) → [título opcional + corpo] → slot `action` (ex.: um
 * chevron de colapso). Passe `title` para o cabeçalho em negrito, `children`
 * para o corpo, ou só `children` para um aviso de uma linha.
 *
 * Não recrie faixas de aviso locais; use este componente.
 */
export type AlertVariant = "info" | "warning" | "danger" | "success";

type VariantStyle = {
  bg: string;
  fg: string;
  border: string;
  icon: LucideIcon;
};

const VARIANTS: Record<AlertVariant, VariantStyle> = {
  info:    { bg: "var(--sky-soft)",    fg: "var(--sky-strong)",       border: "var(--sky)",    icon: Info },
  warning: { bg: "var(--butter-soft)", fg: "var(--butter-strong)",    border: "var(--butter)", icon: AlertTriangle },
  danger:  { bg: "var(--blush-soft)",  fg: "var(--status-error-text)", border: "var(--blush)",  icon: AlertCircle },
  success: { bg: "var(--sage-soft)",   fg: "var(--sage-strong)",      border: "var(--sage)",   icon: CheckCircle2 },
};

export interface AlertProps {
  variant?: AlertVariant;
  /** Cabeçalho em negrito. Omitido → só o corpo. */
  title?: React.ReactNode;
  /** Corpo do aviso. */
  children?: React.ReactNode;
  /** Substitui o ícone padrão da variante. Passe `null` para ocultar. */
  icon?: LucideIcon | null;
  /** Slot à direita (ex.: botão de colapso). */
  action?: React.ReactNode;
  className?: string;
}

export function Alert({
  variant = "info",
  title,
  children,
  icon,
  action,
  className = "",
}: AlertProps) {
  const v = VARIANTS[variant];
  const Icon = icon === null ? null : icon ?? v.icon;

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 px-3.5 py-2.5 ${className}`.trim()}
      style={{
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: "var(--radius-md)",
        color: v.fg,
      }}
    >
      {Icon && <Icon size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold leading-snug">{title}</p>}
        {children && (
          <div className={`text-xs leading-snug ${title ? "mt-0.5 opacity-90" : ""}`}>{children}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
