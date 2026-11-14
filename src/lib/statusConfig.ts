import type { LucideIcon } from "lucide-react";
import { Sprout, Flame, PartyPopper, Coffee, Archive, FlaskConical, Hourglass, FileText, PenLine, FileCheck } from "lucide-react";

/**
 * Fonte ÚNICA de verdade para status de iniciativa/experimento: rótulo, família
 * de cor e ícone. Todos os consumidores (StatusBadge, statusColors, roadmap,
 * GanttBar, WeeklyActivity) derivam sua aparência daqui via os helpers `family*`
 * — assim adicionar/alterar um status é um único lugar, não cinco.
 *
 * "Família" é a paleta do design system (sky/peach/butter/blush/sage) + neutral.
 * Cada família tem tokens `--<f>-soft` (fundo), `--<f>` (borda) e `--<f>-strong`
 * (texto legível sobre o -soft nos dois temas).
 */
export type StatusEntity = "iniciativa" | "experimento";
export type StatusFamily = "sky" | "peach" | "butter" | "blush" | "sage" | "neutral";

export type StatusMeta = {
  label: string;
  family: StatusFamily;
  icon?: LucideIcon;
  /** Renderiza esmaecido (ex.: cancelada/arquivado). */
  faded?: boolean;
};

const INICIATIVA: Record<string, StatusMeta> = {
  BACKLOG:              { label: "Backlog",              family: "sky",     icon: Sprout },
  EM_ANDAMENTO:         { label: "Em Andamento",         family: "peach",   icon: Flame },
  CONCLUIDA:            { label: "Concluída",            family: "sage",    icon: PartyPopper },
  ESCREVENDO_RELATORIO: { label: "Escrevendo relatório", family: "butter",  icon: PenLine },
  RELATORIO_FINALIZADO: { label: "Relatório finalizado", family: "blush",   icon: FileCheck },
  PAUSADA:              { label: "Pausada",              family: "neutral", icon: Coffee },
  CANCELADA:            { label: "Cancelada",            family: "neutral", icon: Archive, faded: true },
};

const EXPERIMENTO: Record<string, StatusMeta> = {
  BACKLOG:                 { label: "Backlog",                 family: "sky",     icon: FlaskConical },
  EM_ANDAMENTO:            { label: "Em Andamento",            family: "peach",   icon: Flame },
  AGUARDANDO_RESULTADOS:   { label: "Aguardando resultados",   family: "butter",  icon: Hourglass },
  RELATORIO_PRONTO:        { label: "Relatório pronto",        family: "blush",   icon: FileText },
  RESULTADOS_APRESENTADOS: { label: "Resultados apresentados", family: "sage",    icon: PartyPopper },
  PAUSADO:                 { label: "Pausado",                 family: "neutral", icon: Coffee },
  ARQUIVADO:               { label: "Arquivado",             family: "neutral", icon: Archive, faded: true },
};

const TABLES: Record<StatusEntity, Record<string, StatusMeta>> = {
  iniciativa: INICIATIVA,
  experimento: EXPERIMENTO,
};

/** Ordem canônica dos status (para dropdowns/filtros). */
export const INICIATIVA_STATUSES = Object.keys(INICIATIVA);
export const EXPERIMENTO_STATUSES = Object.keys(EXPERIMENTO);

/**
 * Status de iniciativa considerados "entregues/concluídos" — a execução
 * terminou, ainda que o relatório esteja em elaboração. Usado por métricas
 * (OKR, relatórios, gestão) e pelo carregamento de concluídas entre quarters.
 */
export const INICIATIVA_CONCLUIDA_STATUSES = [
  "CONCLUIDA",
  "ESCREVENDO_RELATORIO",
  "RELATORIO_FINALIZADO",
] as const;

/**
 * Status em que o trabalho ACABOU de verdade — nada pendente, nem relatório.
 *
 * Diferente de INICIATIVA_CONCLUIDA_STATUSES, que inclui ESCREVENDO_RELATORIO:
 * ali a execução terminou, mas ainda há trabalho na mão de alguém. Esta lista
 * é a usada pela Weekly para parar de listar o que já morreu.
 */
export const INICIATIVA_SEM_PENDENCIA_STATUSES = ["CONCLUIDA", "RELATORIO_FINALIZADO"] as const;

/** Idem para experimento: relatório pronto ainda espera apresentação. */
export const EXPERIMENTO_SEM_PENDENCIA_STATUSES = ["RESULTADOS_APRESENTADOS"] as const;

export function isIniciativaConcluida(status: string): boolean {
  return (INICIATIVA_CONCLUIDA_STATUSES as readonly string[]).includes(status);
}

export function getStatusMeta(type: StatusEntity, status: string): StatusMeta {
  return TABLES[type]?.[status] ?? { label: status, family: "neutral" };
}

// ── Família → tokens/classe ────────────────────────────────────────────
// (var(--...) é lookup de CSS em runtime, pode ser montado dinamicamente;
//  classes Tailwind NÃO — por isso familyBarClasses usa strings literais.)

export function familyBg(f: StatusFamily): string {
  return f === "neutral" ? "var(--color-cream)" : `var(--${f}-soft)`;
}
export function familyBorder(f: StatusFamily): string {
  return f === "neutral" ? "var(--color-line)" : `var(--${f})`;
}
export function familyStrong(f: StatusFamily): string {
  return f === "neutral" ? "var(--color-ink-soft)" : `var(--${f}-strong)`;
}

/** Classe Tailwind da barra do roadmap/gantt (fundo -soft + fita à esquerda). */
export function familyBarClasses(f: StatusFamily): string {
  switch (f) {
    case "sky":    return "bg-sky-soft border-l-4 border-l-sky";
    case "peach":  return "bg-peach-soft border-l-4 border-l-peach";
    case "butter": return "bg-butter-soft border-l-4 border-l-butter";
    case "blush":  return "bg-blush-soft border-l-4 border-l-blush";
    case "sage":   return "bg-sage-soft border-l-4 border-l-sage";
    case "neutral":return "bg-cream border-l-4 border-l-line";
  }
}
