/**
 * Segmentação dos checkpoints por tag — a regra da lista agrupada do detalhe
 * da iniciativa/experimento e da Weekly de Rituais. Mora fora dos componentes
 * para as duas telas lerem do mesmo lugar (e a Weekly não carregar o
 * CheckpointSection inteiro só por ela).
 */

/** Chave do grupo dos checkpoints sem nenhuma tag, na segmentação por tags. */
export const SEM_TAG_KEY = "__sem_tag__";

/**
 * Tags que valem para cada checkpoint: as próprias ou, sem nenhuma, as do pai
 * (e assim por diante). `herdadas` diz se vieram de um ancestral.
 *
 * É a regra da lista agrupada (o subcheckpoint sem tag fica no grupo do pai) e
 * do tooltip do calendário — as duas leem daqui para não divergirem. Tags fora
 * de `conhecidas` (excluídas no gerenciador) não contam. Ciclo (dado
 * corrompido) não trava: o nó repetido conta como sem tag.
 *
 * Exportada para o teste e para a Weekly.
 */
export function resolverTagsEfetivas<T extends { id: string; parentId: string | null; tagIds: string[] }>(
  items: T[],
  conhecidas: ReadonlySet<string>
): (item: T) => { ids: string[]; herdadas: boolean } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const cache = new Map<string, { ids: string[]; herdadas: boolean }>();
  const resolver = (i: T, visitando: Set<string>): { ids: string[]; herdadas: boolean } => {
    const pronto = cache.get(i.id);
    if (pronto) return pronto;
    const proprias = i.tagIds.filter((id) => conhecidas.has(id));
    const pai = i.parentId ? byId.get(i.parentId) : undefined;
    let r: { ids: string[]; herdadas: boolean };
    if (proprias.length > 0 || !pai || visitando.has(pai.id)) {
      r = { ids: proprias, herdadas: false };
    } else {
      visitando.add(i.id);
      const doPai = resolver(pai, visitando);
      r = { ids: doPai.ids, herdadas: doPai.ids.length > 0 };
    }
    cache.set(i.id, r);
    return r;
  };
  return (item) => resolver(item, new Set());
}

/**
 * Segmenta a árvore já achatada (e ordenada) por tag: um grupo por tag, na
 * ordem de `tags` (a que se arrasta no gerenciador), e "Sem tag" no fim — o mesmo desenho da segmentação por
 * frente da tabela de iniciativas.
 *
 * Tag é N:N, então um checkpoint com duas tags aparece nos dois grupos (como
 * o item com dois responsáveis na Weekly): a soma dos grupos passa do total, e
 * é proposital. Dentro do grupo vale a mesma regra do filtro — entra quem tem
 * a tag, mais os ancestrais como contexto, senão o subcheckpoint apareceria
 * órfão. `matched` diz quem casou de fato (o resto é contexto).
 *
 * Subcheckpoint sem tag herda as do pai (e assim por diante): fica junto dele
 * no grupo, em vez de ir parar sozinho em "Sem tag". Quem tem tag própria
 * segue só as próprias.
 *
 * Exportada para o teste e para a Weekly.
 */
export function segmentarPorTag<T extends { id: string; parentId: string | null; tagIds: string[] }>(
  items: T[],
  tags: { id: string; name: string }[]
): { key: string; label: string; items: T[]; matched: Set<string> }[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const resolver = resolverTagsEfetivas(items, new Set(tags.map((t) => t.id)));
  const tagsEfetivas = (i: T): string[] => resolver(i).ids;
  const grupos = tags.map((t) => ({ key: t.id, label: t.name, casa: (i: T) => tagsEfetivas(i).includes(t.id) }));
  grupos.push({
    key: SEM_TAG_KEY,
    label: "Sem tag",
    casa: (i: T) => tagsEfetivas(i).length === 0,
  });

  return grupos
    .map((g) => {
      const matched = new Set<string>();
      const manter = new Set<string>();
      for (const item of items) {
        if (!g.casa(item)) continue;
        matched.add(item.id);
        manter.add(item.id);
        let pid = item.parentId;
        while (pid && !manter.has(pid)) {
          manter.add(pid);
          pid = byId.get(pid)?.parentId ?? null;
        }
      }
      return { key: g.key, label: g.label, items: items.filter((i) => manter.has(i.id)), matched };
    })
    .filter((g) => g.matched.size > 0);
}
