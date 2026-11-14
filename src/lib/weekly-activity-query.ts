/**
 * Consulta da Weekly SEM checagem de sessão.
 *
 * Não é server action de propósito: um export de arquivo "use server" é
 * chamável pelo cliente, e qualquer parâmetro "já autenticado" seria forjável.
 * Aqui ficam só os módulos do servidor que JÁ passaram pelo gate de permissão
 * (o registro da semana, chamado depois do `requireEditPermission` das actions).
 * Quem expõe a consulta ao cliente é `getWeeklyActivity`, em
 * `actions/weekly-activity.ts`, que confere a sessão antes de chamar esta.
 */

import { prisma, withDbRetry } from "@/lib/prisma";
import {
  EXPERIMENTO_SEM_PENDENCIA_STATUSES,
  INICIATIVA_SEM_PENDENCIA_STATUSES,
} from "@/lib/statusConfig";
import { ExperimentoStatus, IniciativaStatus } from "@/generated/prisma/enums";
import { parseISODateUTC, weekRangeUTC } from "@/lib/date-utils";
import { progressoDoMarco, type MarcoCheckpoint, type ProgressoDoMarco } from "@/lib/checkpoint-marco";
import type { AnotacaoDoRegistro } from "@/lib/registro-semanal-tipos";

export type CheckpointItem = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  isCompleted: boolean;
  completedAt: Date | null;
  /** Categoria (hoje só "comunicação"); null = checkpoint comum. */
  categoria: string | null;
  members: { id: string; name: string }[];
  /** Tags do checkpoint (configuradas no item), na ordem do item. */
  tags: { id: string; name: string; color: string }[];
  // true quando o checkpoint (pai) ainda está aberto mas já tem ao menos um
  // subcheckpoint concluído — mostra a tag "Em progresso" no dashboard.
  inProgress: boolean;
  /**
   * Marco com checkpoints necessários: o progresso ("3/5", em risco). Vem
   * calculado do servidor porque os necessários nem sempre caem na semana
   * consultada. null nos demais.
   */
  progressoMarco?: ProgressoDoMarco<MarcoCheckpoint> | null;
  // Subcheckpoints, aninhados. No dashboard vêm recolhidos por padrão.
  children: CheckpointItem[];
  /** Para o registro da semana decidir se ele era "planejado". */
  createdAt?: Date;
  updatedAt?: Date;
  /** A passagem dele pela semana, quando a semana tem registro. */
  registro?: AnotacaoDoRegistro;
};

// Formato cru do checkpoint vindo do Prisma — o último nível da árvore não
// traz `children`, daí o campo opcional.
type RawCheckpoint = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  isCompleted: boolean;
  completedAt: Date | null;
  categoria: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: { id: string; name: string }[];
  tags: { id: string; name: string; color: string }[];
  /** Necessários do marco (vazio nos demais). */
  requisitos: MarcoCheckpoint[];
  children?: RawCheckpoint[];
};

function toCheckpointItem(cp: RawCheckpoint): CheckpointItem {
  const children = (cp.children ?? []).map(toCheckpointItem);
  return {
    id: cp.id, name: cp.name, description: cp.description,
    startDate: cp.startDate, dueDate: cp.dueDate, isCompleted: cp.isCompleted,
    completedAt: cp.completedAt, categoria: cp.categoria, members: cp.members, tags: cp.tags,
    createdAt: cp.createdAt, updatedAt: cp.updatedAt,
    // "Em progresso" olha só os filhos diretos, como no detalhe da iniciativa.
    inProgress: !cp.isCompleted && children.some((c) => c.isCompleted),
    progressoMarco:
      cp.categoria === "MARCO"
        ? progressoDoMarco(
            { ...cp, parentId: null, requisitoIds: cp.requisitos.map((r) => r.id) },
            new Map(cp.requisitos.map((r) => [r.id, r]))
          )
        : null,
    children,
  };
}

export type WeeklyItem = {
  id: string;
  name: string;
  status: string;
  // Prioridade só existe em iniciativas; nos experimentos vem null.
  priority: string | null;
  launchDate: Date | null;
  launchThisWeek: boolean;
  launchNextWeek: boolean;
  // Análise de resultados: mesmo par de flags do lançamento.
  analysisDate: Date | null;
  analysisThisWeek: boolean;
  analysisNextWeek: boolean;
  checkpoints: CheckpointItem[];
  frente: { id: string; name: string };
  members: { id: string; name: string }[];
};

