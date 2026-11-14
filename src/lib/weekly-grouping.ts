/**
 * Agrupamento por frente da Weekly de Rituais.
 *
 * Vive aqui, e não em `components/rituais/WeeklyByMember`, porque aquele módulo
 * importa `lib/session` (e, por baixo, o next-auth): puxá-lo de um teste quebra
 * na hora de resolver `next/server`. A regra de agrupamento é lógica pura e
 * merece teste — daí a separação.
 */

import type { AcaoDaSemana } from "@/actions/acoes-semana";
import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";

export type Kind = "iniciativa" | "experimento";
export type TaggedItem = WeeklyItem & { kind: Kind };

/** Checkpoint da árvore, achatado, com o nível para indentar filho e neto. */
export type FlatCheckpoint = { cp: CheckpointItem; depth: number };

/** O que entra na linha de uma pessoa: o item e os checkpoints dela nele. */
export type Entrada = { item: TaggedItem; checkpoints: FlatCheckpoint[] };

export type GrupoDeFrente = {
  /** Id da frente; a ação criada no grupo nasce nela. */
  id: string;
  frente: string;
  itens: Entrada[];
  acoes: AcaoDaSemana[];
};

/**
 * Os itens e as ações de uma pessoa, agrupados por frente.
 *
 * É como o time já organiza a weekly no documento: cada pessoa lista o trabalho
 * por tema ("Trial de aquisição", "Site INK", "Geral"), com as tarefas embaixo.
 * A frente sai do card e vira o título do grupo — antes ela aparecia repetida
 * em letra miúda dentro de cada card, sem servir de âncora de leitura.
 *
 * Ações entram no grupo da própria frente, junto das iniciativas e experimentos
 * dela. As transversais ("TH", "1:1") ficam no balde do fim, fora daqui.
 *
 * Agrupa por ID, não por nome: o id é o que o "+ Ação" do grupo usa para criar
 * a ação já na frente certa, e duas frentes homônimas não podem virar um grupo
 * só com um id de uma delas.
 *
 * Ordem alfabética: previsível de uma semana para a outra. Ordenar por
 * quantidade faria os grupos dançarem de posição a cada item novo.
 */
export function agruparPorFrente(itens: Entrada[], acoes: AcaoDaSemana[]): GrupoDeFrente[] {
  const mapa = new Map<string, GrupoDeFrente>();
  const pegar = (id: string, nome: string) => {
    const atual = mapa.get(id);
    if (atual) return atual;
    const novo: GrupoDeFrente = { id, frente: nome, itens: [], acoes: [] };
    mapa.set(id, novo);
    return novo;
  };

  for (const entrada of itens) {
    pegar(entrada.item.frente.id, entrada.item.frente.name).itens.push(entrada);
  }
  // Uma frente pode existir só por causa de ações — trabalho miúdo de um tema
  // onde não há iniciativa aberta. Sem isso a ação sumiria da visão.
  for (const acao of acoes) {
    if (!acao.frente) continue;
    pegar(acao.frente.id, acao.frente.name).acoes.push(acao);
  }

  return [...mapa.values()].sort((a, b) => a.frente.localeCompare(b.frente, "pt-BR"));
}

/** Comparação de nomes em pt-BR, sem diferenciar maiúscula nem acento. */
const porNome = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** A tag que posiciona o checkpoint: a primeira em ordem alfabética. */
function tagDeOrdem(cp: CheckpointItem): string | null {
  let menor: string | null = null;
  for (const t of cp.tags ?? []) {
    if (menor === null || porNome.compare(t.name, menor) < 0) menor = t.name;
  }
  return menor;
}

/**
 * Os checkpoints de um item em ordem alfabética de tag — na Weekly de
 * Rituais, quem lê o card procura o trabalho pelo tema ("Design", "QA",
 * "Tracking"), e a tag é esse tema.
 *
 * - Com mais de uma tag, vale a primeira em ordem alfabética.
 * - Sem tag vai para o fim: não tem tema para ser procurado.
 * - Mesma tag: mantém a ordem de chegada (a do prazo — é assim que a consulta
 *   já entrega). O sort do JS é estável.
 * - Cada nível é ordenado entre irmãos; o subcheckpoint continua embaixo do pai.
 */
