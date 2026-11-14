/**
 * Registro da semana — as regras, sem banco.
 *
 * A Weekly é calculada sobre o estado ATUAL dos checkpoints: o que era
 * remarcado, excluído ou fechado depois sumia da semana em que estava. O
 * registro (model `RegistroSemanal`) anota cada checkpoint que fez parte da
 * semana e, no fechamento (sexta, 14:59 no padrão — `janelaDoRitual`), congela como ela
 * terminou para ele. Aqui moram as regras que decidem isso e a junção do
 * registro com a Weekly; o acesso ao banco fica em `registro-semanal-db.ts`.
 *
 * Lógica pura pelo mesmo motivo de `weekly-grouping`: merece teste e não pode
 * puxar `lib/session` para dentro dele.
 */

import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";
import { formatDayMonthNumeric, type JanelaDoRitual } from "@/lib/date-utils";
import type { StatusFamily } from "@/lib/statusConfig";

import type { AnotacaoDoRegistro, Desfecho, Origem } from "@/lib/registro-semanal-tipos";

export type { AnotacaoDoRegistro, Desfecho, Origem };

/** O suficiente de um checkpoint para decidir se ele é da semana. */
type DatasDoCheckpoint = {
  startDate: Date | null;
  dueDate: Date;
  isCompleted: boolean;
  completedAt: Date | null;
};

const t = (d: Date | string) => new Date(d).getTime();

