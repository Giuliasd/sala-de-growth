import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { IconTile } from "./IconTile";

interface MetricCardProps {
  value: number | string;
  label: string;
  icon: LucideIcon;
  accentBg: string;
  accentColor: string;
  href?: string;
  subtitle?: string;
}

export function MetricCard({
  value,
  label,
  icon: Icon,
  accentBg,
  accentColor,
  href,
  subtitle,
}: MetricCardProps) {
  const CardContent = (
    // h-full: numa linha de cards, o rótulo de um deles quebra em duas linhas e
    // deixava esse card mais alto que os vizinhos. Ocupando a altura da célula
    // do grid, todos terminam juntos — a linha some, o desalinhamento também.
    <div
      className={`flex flex-col gap-2 h-full transition-all duration-200 group ${
        href ? "cursor-pointer hover:shadow-sm hover:border-forest/30 active:scale-[0.98]" : ""
      }`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)",
        // 16 no lugar de 24: quatro cards destes gastavam uma faixa inteira da
        // tela para quatro números. O ritmo é o dos cards de /iniciativas.
        padding: 16,
      }}
    >
      {/* Ícone + número na mesma linha: empilhados, os dois gastavam duas
          faixas de altura para dizer uma coisa só. */}
      <div className="flex items-center gap-3">
        <IconTile
          icon={Icon}
          bg={accentBg}
          color={accentColor}
          size={32}
          radius={10}
          className="transition-colors group-hover:brightness-95"
        />
        <span
          className="tabular leading-none"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 30,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {value}
        </span>
      </div>

      {/* Label and Subtitle */}
      <div className="flex flex-col gap-0.5">
        <span
          className="text-sm font-medium leading-tight transition-colors group-hover:text-forest"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
        {subtitle && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full no-underline">
        {CardContent}
      </Link>
    );
  }

  return CardContent;
}
