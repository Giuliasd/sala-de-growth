/**
 * Checkpoint pai engloba as datas dos filhos — a partir da mudança.
 *
 * Esticar um subcheckpoint para além do pai (ou movê-lo para baixo de um pai
 * mais curto) estica o pai junto — e o avô, e assim por diante. Só ESTICA:
 * encolher o filho não encolhe o pai, que pode ter folga de propósito.
 *
 * Só sobe a partir de quem MUDOU, e para quando um ancestral já cobre: pai
 * antigo que não englobava algum filho não é corrigido "de carona" por uma
 * edição em outro lugar da árvore. Decisão do produto — o que existia antes
 * da regra fica como está.
 *
 * Início ausente conta como o próprio prazo (barra de um dia), a mesma âncora
 * do roadmap e da ordenação. Pai sem início que precisa crescer passa a ter
 * início explícito: sem isso, esticar só o prazo arrastaria o início junto e
 * ele deixaria de cobrir o filho que começava no prazo antigo.
 *
 * A mesma regra roda nas actions (depois de cada mudança de data ou de
 * hierarquia) e no otimista da tela.
 */

type Data = Date | string;

export interface NoDeCobertura {
  id: string;
  parentId: string | null;
  startDate: Data | null;
  dueDate: Data;
}

export interface AjusteDeCobertura {
  id: string;
  startDate: Date;
  dueDate: Date;
}

const ms = (d: Data) => new Date(d).getTime();

/**
 * Ajustes para os ancestrais de `alterados` englobarem cada um deles. Devolve
 * só quem muda. Ciclo (dado corrompido) não trava.
 */
export function planejarCoberturaDosPais(
  nos: NoDeCobertura[],
  alterados: Iterable<string>
): AjusteDeCobertura[] {
  const porId = new Map(nos.map((n) => [n.id, n]));
  // Extensão de trabalho de cada nó já esticado nesta rodada.
  const extensao = new Map<string, [number, number]>();
  const ext = (n: NoDeCobertura): [number, number] =>
    extensao.get(n.id) ?? [ms(n.startDate ?? n.dueDate), ms(n.dueDate)];

  for (const id of alterados) {
    let atual = porId.get(id);
    const vistos = new Set<string>();
    while (atual && atual.parentId && !vistos.has(atual.id)) {
      vistos.add(atual.id);
      const pai = porId.get(atual.parentId);
      if (!pai) break;
      const [fi, ff] = ext(atual);
      const [pi, pf] = ext(pai);
      const inicio = Math.min(pi, fi);
      const fim = Math.max(pf, ff);
      // Pai já cobre: daqui para cima nada muda por causa desta edição.
      if (inicio === pi && fim === pf) break;
      extensao.set(pai.id, [inicio, fim]);
      atual = pai;
    }
  }

  return [...extensao].map(([id, [inicio, fim]]) => ({
    id,
    startDate: new Date(inicio),
    dueDate: new Date(fim),
  }));
}

/**
 * Aplica `planejarCoberturaDosPais` numa lista local (o otimista da tela),
 * devolvendo a mesma lista quando nada muda. As datas saem no formato
 * `YYYY-MM-DD` quando a lista já usava string, como as actions recebem.
 */
export function aplicarCoberturaDosPais<T extends NoDeCobertura>(
  itens: T[],
  alterados: Iterable<string>
): T[] {
  const ajustes = planejarCoberturaDosPais(itens, alterados);
  if (ajustes.length === 0) return itens;
  const porId = new Map(ajustes.map((a) => [a.id, a]));
  return itens.map((it) => {
    const a = porId.get(it.id);
    if (!a) return it;
    const formatar = (d: Date, original: Data | null) =>
      typeof original === "string" ? d.toISOString().slice(0, 10) : d;
    return {
      ...it,
      startDate: formatar(a.startDate, it.startDate ?? it.dueDate),
      dueDate: formatar(a.dueDate, it.dueDate),
    };
  });
}
