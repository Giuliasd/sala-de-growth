/**
 * Regras do card "Precisa de você" do dashboard.
 *
 * O card responde "o que eu faço agora?": primeiro o que a pessoa marcou como
 * prioridade da semana (a estrela da Weekly), depois o resto pelo prazo —
 * atrasado, hoje, ainda nesta semana. Cada item aparece UMA vez, no grupo do
 * seu checkpoint pendente mais urgente: agrupar por checkpoint repetia o nome
 * da iniciativa em cada linha e escondia que quatro pendências eram da mesma
 * frente de trabalho.
 *
 * Lógica pura, fora do componente, pelo mesmo motivo de `weekly-grouping`:
 * merece teste e não pode puxar `lib/session` para dentro do teste.
 */

import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";
import type { FlatCheckpoint } from "@/lib/weekly-grouping";

export type Urgencia = "atrasado" | "hoje" | "semana";

const ORDEM: Record<Urgencia, number> = { atrasado: 0, hoje: 1, semana: 2 };
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Urgência de um prazo frente a `hoje` (meia-noite UTC da data local — as
 * datas do produto são gravadas assim). Antes de hoje é atrasado, mesmo que
 * seja desta semana: o "Atrasado" do card é contra o dia, não contra a
 * segunda-feira como na Weekly.
 */
export function urgenciaDoPrazo(prazo: Date | string, hoje: Date): Urgencia {
  const t = new Date(prazo).getTime();
  const h = hoje.getTime();
  if (t < h) return "atrasado";
  if (t < h + DIA_MS) return "hoje";
  return "semana";
}

/** A árvore em pré-ordem, com o nível — o formato que `WeeklyCheckpoints` lê. */
export function achatar(cps: CheckpointItem[], depth = 0): FlatCheckpoint[] {
  const out: FlatCheckpoint[] = [];
  for (const cp of cps) {
    out.push({ cp, depth });
    out.push(...achatar(cp.children ?? [], depth + 1));
  }
  return out;
}

/**
 * As pendências que contam: checkpoint aberto cujo ancestral não está aberto.
 * Um "Checklist de QA" aberto com três subcheckpoints abertos é UMA coisa a
 * fazer, não quatro — contar todos os nós inflava o resumo do topo.
 */
export function pendenciasDeTopo(lista: FlatCheckpoint[]): FlatCheckpoint[] {
  const out: FlatCheckpoint[] = [];
  // abertoNoNivel[d] = o último nó visto no nível d está aberto.
  const abertoNoNivel: boolean[] = [];
  for (const f of lista) {
    abertoNoNivel.length = f.depth;
    const ancestralAberto = abertoNoNivel.some(Boolean);
    const aberto = !f.cp.isCompleted;
    if (aberto && !ancestralAberto) out.push(f);
    abertoNoNivel[f.depth] = aberto;
  }
  return out;
}

export type EntradaPrecisa<T> = {
  item: T;
  checkpoints: FlatCheckpoint[];
  urgencia: Urgencia;
  foco: boolean;
};

export type PrecisaDeVoce<T> = {
  prioridades: EntradaPrecisa<T>[];
  atrasado: EntradaPrecisa<T>[];
  hoje: EntradaPrecisa<T>[];
  semana: EntradaPrecisa<T>[];
  /** Pendências por prazo, em todos os grupos (prioridade incluída). */
  contagem: Record<Urgencia, number>;
};

/**
 * Distribui os itens da semana nos grupos do card.
 *
 * - A urgência do item é a do seu checkpoint pendente mais urgente, em
 *   qualquer nível da árvore. Sem pendência, vale o lançamento/análise da
 *   semana (hoje, se cair hoje); sem nada disso, "nesta semana".
 * - Prioridade da semana tira o item do grupo de prazo e o põe no topo. As
 *   datas dos checkpoints continuam pintando o atraso dentro do card.
 * - Dentro de cada grupo: o prazo pendente mais cedo primeiro, depois o nome.
 */