/** Domingo 23:59:59.999 UTC da semana — o fim da semana do CALENDÁRIO. */
export function fimDaSemana(janela: JanelaDoRitual): Date {
  return new Date(janela.weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

/**
 * O checkpoint entra no registro da semana? A mesma pergunta da Weekly, com
 * uma diferença: "concluído na semana" é pela janela do RITUAL (sexta 15:00 a
 * sexta 14:59), não pelo calendário. Concluir no sábado já é trabalho da
 * semana seguinte — a de antes fechou na reunião de sexta.
 */
export function entraNaSemana(cp: DatasDoCheckpoint, janela: JanelaDoRitual): boolean {
  const ini = janela.weekStart.getTime();
  const fim = fimDaSemana(janela).getTime();
  const due = t(cp.dueDate);
  if (due >= ini && due <= fim) return true;
  if (due < ini && !cp.isCompleted) return true;
  if (cp.completedAt && t(cp.completedAt) >= t(janela.abre) && t(cp.completedAt) < t(janela.fecha)) {
    return true;
  }
  // Em andamento: começou até o fim da semana e vence depois dela, sem ter
  // sido concluído antes de a semana abrir.
  if (cp.startDate && t(cp.startDate) <= fim && due > fim) {
    return !cp.completedAt || t(cp.completedAt) >= t(janela.abre);
  }
  return false;
}

/**
 * Planejado é o que estava na Weekly até o fim da segunda — o combinado da
 * reunião de alinhamento. Registrado depois disso, só conta como planejado se
 * o checkpoint já existia e não mudou desde então: se mudou, foi a mudança
 * (prazo trazido para a semana, reaberto) que o colocou ali.
 */
export function origemNaSemana(
  agora: Date,
  cp: { createdAt: Date; updatedAt: Date },
  janela: JanelaDoRitual
): Origem {
  const limite = t(janela.fimDoPlanejamento);
  if (agora.getTime() <= limite) return "PLANEJADO";
  return t(cp.createdAt) <= limite && t(cp.updatedAt) <= limite ? "PLANEJADO" : "ENTROU";
}

/**
 * Como a semana terminou (ou está terminando) para o checkpoint.
 *
 * `atual` é o checkpoint como está agora — null quando foi excluído. Concluído
 * depois do fechamento não conta: a semana fechou com ele aberto.
 */
export function desfechoNaSemana(
  atual: DatasDoCheckpoint | null,
  registro: { prazoAoEntrar: Date; excluidoEm: Date | null },
  janela: JanelaDoRitual
): Desfecho {
  if (!atual || registro.excluidoEm) return "EXCLUIDO";
  if (atual.isCompleted && (!atual.completedAt || t(atual.completedAt) < t(janela.fecha))) {
    return "CONCLUIDO";
  }
  const fim = fimDaSemana(janela).getTime();
  if (t(atual.dueDate) > fim) {
    // Entrou com prazo depois da semana: estava em andamento, não remarcou.
    return t(registro.prazoAoEntrar) > fim ? "EM_ANDAMENTO" : "REMARCADO";
  }
  return "ABERTO";
}

/** Um checkpoint da árvore que entra no registro, com o contexto dele. */
export type NoDoRegistro = {
  cp: CheckpointItem;
  /** Ancestrais, "Pai › Filho"; null no nível principal. */
  caminho: string | null;
  /** Responsáveis efetivos: os do checkpoint, senão herdados do pai ou do item. */
  responsaveisIds: string[];
};

/**
 * Os checkpoints da árvore de um item que entram na semana — os ancestrais
 * que só dão contexto ficam de fora (o caminho guarda o nome deles). Mesma
 * regra de responsável da Weekly: quem responde pelo checkpoint manda; sem
 * ninguém, herda do ancestral mais próximo que tenha, e por fim do item.
 */
export function nosDaSemana(
  item: { members: { id: string }[] },
  arvore: CheckpointItem[],
  janela: JanelaDoRitual
): NoDoRegistro[] {
  const out: NoDoRegistro[] = [];
  const visitar = (cps: CheckpointItem[], herdados: string[], ancestrais: string[]) => {
    for (const cp of cps) {
      const donos = cp.members.length > 0 ? cp.members.map((m) => m.id) : herdados;
      if (entraNaSemana(cp, janela)) {
        out.push({
          cp,
          caminho: ancestrais.length > 0 ? ancestrais.join(" › ") : null,
          responsaveisIds: donos,
        });
      }
      visitar(cp.children ?? [], donos, [...ancestrais, cp.name]);
    }
  };
  visitar(arvore, item.members.map((m) => m.id), []);
  return out;
}

// ─── Junção com a Weekly ─────────────────────────────────────────────────────

export type TagDoRegistro = { id: string; name: string; color: string };

/** O registro como a tela precisa dele. */
export type RegistroDaSemana = {
  id: string;
  checkpointId: string | null;
  kind: "iniciativa" | "experimento";
  itemId: string;
  origem: Origem;
  registradoEm: Date;
  nome: string;
  caminho: string | null;
  categoria: string | null;
  prazoAoEntrar: Date;
  prazo: Date;
  inicio: Date | null;
  concluidoEm: Date | null;
  responsaveisIds: string[];
  /** Tags da cópia — a foto da semana fechada ordena e mostra por elas. */
  tags: TagDoRegistro[];
  itemNome: string;
  itemStatus: string;
  frente: { id: string; name: string };
  /** Remarcações do checkpoint até esta semana, somadas. */
  remarcacoes: number;
  excluidoEm: Date | null;
  /** Nome de quem excluiu — só chega preenchido para a liderança. */
  excluidoPor: string | null;
  /** Congelado no fechamento, ou calculado agora com a semana aberta. */
  desfecho: Desfecho;
  /** Estado atual do checkpoint (null se excluído); só na semana aberta. */
  atual: DatasDoCheckpoint | null;
};

function anotacao(r: RegistroDaSemana, fantasma: boolean, fechada: boolean): AnotacaoDoRegistro {
  return {
    desfecho: r.desfecho,
    origem: r.origem,
    registradoEm: r.registradoEm,
    prazoAoEntrar: r.prazoAoEntrar,
    prazo: r.atual?.dueDate ?? r.prazo,
    remarcacoes: r.remarcacoes,
    excluidoEm: r.excluidoEm,
    excluidoPor: r.excluidoPor,
    concluidoEm: r.atual?.completedAt ?? r.concluidoEm,
    caminho: r.caminho,
    fantasma,
    fechada,
  };
}

/** O checkpoint montado a partir do registro — para quem já não está na lista viva. */
function checkpointDoRegistro(
  r: RegistroDaSemana,
  nomes: Map<string, string>,
  fechada: boolean
): CheckpointItem {
  const atual = fechada ? null : r.atual;
  const concluido = r.desfecho === "CONCLUIDO";
  return {
    id: r.checkpointId ?? `registro-${r.id}`,
    name: r.nome,
    description: null,
    startDate: atual?.startDate ?? r.inicio,
    dueDate: atual?.dueDate ?? r.prazo,
    isCompleted: concluido,
    completedAt: concluido ? (atual?.completedAt ?? r.concluidoEm) : null,
    categoria: r.categoria,
    members: r.responsaveisIds.map((id) => ({ id, name: nomes.get(id) ?? "" })),
    tags: r.tags,
    inProgress: false,
    progressoMarco: null,
    children: [],
    registro: anotacao(r, true, fechada),
  };
}

function itemDoRegistro(r: RegistroDaSemana): WeeklyItem {
  return {
    id: r.itemId,
    name: r.itemNome,
    status: r.itemStatus,
    priority: null,
    launchDate: null,
    launchThisWeek: false,
    launchNextWeek: false,
    analysisDate: null,
    analysisThisWeek: false,
    analysisNextWeek: false,
    checkpoints: [],
    frente: r.frente,
    // Sem responsáveis do item: quem aparece é quem responde pelos
    // checkpoints registrados — o retrato da semana, não o de hoje.
    members: [],
  };
}

type Itens = { iniciativas: WeeklyItem[]; experimentos: WeeklyItem[] };

/**
 * Semana ABERTA: a lista viva da Weekly, com cada checkpoint anotado pelo
 * registro, mais os que saíram dela desde que entraram (remarcados,
 * excluídos, concluídos fora da lista) como linhas "fantasma" no item. Se o
 * item inteiro saiu da Weekly, ele volta montado pelo registro.
 */
export function anotarSemanaAberta(
  vivos: Itens,
  registros: RegistroDaSemana[],
  nomes: Map<string, string>
): Itens {
  const porCheckpoint = new Map(
    registros.filter((r) => r.checkpointId).map((r) => [r.checkpointId!, r])
  );
  const vistos = new Set<string>();

  const anotar = (cps: CheckpointItem[]): CheckpointItem[] =>
    cps.map((cp) => {
      const r = porCheckpoint.get(cp.id);
      if (r) vistos.add(r.id);
      return { ...cp, children: anotar(cp.children ?? []), ...(r && { registro: anotacao(r, false, false) }) };
    });

  const iniciativas = vivos.iniciativas.map((i) => ({ ...i, checkpoints: anotar(i.checkpoints) }));
  const experimentos = vivos.experimentos.map((e) => ({ ...e, checkpoints: anotar(e.checkpoints) }));

  const listas = { iniciativa: iniciativas, experimento: experimentos };
  for (const r of registros) {
    if (vistos.has(r.id)) continue;
    // Ainda está na semana e na lista viva? Já foi anotado. Aqui ficam os
    // que não estão mais nela — mas não os que só não apareceram por estar
    // embaixo de um pai que não foi buscado: esses o desfecho diz que seguem
    // abertos na semana, e a linha fantasma conta a mesma história.
    const lista = listas[r.kind];
    let item = lista.find((i) => i.id === r.itemId);
    if (!item) {
      item = itemDoRegistro(r);
      lista.push(item);
    }
    item.checkpoints = [...item.checkpoints, checkpointDoRegistro(r, nomes, false)];
  }
  return { iniciativas, experimentos };
}

/**
 * Semana FECHADA: tudo sai do registro — a foto do fechamento. Editar um
 * checkpoint hoje não muda o que a semana mostra.
 */
export function itensDaSemanaFechada(registros: RegistroDaSemana[], nomes: Map<string, string>): Itens {
  const iniciativas: WeeklyItem[] = [];
  const experimentos: WeeklyItem[] = [];
  const listas = { iniciativa: iniciativas, experimento: experimentos };
  for (const r of registros) {
    const lista = listas[r.kind];
    let item = lista.find((i) => i.id === r.itemId);
    if (!item) {
      item = itemDoRegistro(r);
      lista.push(item);
    }
    item.checkpoints.push(checkpointDoRegistro(r, nomes, true));
  }
  const porNome = (a: WeeklyItem, b: WeeklyItem) => a.name.localeCompare(b.name, "pt-BR");
  for (const i of [...iniciativas, ...experimentos]) {
    i.checkpoints.sort((a, b) => t(a.dueDate) - t(b.dueDate));
  }
  return { iniciativas: iniciativas.sort(porNome), experimentos: experimentos.sort(porNome) };
}

// ─── Resumo por pessoa ───────────────────────────────────────────────────────

export type ResumoDaSemana = {
  /** Com prazo na semana (o em andamento não tem desfecho a cobrar). */
  total: number;
  concluidos: number;
  remarcados: number;
  abertos: number;
  excluidos: number;
  entraram: number;
};

/** Contagem do que a pessoa tinha na semana, pelos desfechos do registro. */
export function resumir(anotacoes: AnotacaoDoRegistro[]): ResumoDaSemana | null {
  if (anotacoes.length === 0) return null;
  const r: ResumoDaSemana = { total: 0, concluidos: 0, remarcados: 0, abertos: 0, excluidos: 0, entraram: 0 };
  for (const a of anotacoes) {
    if (a.origem === "ENTROU") r.entraram++;
    if (a.desfecho === "EM_ANDAMENTO") continue;
    r.total++;
    if (a.desfecho === "CONCLUIDO") r.concluidos++;
    else if (a.desfecho === "REMARCADO") r.remarcados++;
    else if (a.desfecho === "EXCLUIDO") r.excluidos++;
    else r.abertos++;
  }
  return r;
}

// ─── Rótulos da linha ────────────────────────────────────────────────────────

export type Rotulo = { texto: string; familia: StatusFamily };

/** "ter 21" — dia da semana e dia do mês, no horário de São Paulo. */
export function diaCurto(d: Date | string): string {
  const data = new Date(d);
  const semana = data
    .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" })
    .replace(".", "");
  const dia = data.toLocaleDateString("pt-BR", { day: "numeric", timeZone: "America/Sao_Paulo" });
  return `${semana} ${dia}`;
}

/**
 * Os rótulos que contam a passagem do checkpoint pela semana — na linha, uma
 * bolinha da cor depois do nome, com o texto no tooltip. Cor pela família
 * do design system: peach é atraso (a cor única de atraso do produto), butter
 * o remarcado, sky o que entrou no meio da semana, sage o concluído, neutro o
 * que saiu ou ficou para trás.
 */
export function rotulosDoRegistro(a: AnotacaoDoRegistro, weekStart: Date): Rotulo[] {
  const out: Rotulo[] = [];
  const ini = weekStart.getTime();
  // Só o que venceu na semana passada: o atraso antigo já aparece pela data em
  // vermelho, e uma pill em cada um virava ruído na lista inteira.
  if (t(a.prazoAoEntrar) < ini && t(a.prazoAoEntrar) >= ini - 7 * 24 * 60 * 60 * 1000) {
    out.push({ texto: "veio da semana passada", familia: "peach" });
  }
  if (a.origem === "ENTROU") out.push({ texto: `entrou ${diaCurto(a.registradoEm)}`, familia: "sky" });
  switch (a.desfecho) {
    case "REMARCADO":
      // A vez vai no mesmo texto: é a mesma bolinha (uma por acontecimento).
      out.push({
        texto: [
          `remarcado · ${formatDayMonthNumeric(a.prazoAoEntrar)} → ${formatDayMonthNumeric(a.prazo)}`,
          a.remarcacoes >= 2 && `${a.remarcacoes}ª vez`,
        ]
          .filter(Boolean)
          .join(" · "),
        familia: "butter",
      });
      break;
    case "EXCLUIDO":
      out.push({
        texto: [`excluído${a.excluidoEm ? " " + diaCurto(a.excluidoEm) : ""}`, a.excluidoPor && `por ${a.excluidoPor.split(" ")[0]}`]
          .filter(Boolean)
          .join(" · "),
        familia: "neutral",
      });
      break;
    case "CONCLUIDO":
      // Na lista viva o check já diz; a data importa quando ele só está ali
      // pelo registro (fechado fora da lista, ou na foto da semana).
      if ((a.fantasma || a.fechada) && a.concluidoEm) {
        out.push({ texto: `concluído ${diaCurto(a.concluidoEm)}`, familia: "sage" });
      }
      break;
    case "ABERTO":
      if (a.fechada) out.push({ texto: "ficou aberto", familia: "neutral" });
      break;
  }
  return out;
}
