import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /**
   * `compact` reduz só o respiro vertical (py-12 → py-6), para caber em card de
   * lista densa sem abrir um vão morto. Ícone, textos e cores não mudam.
   */
  density?: "default" | "compact";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  density = "default",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 px-6 ${
        density === "compact" ? "py-6" : "py-12"
      }`}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-lg)",
          background: "var(--forest-soft)",
        }}
      >
        <Icon size={24} style={{ color: "var(--brand-primary)" }} strokeWidth={1.5} />
      </div>
      <p
        className="text-base font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </p>
      {description && (
        <p className="text-sm max-w-xs" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-medium mt-1"
          style={{ color: "var(--brand-primary)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
