/**
 * Regras de "mover para" da edição em massa de checkpoints (iniciativa e
 * experimento usam o mesmo). Módulo puro: o cliente usa para montar o menu só
 * com destinos válidos e o servidor revalida com a árvore do banco — um menu
 * filtrado não protege contra request forjado nem contra árvore desatualizada.
 */

/**
 * Profundidade máxima (0 = checkpoint de topo): checkpoint → sub → sub-sub.
 * É o mesmo limite que o drag-and-drop da lista aplica.
 */
export const MAX_CHECKPOINT_DEPTH = 2;

type TreeNode = { id: string; parentId: string | null };

function indexTree<T extends TreeNode>(all: T[]) {
  const byId = new Map(all.map((n) => [n.id, n]));
  const children = new Map<string | null, T[]>();
  for (const n of all) {
    const group = children.get(n.parentId);
    if (group) group.push(n);
    else children.set(n.parentId, [n]);
  }
  const depth = (id: string): number => {
    let d = 0;
    let pid = byId.get(id)?.parentId ?? null;
    while (pid) {
      d++;
      pid = byId.get(pid)?.parentId ?? null;
    }
    return d;
  };
  const height = (id: string): number => {
    const kids = children.get(id) ?? [];
    return kids.length === 0 ? 0 : 1 + Math.max(...kids.map((k) => height(k.id)));
  };
  const subtree = (id: string): string[] => [
    id,
    ...(children.get(id) ?? []).flatMap((k) => subtree(k.id)),
  ];
  return { byId, children, depth, height, subtree };
}

/**
 * Raízes da mudança: selecionados sem ancestral também selecionado, na ordem
 * recebida. Quem tem o pai marcado junto viaja com ele — e os filhos NÃO
 * marcados também, porque mover um checkpoint leva a subárvore inteira.
 */
export function moveRoots<T extends TreeNode>(all: T[], selectedIds: string[]): string[] {
  const { byId } = indexTree(all);
  const selected = new Set(selectedIds);
  return selectedIds.filter((id) => {
    let pid = byId.get(id)?.parentId ?? null;
    while (pid) {
      if (selected.has(pid)) return false;
      pid = byId.get(pid)?.parentId ?? null;
    }
    return true;
  });
}

/**
 * Ids que podem receber a seleção como filhos. O topo (`null`) é sempre
 * válido e não entra aqui. Fica de fora quem está dentro de algo que vai ser
 * movido (viraria ciclo) e quem estouraria a profundidade máxima.
 */
export function validMoveTargets<T extends TreeNode>(all: T[], selectedIds: string[]): Set<string> {
  const tree = indexTree(all);
  const roots = moveRoots(all, selectedIds);
  const moving = new Set(roots.flatMap((id) => tree.subtree(id)));
  const tallest = roots.length === 0 ? 0 : Math.max(...roots.map((id) => tree.height(id)));
  return new Set(
    all
      .filter((n) => !moving.has(n.id))
      .filter((n) => tree.depth(n.id) + 1 + tallest <= MAX_CHECKPOINT_DEPTH)
      .map((n) => n.id)
  );
}

export type MovePlan =
  | { ok: true; moves: { id: string; parentId: string | null; order: number }[] }
  | { ok: false; error: string };

/**
 * Planeja mover a seleção para baixo de `targetParentId` (`null` = topo).
 * As raízes entram no FIM do grupo de irmãos do destino, na ordem em que
 * vieram — o cliente manda na ordem em que a lista as exibe.
 */
export function planCheckpointMove<T extends TreeNode & { order: number }>(
  all: T[],
  selectedIds: string[],
  targetParentId: string | null
): MovePlan {
  const tree = indexTree(all);
  if (selectedIds.some((id) => !tree.byId.has(id))) {
    return { ok: false, error: "Checkpoint não encontrado." };
  }
  if (targetParentId !== null) {
    if (!tree.byId.has(targetParentId)) {
      return { ok: false, error: "Checkpoint de destino não encontrado." };
    }
    if (selectedIds.includes(targetParentId)) {
      return { ok: false, error: "Um checkpoint não pode ser movido para dentro dele mesmo." };
    }
    if (!validMoveTargets(all, selectedIds).has(targetParentId)) {
      const roots = moveRoots(all, selectedIds);
      const moving = new Set(roots.flatMap((id) => tree.subtree(id)));
      return {
        ok: false,
        error: moving.has(targetParentId)
          ? "Não dá para mover um checkpoint para dentro de um subcheckpoint dele."
          : "Esse destino passaria do limite de 3 níveis de checkpoints.",
      };
    }
  }

  const roots = moveRoots(all, selectedIds);
  const rootSet = new Set(roots);
  const staying = (tree.children.get(targetParentId) ?? []).filter((n) => !rootSet.has(n.id));
  const start = staying.length === 0 ? 0 : Math.max(...staying.map((n) => n.order)) + 1;
  return {
    ok: true,
    moves: roots.map((id, i) => ({ id, parentId: targetParentId, order: start + i })),
  };
}
