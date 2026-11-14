import { Trophy, CircleDot, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/shared/Badge";

interface ResultadoConfig {
  label: string;
  bg: string;
  color: string;
  borderColor: string;
  icon: LucideIcon;
}

export const RESULTADO_CONFIG: Record<string, ResultadoConfig> = {
  SUCESSO: { label: "Sucesso", bg: "var(--sage-soft)",   color: "var(--sage-strong)",   borderColor: "var(--sage)",   icon: Trophy },
  PARCIAL: { label: "Parcial", bg: "var(--butter-soft)", color: "var(--butter-strong)", borderColor: "var(--butter)", icon: CircleDot },
  FALHA:   { label: "Falha",   bg: "var(--blush-soft)",  color: "var(--blush-strong)",  borderColor: "var(--blush)",  icon: XCircle },
};

// Usado nos <select> dos formulários. Vazio = "a definir".
export const RESULTADO_OPTIONS = [
  { value: "SUCESSO", label: "Sucesso" },
  { value: "PARCIAL", label: "Parcial" },
  { value: "FALHA", label: "Falha" },
] as const;

export function ResultadoBadge({
  resultado,
  showIcon = true,
}: {
  resultado: string | null | undefined;
  showIcon?: boolean;
}) {
  if (!resultado) return null;
  const config = RESULTADO_CONFIG[resultado];
  if (!config) return null;

  return (
    <Badge
      bg={config.bg}
      color={config.color}
      borderColor={config.borderColor}
      icon={showIcon ? config.icon : undefined}
    >
      {config.label}
    </Badge>
  );
}