export function ordenarPorTag(cps: CheckpointItem[]): CheckpointItem[] {
  return [...cps]
    .sort((a, b) => {
      const ta = tagDeOrdem(a);
      const tb = tagDeOrdem(b);
      if (ta === tb) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return porNome.compare(ta, tb);
    })
    .map((cp) => (cp.children?.length ? { ...cp, children: ordenarPorTag(cp.children) } : cp));
}

/**
 * Filtra a lista achatada (pré-ordem) para os `escolhidos` MAIS os ancestrais
 * deles, na ordem original. O ancestral de um nó é o último nó anterior com
 * profundidade menor — por isso basta uma pilha por nível.
 */
export function comAncestrais(
  lista: FlatCheckpoint[],
  escolhidos: Set<FlatCheckpoint>
): FlatCheckpoint[] {
  const manter = new Set<FlatCheckpoint>();
  const pilha: FlatCheckpoint[] = [];
  for (const f of lista) {
    pilha[f.depth] = f;
    pilha.length = f.depth + 1;
    if (!escolhidos.has(f)) continue;
    for (const ancestral of pilha) manter.add(ancestral);
  }
  return lista.filter((f) => manter.has(f));
}

// ─── Recorte da semana e da pessoa ───────────────────────────────────────────
//
// A regra de "quais checkpoints de um item são desta pessoa nesta semana" é a
// da Weekly de Rituais. O dashboard usava outra — mostrava todos os
// checkpoints do item, de qualquer responsável, e contava a data de início —
// e o mesmo filtro de pessoa dava duas respostas. Mora aqui para as duas telas
// lerem da mesma fonte.

/** Itens encerrados/mortos não contam como "sendo tocados na semana". */
export const HIDDEN_STATUS = new Set(["CANCELADA", "ARQUIVADO"]);

/** O prazo cai na semana. */
export function caiNaSemana(cp: CheckpointItem, weekStart: Date, weekEnd: Date): boolean {
  const t = new Date(cp.dueDate).getTime();
  return t >= new Date(weekStart).getTime() && t <= new Date(weekEnd).getTime();
}

/** Prazo já passou e ninguém fechou. Aparece na semana, em vermelho. */
export function estaAtrasado(cp: CheckpointItem, weekStart: Date): boolean {
  return !cp.isCompleted && new Date(cp.dueDate).getTime() < new Date(weekStart).getTime();
}

/**
 * Fechado nesta semana, mesmo que o prazo fosse de antes.
 *
 * Mantém na lista o atrasado que a pessoa acabou de concluir (senão ele
 * evaporava no clique) e mostra, na semana, o trabalho que foi fechado nela.
 */
export function concluidoNaSemana(cp: CheckpointItem, weekStart: Date, weekEnd: Date): boolean {
  if (!cp.completedAt) return false;
  const t = new Date(cp.completedAt).getTime();
  return t >= new Date(weekStart).getTime() && t <= new Date(weekEnd).getTime();
}

/**
 * Começou antes do fim da semana e vence depois dela: o trabalho atravessa a
 * semana. Sem data de início o checkpoint é pontual e nunca está "em
 * andamento". Concluído antes da semana não conta — já não está acontecendo.
 *
 * A Weekly é o retrato do que cada pessoa está tocando, e um checkpoint de
 * três semanas sumia nas semanas do meio, justamente quando o trabalho
 * acontecia. O dashboard segue a mesma regra (antes ficava só no prazo, e a
 * mesma pessoa via listas diferentes nas duas telas). A linha mostra "até
 * dd/mm", para o prazo fora da semana não se ler como prazo desta semana.
 */
export function emAndamentoNaSemana(cp: CheckpointItem, weekStart: Date, weekEnd: Date): boolean {
  if (!cp.startDate) return false;
  if (new Date(cp.startDate).getTime() > new Date(weekEnd).getTime()) return false;
  if (new Date(cp.dueDate).getTime() <= new Date(weekEnd).getTime()) return false;
  return !cp.completedAt || new Date(cp.completedAt).getTime() >= new Date(weekStart).getTime();
}

