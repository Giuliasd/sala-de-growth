import type { LucideIcon } from "lucide-react";
import { ChartLine, ClipboardList, FlaskConical, Rocket } from "lucide-react";
import { CATEGORIA_CONFIG } from "@/components/shared/CheckpointCategoria";
import type { EventoDoCalendario, TipoDeEvento, TipoDeItem } from "@/lib/calendario";

/**
 * Ícone e cor de cada tipo de evento do calendário de datas-chave.
 *
 * Lançamento e análise repetem o par do `LaunchBanner`/`AnalysisBanner`
 * (foguete pêssego, gráfico azul) e comunicação e marco o do
 * `CATEGORIA_CONFIG` dos checkpoints (blush e lilás): a mesma data tem a mesma
 * cara aqui, no dashboard, na Weekly e no calendário do item.
 */
export type TipoConfig = {
  label: string;
  plural: string;
  /** Concordância das mensagens ("movido"/"movida"). */
  feminino: boolean;
  icon: LucideIcon;
  soft: string;
  accent: string;
  text: string;
};

export const TIPO_CONFIG: Record<TipoDeEvento, TipoConfig> = {
  LANCAMENTO: {
    label: "Lançamento",
    plural: "Lançamentos",
    feminino: false,
    icon: Rocket,
    soft: "var(--peach-soft)",
    accent: "var(--peach)",
    text: "var(--peach-strong)",
  },
  ANALISE: {
    label: "Análise de resultados",
    plural: "Análises",
    feminino: true,
    icon: ChartLine,
    soft: "var(--sky-soft)",
    accent: "var(--sky)",
    text: "var(--sky-strong)",
  },
  COMUNICACAO: {
    label: CATEGORIA_CONFIG.COMUNICACAO.label,
    plural: "Comunicações",
    feminino: true,
    icon: CATEGORIA_CONFIG.COMUNICACAO.icon,
    soft: CATEGORIA_CONFIG.COMUNICACAO.soft,
    accent: CATEGORIA_CONFIG.COMUNICACAO.accent,
    text: CATEGORIA_CONFIG.COMUNICACAO.text,
  },
  MARCO: {
    label: CATEGORIA_CONFIG.MARCO.label,
    plural: "Marcos",
    feminino: false,
    icon: CATEGORIA_CONFIG.MARCO.icon,
    soft: CATEGORIA_CONFIG.MARCO.soft,
    accent: CATEGORIA_CONFIG.MARCO.accent,
    text: CATEGORIA_CONFIG.MARCO.text,
  },
};

export const ITEM_CONFIG: Record<TipoDeItem, { label: string; icon: LucideIcon }> = {
  iniciativa: { label: "Iniciativa", icon: ClipboardList },
  experimento: { label: "Experimento", icon: FlaskConical },
};

export function rotuloCurto(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Ana (férias), Bia (licença)" — primeiro nome e tipo genérico. */
export function rotuloDosConflitos(e: EventoDoCalendario): string {
  return e.conflitos.map((c) => `${c.pessoa.split(" ")[0]} (${c.tipo})`).join(", ");
}

/**
 * O que o leitor de tela anuncia no chip/linha: tipo, nome, item (para
 * comunicação e marco) e os estados que a cor sozinha comunicaria.
 */
export function rotuloAcessivel(e: EventoDoCalendario): string {
  const cfg = TIPO_CONFIG[e.tipo];
  const partes = [`${cfg.label}: ${e.titulo}`];
  if (e.checkpointId) partes[0] += ` (${e.item.nome})`;
  if (e.concluido) partes.push("concluído");
  if (e.atrasado) partes.push("atrasado");
  if (e.conflitos.length > 0) partes.push(`fora no dia: ${rotuloDosConflitos(e)}`);
  return `${partes.join(" — ")}. Abrir detalhe.`;
}
