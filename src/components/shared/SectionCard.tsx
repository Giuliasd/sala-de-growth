import { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { IconTile } from "./IconTile";

interface SectionCardProps {
  icon?: LucideIcon;
  /** Fundo do chip do ícone. Padrão: accent-subtle. */
  iconBg?: string;
  /** Cor do ícone. Padrão: brand-primary. */
  iconColor?: string;
  title: string;
  /** Contador exibido como pill neutra ao lado do título. */
  count?: number;
  /** Link opcional no rodapé (ex.: "Ver todos"). */
  action?: { label: string; href: string };
  /**
   * Ação no cabeçalho, à direita (ex.: um "+" que abre formulário). Fica ao
   * lado do contador — é o lugar de criar algo que pertence a este painel.
   */
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

// Painel padrão com cabeçalho (ícone + título + contador) e rodapé opcional.
// Unifica o "CardShell" que vivia solto na MonthSnapshot e os painéis com
// cabeçalho espalhados pelo app. Construído sobre <Card>.
export function SectionCard({ icon: Icon, iconBg, iconColor, title, count, action, headerAction, children, className = "" }: SectionCardProps) {
  return (
    <Card padding={0} className={`overflow-hidden ${className}`.trim()}>
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2.5">
          {Icon && <IconTile icon={Icon} bg={iconBg} color={iconColor} size={32} iconSize={16} />}
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {count !== undefined && (
            <Badge bg="var(--bg-app)" color="var(--text-secondary)">
              {count}
            </Badge>
          )}
          {headerAction}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-3">{children}</div>

      {/* Footer action */}
      {action && (
        <div className="px-5 pb-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <Link
            href={action.href}
            className="text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--brand-primary)" }}
          >
            {action.label}
          </Link>
        </div>
      )}
    </Card>
  );
}
