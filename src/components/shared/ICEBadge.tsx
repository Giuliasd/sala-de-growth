import { Zap, ArrowRight, Sprout, Archive } from "lucide-react";
import { Badge } from "@/components/shared/Badge";
import type { LucideIcon } from "lucide-react";

interface IceConfig {
  label: string;
  bg: string;
  color: string;
  borderColor: string;
  icon: LucideIcon;
}

const ICE_CONFIG: Record<string, IceConfig> = {
  EXECUTAR_AGORA: {
    label: "Executar Agora",
    bg: "var(--peach-soft)",
    color: "var(--peach-strong)",
    borderColor: "var(--peach)",
    icon: Zap,
  },
  EM_SEGUIDA: {
    label: "Em Seguida",
    bg: "var(--butter-soft)",
    color: "var(--butter-strong)",
    borderColor: "var(--butter)",
    icon: ArrowRight,
  },
  BACKLOG: {
    label: "Backlog",
    bg: "var(--sky-soft)",
    color: "var(--sky-strong)",
    borderColor: "var(--sky)",
    icon: Sprout,
  },
  ARQUIVAR: {
    label: "Arquivar",
    bg: "var(--bg-app)",
    color: "var(--text-muted)",
    borderColor: "var(--border-subtle)",
    icon: Archive,
  },
};

interface ICEBadgeProps {
  action: string;
  iceScore?: number;
}

export function ICEBadge({ action, iceScore }: ICEBadgeProps) {
  const config: IceConfig = ICE_CONFIG[action] ?? {
    label: action,
    bg: "var(--bg-app)",
    color: "var(--text-muted)",
    borderColor: "var(--border-subtle)",
    icon: Archive,
  };
  const Icon = config.icon;

  // A pill-base do design system: no cabeçalho do experimento o ICE fica ao
  // lado de status, resultado e quarter, e com caixa própria (padding 3px e
  // altura de linha normal) ficava 4px mais alto que eles.
  return (
    <Badge bg={config.bg} color={config.color} borderColor={config.borderColor} icon={Icon}>
      {config.label}
      {iceScore !== undefined && (
        <>
          <span style={{ opacity: 0.5, margin: "0 1px" }}>·</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            ICE {iceScore.toFixed(1)}
          </span>
        </>
      )}
    </Badge>
  );
}
