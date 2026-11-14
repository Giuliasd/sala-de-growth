import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Cada variante só define as cores (via CSS vars). Hover/clique/foco vivem no
// CSS (.btn em globals.css), sem handlers JS.
const VARIANT_VARS: Record<Variant, React.CSSProperties> = {
  primary: {
    "--btn-bg": "var(--accent)",
    "--btn-bg-hover": "var(--accent-hover)",
    "--btn-fg": "var(--on-brand)",
    "--btn-border": "none",
    "--btn-weight": "600",
  } as React.CSSProperties,
  secondary: {
    "--btn-bg": "var(--bg-surface)",
    "--btn-bg-hover": "var(--bg-app)",
    "--btn-fg": "var(--text-primary)",
    "--btn-border": "1px solid var(--border-default)",
    "--btn-weight": "500",
  } as React.CSSProperties,
  ghost: {
    "--btn-bg": "transparent",
    "--btn-bg-hover": "var(--accent-subtle)",
    "--btn-fg": "var(--text-secondary)",
    "--btn-border": "none",
    "--btn-weight": "500",
  } as React.CSSProperties,
  danger: {
    "--btn-bg": "var(--status-error-bg)",
    "--btn-bg-hover": "var(--status-error-hover)",
    "--btn-fg": "var(--status-error-text)",
    "--btn-border": "none",
    "--btn-weight": "500",
  } as React.CSSProperties,
};

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: 12, borderRadius: "var(--radius-sm)" },
  md: { padding: "9px 16px", fontSize: 14, borderRadius: "var(--radius-md)" },
  lg: { padding: "12px 24px", fontSize: 15, borderRadius: "var(--radius-md)" },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", style, className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`btn ${className}`.trim()}
        style={{
          ...SIZE_STYLES[size],
          ...VARIANT_VARS[variant],
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
