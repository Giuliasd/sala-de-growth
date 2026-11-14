import { randomUUID } from "node:crypto";

const NAME_MAX = 200;
const COPY_SUFFIX = " (cópia)";

export type DuplicationPlanItem<T> = {
  source: T;
  newId: string;
  /** Pai da cópia: a cópia do pai original, se ele também foi duplicado; senão o próprio pai original. */
  parentId: string | null;
  parentIsCopy: boolean;
  name: string;
};

/**
 * Planeja a duplicação de checkpoints (iniciativa e experimento usam o mesmo).
 *
 * Devolve os itens em ordem de criação — pai antes do filho, para o `parentId`
 * da cópia já existir quando o filho for inserido — e, dentro de cada grupo de
 * irmãos, na ordem original, para as cópias saírem na mesma sequência.
 *
 * Os ids são gerados aqui (e não pelo banco) justamente para os filhos poderem
 * apontar para a cópia do pai dentro de uma única transação.
 */
export function planCheckpointDuplication<
  T extends { id: string; parentId: string | null; name: string; order: number },
>(selected: T[], newId: () => string = randomUUID): DuplicationPlanItem<T>[] {
  const selectedIds = new Set(selected.map((c) => c.id));
  const byId = new Map(selected.map((c) => [c.id, c]));

  // Profundidade DENTRO da seleção: 0 = raiz da duplicação (pai não marcado).
  const depth = (c: T): number => {
    let d = 0;
    let pid = c.parentId;
    while (pid && selectedIds.has(pid)) {
      d++;
      pid = byId.get(pid)!.parentId;
    }
    return d;
  };

  const ordered = [...selected].sort((a, b) => depth(a) - depth(b) || a.order - b.order);
  const copyOf = new Map<string, string>();
  return ordered.map((source) => {
    const id = newId();
    copyOf.set(source.id, id);
    const parentIsCopy = !!source.parentId && selectedIds.has(source.parentId);
    const name = parentIsCopy
      ? source.name
      : source.name.slice(0, NAME_MAX - COPY_SUFFIX.length) + COPY_SUFFIX;
    return {
      source,
      newId: id,
      parentId: parentIsCopy ? copyOf.get(source.parentId!)! : source.parentId,
      parentIsCopy,
      name,
    };
  });
}
