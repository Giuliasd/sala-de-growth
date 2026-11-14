/**
 * Categorias de checkpoint — a lista que o servidor valida e a interface
 * desenha. Módulo puro (sem React nem Prisma): as server actions, o calendário
 * e os componentes importam daqui, então uma categoria nova entra num lugar só.
 *
 * Cada valor precisa de entrada em CATEGORIA_CONFIG
 * (components/shared/CheckpointCategoria.tsx) — ícone e cor — e de um valor no
 * enum `CheckpointCategoria` do schema.prisma.
 */
export const CHECKPOINT_CATEGORIAS = ["COMUNICACAO", "MARCO"] as const;

export type CheckpointCategoria = (typeof CHECKPOINT_CATEGORIAS)[number];

/**
 * Categorias que aparecem SOLTAS no calendário (mês e semana): sem o recuo e a
 * seta de subcheckpoint, e fora do realce da família do pai.
 *
 * - Comunicação: o aviso sai num dia, não "dentro" de uma etapa.
 * - Marco: é uma data relevante do projeto por si só, não um passo de outro.
 *
 * O pai continua acessível pelo tooltip.
 */
export const CATEGORIAS_SOLTAS: readonly CheckpointCategoria[] = ["COMUNICACAO", "MARCO"];