export function montarPrecisaDeVoce<T extends WeeklyItem & { kind: string }>(
  itens: T[],
  { hoje, focados }: { hoje: Date; focados: Set<string> }
): PrecisaDeVoce<T> {
  const contagem: Record<Urgencia, number> = { atrasado: 0, hoje: 0, semana: 0 };
  const comPrazo: { entrada: EntradaPrecisa<T>; prazo: number }[] = [];

  for (const item of itens) {
    const checkpoints = achatar(item.checkpoints);
    for (const f of pendenciasDeTopo(checkpoints)) {
      contagem[urgenciaDoPrazo(f.cp.dueDate, hoje)]++;
    }

    const abertos = checkpoints.filter((f) => !f.cp.isCompleted);
    let urgencia: Urgencia = "semana";
    let prazo = Number.POSITIVE_INFINITY;
    for (const f of abertos) {
      const u = urgenciaDoPrazo(f.cp.dueDate, hoje);
      if (ORDEM[u] < ORDEM[urgencia]) urgencia = u;
      prazo = Math.min(prazo, new Date(f.cp.dueDate).getTime());
    }
    if (abertos.length === 0) {
      const marcos = [
        item.launchThisWeek ? item.launchDate : null,
        item.analysisThisWeek ? item.analysisDate : null,
      ].filter((d): d is Date => !!d);
      if (marcos.some((d) => urgenciaDoPrazo(d, hoje) === "hoje")) urgencia = "hoje";
      for (const d of marcos) prazo = Math.min(prazo, new Date(d).getTime());
    }

    comPrazo.push({
      entrada: { item, checkpoints, urgencia, foco: focados.has(item.id) },
      prazo,
    });
  }

  comPrazo.sort(
    (a, b) => a.prazo - b.prazo || a.entrada.item.name.localeCompare(b.entrada.item.name, "pt-BR")
  );

  const out: PrecisaDeVoce<T> = { prioridades: [], atrasado: [], hoje: [], semana: [], contagem };
  for (const { entrada } of comPrazo) {
    if (entrada.foco) out.prioridades.push(entrada);
    else out[entrada.urgencia].push(entrada);
  }
  return out;
}

/**
 * Quantos itens cada pessoa tem numa lista — a coluna da tabela da liderança.
 * Item com mais de um responsável conta para cada um (como na Weekly).
 */
export function contarPorPessoa(itens: { members: { id: string }[] }[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const item of itens) {
    for (const m of item.members) n.set(m.id, (n.get(m.id) ?? 0) + 1);
  }
  return n;
}

/** Dias sem atualizar o valor até o KR contar como parado. */
export const KR_PARADO_DIAS = 7;

/**
 * KR parado: sem atualização há `KR_PARADO_DIAS` dias ou mais — ou nunca
 * atualizado. É a "Atualização de KR" que o ritual cobra; uma semana inteira
 * sem número novo é o sinal de que ninguém olhou.
 */
export function krParado(lastUpdatedAt: Date | string | null, hoje: Date): boolean {
  if (!lastUpdatedAt) return true;
  return hoje.getTime() - new Date(lastUpdatedAt).getTime() >= KR_PARADO_DIAS * DIA_MS;
}

/** Dias inteiros desde a última atualização (null = nunca). */
export function diasDesde(data: Date | string | null, hoje: Date): number | null {
  if (!data) return null;
  return Math.max(0, Math.floor((hoje.getTime() - new Date(data).getTime()) / DIA_MS));
}

/**
 * O aviso das prioridades, com a regra e o texto da Weekly de Rituais: uma ou
 * duas por pessoa. Zero só é cobrado se há item na semana — uma semana só de
 * ações pode não ter escolha difícil a fazer. Sem aviso, `null`.
 */
export function avisoDePrioridades(marcadas: number, temItens: boolean): string | null {
  if (marcadas > 2) return `${marcadas} prioridades marcadas — o máximo são 2 prioridades na semana.`;
  if (marcadas === 0 && temItens) {
    return "Sem prioridade da semana. Marque com a estrela até 2 atividades de mais impacto.";
  }
  return null;
}
