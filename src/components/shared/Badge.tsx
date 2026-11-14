import { forwardRef, HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  bg?: string;
  color?: string;
  borderColor?: string;
  icon?: LucideIcon;
  children: ReactNode;
}

// Pill base do design system. Recebe cores via tokens (não hex fixo). Layout e
// forma vivem na classe `.badge` (globals.css).
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      bg = "var(--color-cream)",
      color = "var(--text-secondary)",
      borderColor,
      icon: Icon,
      className = "",
      style,
      children,
      ...props
    },
    ref
  ) => (
    <span
      ref={ref}
      className={`badge ${className}`.trim()}
      style={{
        background: bg,
        color,
        border: borderColor ? `1px solid ${borderColor}` : "none",
        ...style,
      }}
      {...props}
    >
      {/* 12px, a altura da letra (font-size 12, line-height 1): com 13 a pill
          com ícone ficava 1px mais alta que a vizinha sem ícone. */}
      {Icon && <Icon size={12} strokeWidth={2} style={{ flexShrink: 0 }} />}
      {children}
    </span>
  )
);

Badge.displayName = "Badge";