export type WeeklyActivityResult = {
  iniciativas: WeeklyItem[];
  experimentos: WeeklyItem[];
  weekStart: Date;
  weekEnd: Date;
  nextWeekStart: Date;
  nextWeekEnd: Date;
};

export async function lerWeeklyActivity(
  memberId?: string,
  /** Segunda-feira da semana desejada, "yyyy-mm-dd". Sem isso, a semana de hoje. */
  weekOf?: string,
  /**
   * Só um item — o registro da semana usa para anotar o que um item tem na
   * semana antes de uma edição nele, sem buscar a semana inteira.
   */
  soItem?: { kind: "iniciativa" | "experimento"; id: string }
): Promise<WeeklyActivityResult> {
  // Falha de banco PROPAGA — esta função nunca devolve semana vazia por erro.
  // Mostrar "Nenhuma atividade esta semana" porque o banco piscou é a pior
  // mentira possível numa ferramenta de planejamento: o time olha o dashboard e
  // conclui que não há nada agendado. Quem trata é o `error.tsx` do dashboard,
  // que já existe justamente para isso ("tente novamente").
  const { weekStart, weekEnd, nextWeekStart, nextWeekEnd } = weekRangeUTC(
    weekOf ? parseISODateUTC(weekOf) ?? undefined : undefined
  );

  // Um checkpoint entra na busca da semana quando o período dele (início →
  // prazo) cruza a semana, quando o prazo cai nela — e também quando o prazo
  // já PASSOU e ele não foi concluído.
  //
  // A primeira cláusula é o EM ANDAMENTO. Antes ela era "início dentro da
  // semana", e o checkpoint longo — começou numa semana, vence semanas depois
  // — só existia na Weekly da semana em que começava e na do prazo. Nas do
  // meio, que é quando o trabalho acontece, ele não aparecia. Cruzar o
  // intervalo cobre os dois casos (o "começa nesta semana" é um cruzamento).
  // Sem data de início, o checkpoint é pontual e só o prazo conta. Concluído
  // antes da semana não está mais em andamento nela — escrito como OR
  // positivo pelo mesmo motivo do corte de item abaixo (NULL em NOT some).
  //
  // Essa terceira cláusula é o atrasado. Sem ela, quem não entregou
  // desaparecia do ritual: a Weekly mostrava só o que vence de segunda a
  // domingo, então o combinado da semana passada que ninguém fechou não
  // existia na tela. (Quem decide o que exibir é a Weekly, que pinta o
  // atrasado em vermelho; o dashboard usa a mesma consulta.)
  //
  // Sem limite de quão antigo: prazo de dois meses atrás ainda pendente é
  // exatamente o que ninguém deveria conseguir esquecer.
  // A quarta cláusula é o CONCLUÍDO NESTA SEMANA. Sem ela, marcar um
  // atrasado o fazia evaporar da tela: ele estava ali só por estar pendente,
  // e a conclusão o tirava do filtro no mesmo clique. Agora ele fica,
  // riscado — e de quebra o trabalho fechado nesta semana aparece nela,
  // mesmo que o prazo fosse de antes.
  const inWeekDateOr = [
    {
      startDate: { lte: weekEnd },
      dueDate: { gte: weekStart },
      OR: [{ completedAt: null }, { completedAt: { gte: weekStart } }],
    },
    { dueDate: { gte: weekStart, lte: weekEnd } },
    { dueDate: { lt: weekStart }, isCompleted: false },
    { completedAt: { gte: weekStart, lte: weekEnd } },
  ];
  // O que conta como trabalho DA semana num item encerrado ou pausado: vencia
  // nela ou foi concluído nela. Mais estreito que `inWeekDateOr` de propósito
  // — o atrasado e o em andamento não seguram um item pausado na Weekly, senão
  // ele voltava a aparecer toda semana, que é o ruído que o corte evita.
  const fechouOuVenceuNaSemana = [
    { dueDate: { gte: weekStart, lte: weekEnd } },
    { completedAt: { gte: weekStart, lte: weekEnd } },
  ];
  // No dashboard só listamos checkpoints de topo, mas o pai deve aparecer quando
  // ele OU algum subcheckpoint seu cai na semana — senão, ao trabalhar no
  // subcheckpoint (a data que importa é a do filho), o pai (e sua tag
  // "Em progresso") não apareceria.
  const checkpointDateWhere = {
    OR: [
      ...inWeekDateOr,
      { children: { some: { OR: inWeekDateOr } } },
      // Terceiro nível: um neto na semana também traz o topo. Só com os
      // filhos diretos, trabalhar num sub-subcheckpoint sumia da Weekly.
      { children: { some: { children: { some: { OR: inWeekDateOr } } } } },
    ],
  };

  // Busca iniciativas ativas esta semana (intervalo sobrepõe a semana) ou com lançamento esta/próxima semana.
  // `withDbRetry` porque o essential-0 corta conexão com frequência (dezenas de
  // "Connection terminated" por dia em prod); uma retentativa resolve o blip sem
  // o usuário ver nada. O mesmo que o gate de auth já fazia em lib/session.ts.

  // Trabalho encerrado cujo prazo já passou sai da semana: item concluído e
  // sem nada pendente ficava ocupando a Weekly até o endDate planejado,
  // misturado com o que ainda está em curso.
  //
  // O corte é contra a SEMANA EXIBIDA, não contra hoje: navegar para uma
  // semana de agosto mostra o que estava vivo naquela semana, não o que
  // sobrou depois.
  //
  // "Sem pendência" exclui de propósito ESCREVENDO_RELATORIO (iniciativa) e
  // RELATORIO_PRONTO (experimento): ali ainda há trabalho na mão de alguém, e
  // sumir da Weekly seria esconder o que falta. Item sem endDate também fica
  // — sem data não dá para dizer que passou.
  //
  // Escrito como OR positivo, e não como NOT(concluído AND vencido): em SQL,
  // `NOT (... AND endDate < x)` com endDate NULL vira UNKNOWN, e a linha cai
  // fora — todo item sem data de fim sumiria da Weekly de brinde.
  //
  // A última cláusula (e a mesma no pausado, abaixo) é a exceção: item que
  // teve checkpoint concluído ou vencendo NESTA semana fica, encerrado ou
  // pausado. Sem ela, concluir a iniciativa na sexta — ou pausá-la na terça —
  // apagava da semana o trabalho que foi feito nela: o item saía e levava os
  // checkpoints junto, e a reunião de sexta não via o que aconteceu. Esse item
  // mostra só os checkpoints que justificam ele estar ali (ver
  // `entrouSoPelosCheckpoints`).
  const comCheckpointNaSemana = { checkpoints: { some: { OR: fechouOuVenceuNaSemana } } };
  const iniciativaAindaViva = {
    OR: [
      { status: { notIn: [...INICIATIVA_SEM_PENDENCIA_STATUSES] } },
      { endDate: null },
      { endDate: { gte: weekStart } },
      comCheckpointNaSemana,
    ],
  };
  const experimentoAindaVivo = {
    OR: [
      { status: { notIn: [...EXPERIMENTO_SEM_PENDENCIA_STATUSES] } },
      { endDate: null },
      { endDate: { gte: weekStart } },
      comCheckpointNaSemana,
    ],
  };

  // Pausado é mais estrito que concluído: só entra na semana se for ELA a
  // semana em que o item termina. Trabalho pausado não está sendo tocado —
  // ficar listado toda semana até o endDate planejado é ruído, e some da
  // Weekly em vez de ser lido como combinado do time.
  //
  // Por isso o pausado SEM endDate também sai: "não termina nesta semana"
  // inclui "não se sabe quando termina". É o contrário do critério do
  // concluído acima, onde a falta de data significa "não dá para afirmar
  // que passou" — aqui a pergunta é outra, e a resposta honesta é não.
  //
  // Escrito duas vezes porque os enums de status são distintos (PAUSADA na
  // iniciativa, PAUSADO no experimento); um helper compartilhado só
  // funcionaria alargando o tipo para string e perdendo a checagem.
  const naSemanaSePausada = {
    OR: [
      { NOT: { status: IniciativaStatus.PAUSADA } },
      { endDate: { gte: weekStart, lte: weekEnd } },
      comCheckpointNaSemana,
    ],
  };
  const naSemanaSePausado = {
    OR: [
      { NOT: { status: ExperimentoStatus.PAUSADO } },
      { endDate: { gte: weekStart, lte: weekEnd } },
      comCheckpointNaSemana,
    ],
  };

  // Filtro por pessoa: o item entra se ela responde por ele OU por algum
  // checkpoint dele na semana — em qualquer nível. Só olhar os responsáveis do
  // item escondia o trabalho de quem cuida de um subcheckpoint: nem o item nem
  // o checkpoint pai apareciam para ela. (`checkpoints` é a relação plana:
  // todo nível da árvore aponta direto para o item.)
  const daPessoa = memberId
    ? [
        {
          OR: [
            { members: { some: { id: memberId } } },
            { checkpoints: { some: { members: { some: { id: memberId } }, OR: inWeekDateOr } } },
          ],
        },
      ]
    : [];

  const doItem = (kind: "iniciativa" | "experimento") =>
    soItem ? (soItem.kind === kind ? { id: soItem.id } : { id: { in: [] as string[] } }) : {};

  const [iniciativas, experimentos] = await withDbRetry(() => Promise.all([
    prisma.iniciativa.findMany({
      where: {
        ...doItem("iniciativa"),
        deletedAt: null,
        AND: [iniciativaAindaViva, naSemanaSePausada, ...daPessoa],
        OR: [
          { startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
          { launchDate: { gte: weekStart, lte: nextWeekEnd } },
          { analysisDate: { gte: weekStart, lte: nextWeekEnd } },
          // Checkpoint na semana traz a iniciativa mesmo que o intervalo dela
          // não cubra a semana: é trabalho combinado para agora.
          { checkpoints: { some: { OR: inWeekDateOr } } },
        ],
      },
      select: {
        id: true, name: true, status: true, priority: true, launchDate: true, analysisDate: true,
        endDate: true,
        frente: { select: { id: true, name: true } },
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.experimento.findMany({
      where: {
        ...doItem("experimento"),
        deletedAt: null,
        AND: [experimentoAindaVivo, naSemanaSePausado, ...daPessoa],
        OR: [
          { startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
          { launchDate: { gte: weekStart, lte: nextWeekEnd } },
          { analysisDate: { gte: weekStart, lte: nextWeekEnd } },
          { checkpoints: { some: { OR: inWeekDateOr } } },
        ],
      },
      select: {
        id: true, name: true, status: true, launchDate: true, analysisDate: true,
        endDate: true,
        frente: { select: { id: true, name: true } },
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ]));

  const iniciativaIds = iniciativas.map((i) => i.id);
  const experimentoIds = experimentos.map((e) => e.id);

  const cpFields = {
    id: true, name: true, description: true, startDate: true, dueDate: true,
    isCompleted: true, completedAt: true, categoria: true, createdAt: true, updatedAt: true,
    members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    tags: { select: { id: true, name: true, color: true }, orderBy: { order: "asc" } },
    requisitos: {
      select: { id: true, name: true, parentId: true, categoria: true, isCompleted: true, dueDate: true },
    },
  } as const;

  // A árvore tem no máximo 3 níveis (topo + 2 de subcheckpoint), então descemos
  // exatamente dois níveis de filhos. Os subcheckpoints vêm inteiros, mesmo os
  // que caem fora da semana: o card mostra a quebra completa do checkpoint pai.
  const cpTreeSelect = {
    ...cpFields,
    children: {
      orderBy: { dueDate: "asc" },
      select: {
        ...cpFields,
        children: { orderBy: { dueDate: "asc" }, select: cpFields },
      },
    },
  } as const;

  // Busca checkpoints da semana para os itens encontrados
  const [iniciativaCheckpoints, experimentoCheckpoints] = await withDbRetry(() => Promise.all([
    iniciativaIds.length > 0
      ? prisma.initiativeCheckpoint.findMany({
          // A lista é de checkpoints de topo (parentId null); os subcheckpoints
          // vêm aninhados dentro de cada um.
          where: { initiativeId: { in: iniciativaIds }, parentId: null, ...checkpointDateWhere },
          select: { ...cpTreeSelect, initiativeId: true },
          orderBy: { dueDate: "asc" },
        })
      : [],
    experimentoIds.length > 0
      ? prisma.experimentoCheckpoint.findMany({
          where: { experimentoId: { in: experimentoIds }, parentId: null, ...checkpointDateWhere },
          select: { ...cpTreeSelect, experimentoId: true },
          orderBy: { dueDate: "asc" },
        })
      : [],
  ]));

  // Indexar checkpoints por pai
  const cpByIniciativa = new Map<string, CheckpointItem[]>();
  for (const cp of iniciativaCheckpoints) {
    if (!cpByIniciativa.has(cp.initiativeId)) cpByIniciativa.set(cp.initiativeId, []);
    cpByIniciativa.get(cp.initiativeId)!.push(toCheckpointItem(cp));
  }

  const cpByExperimento = new Map<string, CheckpointItem[]>();
  for (const cp of experimentoCheckpoints) {
    if (!cpByExperimento.has(cp.experimentoId)) cpByExperimento.set(cp.experimentoId, []);
    cpByExperimento.get(cp.experimentoId)!.push(toCheckpointItem(cp));
  }

  // Espelho, em memória, do corte do `where`: o item que só passou por causa
  // de `comCheckpointNaSemana`. Ele mostra só os checkpoints que fecharam ou
  // venciam na semana (e os ancestrais deles) — o resto da árvore de um item
  // pausado, atrasado ou em andamento, é justamente o que o corte esconde.
  const naSemana = (d: Date | null) => !!d && d >= weekStart && d <= weekEnd;
  function entrouSoPelosCheckpoints(
    item: { status: string; endDate: Date | null },
    semPendencia: readonly string[],
    pausado: string
  ): boolean {
    const encerrado = semPendencia.includes(item.status) && !!item.endDate && item.endDate < weekStart;
    const pausadoForaDaSemana = item.status === pausado && !naSemana(item.endDate);
    return encerrado || pausadoForaDaSemana;
  }
  function soOsDaSemana(cps: CheckpointItem[]): CheckpointItem[] {
    const out: CheckpointItem[] = [];
    for (const cp of cps) {
      const children = soOsDaSemana(cp.children);
      if (naSemana(cp.dueDate) || naSemana(cp.completedAt) || children.length > 0) {
        out.push({ ...cp, children });
      }
    }
    return out;
  }
  function checkpointsDoItem(
    lista: CheckpointItem[] | undefined,
    item: { status: string; endDate: Date | null },
    semPendencia: readonly string[],
    pausado: string
  ): CheckpointItem[] {
    const cps = lista ?? [];
    return entrouSoPelosCheckpoints(item, semPendencia, pausado) ? soOsDaSemana(cps) : cps;
  }

  function isThisWeek(d: Date | null) {
    if (!d) return false;
    return d >= weekStart && d <= weekEnd;
  }
  function isNextWeek(d: Date | null) {
    if (!d) return false;
    return d >= nextWeekStart && d <= nextWeekEnd;
  }

  return {
    iniciativas: iniciativas.map((i) => ({
      id: i.id, name: i.name, status: i.status, priority: i.priority, launchDate: i.launchDate,
      launchThisWeek: isThisWeek(i.launchDate),
      launchNextWeek: isNextWeek(i.launchDate),
      analysisDate: i.analysisDate,
      analysisThisWeek: isThisWeek(i.analysisDate),
      analysisNextWeek: isNextWeek(i.analysisDate),
      checkpoints: checkpointsDoItem(
        cpByIniciativa.get(i.id), i, INICIATIVA_SEM_PENDENCIA_STATUSES, IniciativaStatus.PAUSADA
      ),
      frente: i.frente,
      members: i.members,
    })),
    experimentos: experimentos.map((e) => ({
      id: e.id, name: e.name, status: e.status, priority: null, launchDate: e.launchDate,
      launchThisWeek: isThisWeek(e.launchDate),
      launchNextWeek: isNextWeek(e.launchDate),
      analysisDate: e.analysisDate,
      analysisThisWeek: isThisWeek(e.analysisDate),
      analysisNextWeek: isNextWeek(e.analysisDate),
      checkpoints: checkpointsDoItem(
        cpByExperimento.get(e.id), e, EXPERIMENTO_SEM_PENDENCIA_STATUSES, ExperimentoStatus.PAUSADO
      ),
      frente: e.frente,
      members: e.members,
    })),
    weekStart, weekEnd, nextWeekStart, nextWeekEnd,
  };
}
