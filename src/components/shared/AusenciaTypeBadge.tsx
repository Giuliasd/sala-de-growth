import { Palmtree, HeartPulse, Baby, CalendarDays, Coffee } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AusenciaConfig {
  label: string;
  bg: string;
  color: string;
  /**
   * Tom médio da família, para a faixa fina de ausência no calendário.
   *
   * Separado de `color` porque em férias o tom forte é um cinza-esverdeado
   * (`--status-review-text`): serve ao texto do badge, mas numa faixa de 6px
   * lia como divisória de linha em vez de sinal.
   */
  faixa: string;
  icon: LucideIcon;
}

const TYPE_CONFIG: Record<string, AusenciaConfig> = {
  FERIAS: {
    label: "Férias",
    bg: "var(--sky-soft)",
    color: "var(--status-review-text)",
    faixa: "var(--sky)",
    icon: Palmtree,
  },
  LICENCA_MEDICA: {
    label: "Licença Médica",
    bg: "var(--blush-soft)",
    color: "var(--blush-strong)",
    faixa: "var(--blush)",
    icon: HeartPulse,
  },
  LICENCA_MATERNIDADE: {
    label: "Lic. Maternidade",
    bg: "var(--blush-soft)",
    color: "var(--blush-strong)",
    faixa: "var(--blush)",
    icon: Baby,
  },
  DAY_OFF: {
    label: "Day Off",
    bg: "var(--peach-soft)",
    color: "var(--peach-strong)",
    faixa: "var(--peach)",
    icon: Coffee,
  },
  OUTROS: {
    label: "Outros",
    bg: "var(--bg-app)",
    color: "var(--text-secondary)",
    faixa: "var(--border-default)",
    icon: CalendarDays,
  },
};

export function AusenciaTypeBadge({ type }: { type: string }) {
  const cfg: AusenciaConfig = TYPE_CONFIG[type] ?? TYPE_CONFIG.OUTROS;
  const Icon = cfg.icon;

  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap font-medium"
      style={{
        background: cfg.bg,
        color: cfg.color,
        borderRadius: "var(--radius-full)",
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 500,
        maxHeight: 32,
      }}
    >
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

export function getAusenciaBarStyle(type: string): { bg: string; color: string } {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.OUTROS;
  return { bg: cfg.bg, color: cfg.color };
}

/**
 * Cor da FAIXA fina de ausência (o marcador no topo do dia, no calendário de
 * checkpoints) — o tom médio da família, não o forte.
 *
 * Existe porque `color` de férias é `--status-review-text`, um cinza-
 * esverdeado: numa faixa de 6px ele lia como divisória de linha, não como
 * sinal de ausência. É o único tipo fora do padrão da própria família, e
 * corrigi-lo em `color` mudaria o badge em todas as telas.
 */
export function getAusenciaStripColor(type: string): string {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.OUTROS;
  return cfg.faixa;
}

export function getAusenciaLabel(type: string): string {
  return (TYPE_CONFIG[type] ?? TYPE_CONFIG.OUTROS).label;
}

export const AUSENCIA_TYPE_OPTIONS = [
  { value: "FERIAS", label: "Férias" },
  { value: "LICENCA_MEDICA", label: "Licença Médica" },
  { value: "LICENCA_MATERNIDADE", label: "Lic. Maternidade" },
  { value: "DAY_OFF", label: "Day Off" },
  { value: "OUTROS", label: "Outros" },
] as const;