/** Da semana: vence nela, está atrasado ou foi concluído nela. */
export function checkpointDaSemana(cp: CheckpointItem, weekStart: Date, weekEnd: Date): boolean {
  return (
    caiNaSemana(cp, weekStart, weekEnd) ||
    estaAtrasado(cp, weekStart) ||
    concluidoNaSemana(cp, weekStart, weekEnd)
  );
}

/** Da Weekly de Rituais: o da semana mais o que está em andamento nela. */
export function checkpointDaWeekly(cp: CheckpointItem, weekStart: Date, weekEnd: Date): boolean {
  return checkpointDaSemana(cp, weekStart, weekEnd) || emAndamentoNaSemana(cp, weekStart, weekEnd);
}

/**
 * O item como a linha de UMA pessoa na Weekly o mostra, ou null se ele não
 * aparece para ela. Sem `memberId` ("Todos"), o item como a Weekly inteira o
 * mostra, somando as linhas de todo mundo.
 *
 * - Um checkpoint entra se é da Weekly (`checkpointDaWeekly`: vence na semana,
 *   está atrasado, foi concluído nela ou está em andamento) — ele ou algum
 *   descendente — e é da pessoa: o responsável dele manda; sem responsável,
 *   herda do ancestral mais próximo que tenha, e só na falta dele vale quem
 *   responde pelo item.
 * - `visiveis`: as pessoas que a Weekly lista (ativas, não visitantes).
 *   Responsável fora dela não conta — o checkpoint de quem saiu do time herda
 *   como se não tivesse dono, igual à Weekly. Ausente, todo mundo conta.
 * - Os ancestrais de um checkpoint que entrou ficam como contexto, mesmo que
 *   sejam de outra pessoa — senão o subcheckpoint aparecia solto.
 * - O item aparece se a pessoa responde por ele ou se sobrou algum checkpoint
 *   dela. Em "Todos", some o item sem ninguém visível que responda por ele
 *   ou por um checkpoint seu: na Weekly ele não tem linha onde entrar.
 *
 * É a árvore podada, não a lista achatada da Weekly, porque o dashboard
 * renderiza a árvore (com os subcheckpoints recolhíveis).
 */
export function recortarParaPessoa<T extends WeeklyItem>(
  item: T,
  weekStart: Date,
  weekEnd: Date,
  memberId?: string,
  visiveis?: Set<string>
): T | null {
  if (HIDDEN_STATUS.has(item.status)) return null;
  const ids = (ms: { id: string }[]) =>
    ms.map((m) => m.id).filter((id) => !visiveis || visiveis.has(id));
  const donosDoItem = ids(item.members);
  const respondePeloItem = !!memberId && donosDoItem.includes(memberId);
  // Alguém visível responde por um checkpoint que entrou — inclusive o
  // ancestral de contexto, como na Weekly (só importa em "Todos").
  let temDono = false;

  function temDaSemana(cp: CheckpointItem): boolean {
    return (
      checkpointDaWeekly(cp, weekStart, weekEnd) ||
      (cp.children ?? []).some(temDaSemana)
    );
  }
  /** `herdados`: responsáveis efetivos do pai (no topo, os do item). */
  function podar(cps: CheckpointItem[], herdados: string[]): CheckpointItem[] {
    const out: CheckpointItem[] = [];
    for (const cp of cps) {
      const proprios = ids(cp.members);
      const donos = proprios.length > 0 ? proprios : herdados;
      const daPessoa = !memberId || donos.includes(memberId);
      const children = podar(cp.children ?? [], donos);
      const daSemana = daPessoa && temDaSemana(cp);
      if (daSemana && donos.length > 0) temDono = true;
      if (daSemana || children.length > 0) {
        out.push({ ...cp, children });
      }
    }
    return out;
  }

  const checkpoints = podar(item.checkpoints, donosDoItem);
  if (memberId && !respondePeloItem && checkpoints.length === 0) return null;
  if (!memberId && visiveis && donosDoItem.length === 0 && !temDono) return null;
  return { ...item, checkpoints };
}
