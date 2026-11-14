/**
 * Cores das tags de checkpoint — as famílias pastel do design system, as
 * mesmas dos status. Módulo puro (sem Prisma) porque o validador das actions
 * e o seletor de cor no cliente precisam da MESMA lista.
 */
export const CHECKPOINT_TAG_COLORS = ["sky", "sage", "peach", "butter", "blush", "neutral"] as const;

export type CheckpointTagColor = (typeof CHECKPOINT_TAG_COLORS)[number];

export const CHECKPOINT_TAG_COLOR_LABEL: Record<CheckpointTagColor, string> = {
  sky: "Azul",
  sage: "Verde",
  peach: "Laranja",
  butter: "Amarelo",
  blush: "Rosa",
  neutral: "Cinza",
};

export function isCheckpointTagColor(value: string): value is CheckpointTagColor {
  return (CHECKPOINT_TAG_COLORS as readonly string[]).includes(value);
}

/**
 * Cor da próxima tag criada: a primeira família que o item ainda não usa, para
 * as tags nascerem distinguíveis sem a pessoa ter que escolher. Todas usadas,
 * recomeça o ciclo.
 */
export function nextCheckpointTagColor(used: string[]): CheckpointTagColor {
  const livre = CHECKPOINT_TAG_COLORS.find((c) => !used.includes(c));
  return livre ?? CHECKPOINT_TAG_COLORS[used.length % CHECKPOINT_TAG_COLORS.length];
}
