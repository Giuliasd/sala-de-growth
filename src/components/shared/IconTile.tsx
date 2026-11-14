import type { LucideIcon } from "lucide-react";

interface IconTileProps {
  icon: LucideIcon;
  /** Fundo do chip. Padrão: accent-subtle. */
  bg?: string;
  /** Cor do ícone. Padrão: brand-primary. */
  color?: string;
  /** Lado do quadrado (px). Padrão: 36. */
  size?: number;
  radius?: number;
  iconSize?: number;
  className?: string;
}

// Chip de ícone colorido: quadradinho arredondado com fundo suave + ícone.
// Padrão visual repetido no dashboard (contadores, cabeçalhos de seção, etc.).
export function IconTile({
  icon: Icon,
  bg = "var(--accent-subtle)",
  color = "var(--brand-primary)",
  size = 36,
  radius = 10,
  iconSize = 18,
  className = "",
}: IconTileProps) {
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className}`.trim()}
      style={{ width: size, height: size, borderRadius: radius, background: bg }}
    >
      <Icon size={iconSize} color={color} strokeWidth={2} />
    </div>
  );
}
