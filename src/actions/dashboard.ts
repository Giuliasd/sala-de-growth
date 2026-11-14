"use server";

import { prisma, withDbRetry } from "@/lib/prisma";
import { ExperimentoStatus, IniciativaStatus, MemberRole } from "@/generated/prisma/enums";
import { getCurrentMember } from "@/lib/session";
import { progressoAtual } from "@/lib/okr";
import { hojeUTC, weekRangeUTC } from "@/lib/date-utils";
import { progressoDoMarco, resumoDoRisco } from "@/lib/checkpoint-marco";
import { EXPERIMENTO_SEM_PENDENCIA_STATUSES, INICIATIVA_SEM_PENDENCIA_STATUSES } from "@/lib/statusConfig";

async function assertAccess(memberId?: string) {
  const currentUser = await getCurrentMember();
  if (memberId && currentUser.role === "COLABORADOR" && memberId !== currentUser.id) {
    throw new Error("Acesso negado");
  }
}

/**
 * KRs do quarter + progresso geral. O card ordena pelo ritmo (progresso contra
 * o tempo decorrido), então a lista vem plana; a frente vai junto para rotular.
 */
export async function getOKRData(quarterId: string, memberId?: string) {
  await assertAccess(memberId);

  const okrsGravados = await withDbRetry(() =>
    prisma.oKR.findMany({
      where: {
        quarterId,
        ...(memberId ? { members: { some: { id: memberId } } } : {}),
      },
      select: {
        id: true,
        objective: true,
        progressPercent: true,
        currentValue: true,
        targetValue: true,
        measurementType: true,
        initialValue: true,
        monthValue1: true,
        monthValue2: true,
        monthValue3: true,
        unit: true,
        lastUpdatedAt: true,
        frente: { select: { id: true, name: true } },
        members: { select: { id: true }, where: { isActive: true } },
      },
      orderBy: [{ frente: { name: "asc" } }, { objective: "asc" }],
    })
  );

  // Recalculado na leitura (ver progressoAtual): a coluna gravada pode estar velha.
  const okrs = okrsGravados.map((o) => ({ ...o, ...progressoAtual(o) }));
  const overallProgress =
    okrs.length > 0
      ? Math.max(0, okrs.reduce((sum, o) => sum + o.progressPercent, 0) / okrs.length)
      : 0;

  return { okrs, overallProgress };
}

/**
 * Ausências que cruzam a semana de hoje (segunda a domingo, em UTC como as
 * datas do produto). Sem filtro de membro: o card mostra quem do time está
 * fora — é com quem a pessoa não vai poder contar.
 */
export async function getAusenciasDaSemana() {
  await getCurrentMember();
  const { weekStart, weekEnd } = weekRangeUTC();

  return withDbRetry(() =>
    prisma.ausencia.findMany({
      where: { startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        member: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "asc" },
    })
  );
}

/**
 * O que a visão da liderança precisa além da semana: o trabalho que parou.
 *
 * - **Sem próximo passo:** iniciativa ou experimento em andamento sem nenhum
 *   checkpoint aberto. Está "rodando" e ninguém combinou o que vem depois.
 *   Checkpoint aberto e atrasado CONTA como próximo passo: ele já aparece como
 *   atraso, e chamar o item de "sem próximo passo" contradizia a lista.
 * - **Parados:** experimento aguardando resultados com a data de análise
 *   vencida, ou com relatório pronto e ainda não apresentado — os alertas do
 *   card "Precisa de você" da pessoa. O card da visão do time é outro recorte
 *   (`getAguardandoProximoPasso`).
 *
 * Só liderança: é a visão do time inteiro, pessoa por pessoa.
 */
export async function getTravasDoTime() {
  const atual = await getCurrentMember();
  if (atual.role !== MemberRole.LIDERANCA) throw new Error("Acesso negado");
  return buscarTravas();
}

/**
 * As mesmas travas, só as de uma pessoa — para o card "Precisa de você" dela.
 * A pessoa precisa ver a própria trava antes de a liderança vir cobrar.
 */
export async function getTravasDaPessoa(memberId: string) {
  await assertAccess(memberId);
  const [travas, marcosEmRisco] = await Promise.all([buscarTravas(memberId), buscarMarcosEmRisco(memberId)]);
  return { ...travas, marcosEmRisco };
}

/**
 * O item de um marco, com a regra de visibilidade da Weekly de Rituais: item
 * cancelado ou arquivado nunca aparece; o marco que venceu antes desta semana
 * só aparece se o item ainda está vivo (nem encerrado, nem pausado) — senão um
 * marco esquecido num item que acabou ficava no dashboard para sempre. Vale
 * para "Marcos à frente" e para o aviso de marco em risco do "Precisa de você".
 */
function marcoDeItemVisivel(dono: "initiative" | "experimento") {
  const { weekStart } = weekRangeUTC();
  const [fora, parado]: string[][] =
    dono === "initiative"
      ? [[IniciativaStatus.CANCELADA], [...INICIATIVA_SEM_PENDENCIA_STATUSES, IniciativaStatus.PAUSADA]]
      : [[ExperimentoStatus.ARQUIVADO], [...EXPERIMENTO_SEM_PENDENCIA_STATUSES, ExperimentoStatus.PAUSADO]];
  return [
    { [dono]: { deletedAt: null, status: { notIn: fora } } },
    { OR: [{ dueDate: { gte: weekStart } }, { [dono]: { status: { notIn: parado } } }] },
  ];
}

/**
 * Marcos abertos da pessoa em risco: algum checkpoint necessário pendente
 * está atrasado ou vence depois do marco (regra de lib/checkpoint-marco).
 *
 * "Da pessoa" segue a herança da Weekly: o marco em que ela é responsável, ou
 * o marco sem responsável de um item dela. O risco é calculado aqui, sobre os
 * necessários — eles nem sempre caem na semana que o card consulta.
 */
async function buscarMarcosEmRisco(memberId: string) {
  const membros = { select: { id: true, name: true }, orderBy: { name: "asc" as const } };
  const doItem = { id: true, name: true, status: true, members: membros } as const;
  const requisito = { id: true, name: true, parentId: true, categoria: true, isCompleted: true, dueDate: true } as const;
  const marco = {
    id: true, name: true, parentId: true, categoria: true, isCompleted: true, dueDate: true,
    requisitos: { select: requisito },
  } as const;
  const where = (dono: "initiative" | "experimento") => ({
    categoria: "MARCO" as const,
    isCompleted: false,
    requisitos: { some: { isCompleted: false } },
    AND: [
      ...marcoDeItemVisivel(dono),
      {
        OR: [
          { members: { some: { id: memberId } } },
          { members: { none: {} }, [dono]: { members: { some: { id: memberId } } } },
        ],
      },
    ],
  });
  const [ini, exp] = await withDbRetry(() =>
    Promise.all([
      prisma.initiativeCheckpoint.findMany({
        where: where("initiative"),
        select: { ...marco, initiative: { select: { ...doItem, priority: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.experimentoCheckpoint.findMany({
        where: where("experimento"),
        select: { ...marco, experimento: { select: doItem } },
        orderBy: { dueDate: "asc" },
      }),
    ])
  );
  const hoje = hojeUTC();
  const comRisco = <T extends (typeof ini)[number] | (typeof exp)[number]>(m: T) => {
    const porId = new Map(m.requisitos.map((r) => [r.id, r]));
    const p = progressoDoMarco({ ...m, requisitoIds: m.requisitos.map((r) => r.id) }, porId, hoje);
    return p?.emRisco ? { marco: { id: m.id, name: m.name }, resumo: resumoDoRisco(p.riscos) } : null;
  };
  return [
    ...ini.flatMap((m) => {
      const r = comRisco(m);
      return r ? [{ ...r, item: { ...m.initiative, kind: "iniciativa" as const } }] : [];
    }),
    ...exp.flatMap((m) => {
      const r = comRisco(m);
      return r ? [{ ...r, item: { ...m.experimento, kind: "experimento" as const, priority: null } }] : [];
    }),
  ];
}

/**
 * Iniciativas e experimentos ainda "em andamento" com o prazo final vencido.
 * Na maioria das vezes o trabalho acabou e ninguém fechou o item; às vezes está
 * de fato atrasado. Nos dois casos ele infla o "em andamento" e esconde que o
 * resultado não foi registrado — é o que o time chama de "travado", e nenhuma
 * outra trava pega: o item costuma ter checkpoint aberto (então tem "próximo
 * passo") e não está aguardando análise.
 *
 * Com `memberId`, os itens em que a pessoa é responsável (mesma checagem de
 * `getTravasDaPessoa`); sem, o time inteiro — só liderança, como
 * `getTravasDoTime`. Vem do prazo mais antigo para o mais recente.
 */
export async function getPrazosVencidos(memberId?: string) {
  if (memberId) {
    await assertAccess(memberId);
  } else {
    const atual = await getCurrentMember();
    if (atual.role !== MemberRole.LIDERANCA) throw new Error("Acesso negado");
  }
  const hoje = hojeUTC();
  const daPessoa = memberId ? { members: { some: { id: memberId } } } : {};
  const select = {
    id: true,
    name: true,
    status: true,
    endDate: true,
    members: { select: { id: true, name: true }, orderBy: { name: "asc" as const } },
    frente: { select: { id: true, name: true } },
    _count: { select: { checkpoints: { where: { isCompleted: false } } } },
  } as const;
  const vencido = { deletedAt: null, endDate: { lt: hoje }, ...daPessoa };

  const [iniciativas, experimentos] = await withDbRetry(() =>
    Promise.all([
      prisma.iniciativa.findMany({
        where: { ...vencido, status: IniciativaStatus.EM_ANDAMENTO },
        select: { ...select, priority: true },
        orderBy: [{ endDate: "asc" }, { name: "asc" }],
      }),
      prisma.experimento.findMany({
        where: { ...vencido, status: ExperimentoStatus.EM_ANDAMENTO },
        select,
        orderBy: [{ endDate: "asc" }, { name: "asc" }],
      }),
    ])
  );
  const quando = (d: Date | null) => d?.getTime() ?? 0;
  return [
    ...iniciativas.map((i) => ({ ...i, kind: "iniciativa" as const })),
    ...experimentos.map((e) => ({ ...e, kind: "experimento" as const, priority: null })),
  ].sort((a, b) => quando(a.endDate) - quando(b.endDate) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Corpo comum de `getTravasDoTime` e `getTravasDaPessoa` (sem checagem de acesso). */
async function buscarTravas(memberId?: string) {
  const hoje = hojeUTC();
  const daPessoa = memberId ? { members: { some: { id: memberId } } } : {};
  const semCheckpointAberto = { NOT: { checkpoints: { some: { isCompleted: false } } } };
  const membros = { select: { id: true, name: true }, orderBy: { name: "asc" as const } };
  const item = {
    id: true,
    name: true,
    status: true,
    members: membros,
    frente: { select: { id: true, name: true } },
  } as const;

  const [iniciativasSemPasso, experimentosSemPasso, parados] = await withDbRetry(() =>
    Promise.all([
      prisma.iniciativa.findMany({
        where: { deletedAt: null, status: IniciativaStatus.EM_ANDAMENTO, ...daPessoa, ...semCheckpointAberto },
        select: { ...item, priority: true },
        orderBy: { name: "asc" },
      }),
      prisma.experimento.findMany({
        where: { deletedAt: null, status: ExperimentoStatus.EM_ANDAMENTO, ...daPessoa, ...semCheckpointAberto },
        select: item,
        orderBy: { name: "asc" },
      }),
      prisma.experimento.findMany({
        where: {
          deletedAt: null,
          ...daPessoa,
          OR: [
            { status: ExperimentoStatus.AGUARDANDO_RESULTADOS, analysisDate: { lt: hoje } },
            { status: ExperimentoStatus.RELATORIO_PRONTO },
          ],
        },
        select: { ...item, analysisDate: true },
        orderBy: [{ analysisDate: "asc" }, { name: "asc" }],
      }),
    ])
  );

  return {
    semProximoPasso: [
      ...iniciativasSemPasso.map((i) => ({ ...i, kind: "iniciativa" as const })),
      ...experimentosSemPasso.map((e) => ({ ...e, kind: "experimento" as const, priority: null })),
    ],
    parados,
  };
}

/**
 * O que terminou de rodar e espera o próximo passo — um resultado, um espaço
 * no ritual: experimento aguardando resultados e iniciativa escrevendo
 * relatório. Todos nesses status, com ou sem data vencida; a análise vencida
 * vem primeiro e o card a pinta de atraso.
 *
 * Relatório pronto NÃO entra: ele já tem o que precisa, falta só apresentar.
 *
 * Só liderança: é o card da visão do time.
 */
export async function getAguardandoProximoPasso() {
  const atual = await getCurrentMember();
  if (atual.role !== MemberRole.LIDERANCA) throw new Error("Acesso negado");

  const item = {
    id: true,
    name: true,
    status: true,
    analysisDate: true,
    members: { select: { id: true, name: true }, orderBy: { name: "asc" as const } },
  } as const;
  const ordem = [{ analysisDate: { sort: "asc", nulls: "last" } }, { name: "asc" }] as const;

  const [iniciativas, experimentos] = await withDbRetry(() =>
    Promise.all([
      prisma.iniciativa.findMany({
        where: { deletedAt: null, status: IniciativaStatus.ESCREVENDO_RELATORIO },
        select: { ...item, priority: true },
        orderBy: [...ordem],
      }),
      prisma.experimento.findMany({
        where: { deletedAt: null, status: ExperimentoStatus.AGUARDANDO_RESULTADOS },
        select: item,
        orderBy: [...ordem],
      }),
    ])
  );

  // Uma lista só, pela data de análise (sem data no fim): é a ordem em que a
  // liderança precisa abrir espaço para cada um.
  const semData = Number.POSITIVE_INFINITY;
  const quando = (d: Date | null) => (d ? d.getTime() : semData);
  return [
    ...iniciativas.map((i) => ({ ...i, kind: "iniciativa" as const })),
    ...experimentos.map((e) => ({ ...e, kind: "experimento" as const, priority: null })),
  ].sort((a, b) => quando(a.analysisDate) - quando(b.analysisDate) || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Marcos abertos do time que vencem nesta semana ou na que vem, mais os
 * atrasados — o card de preparação da visão da liderança: quantos dias faltam
 * (ou há quantos venceu) e o que ainda falta entregar para cada um.
 *
 * Visibilidade com a regra da Weekly de Rituais (`marcoDeItemVisivel`).
 *
 * "O que falta" são os checkpoints necessários pendentes (com o risco de
 * `progressoDoMarco`). Marco sem necessários ligados cai nos subcheckpoints
 * abertos dele, que é como parte do time quebra o marco.
 *
 * Só liderança.
 */
export async function getMarcosDoTime() {
  const atual = await getCurrentMember();
  if (atual.role !== MemberRole.LIDERANCA) throw new Error("Acesso negado");

  const { nextWeekEnd } = weekRangeUTC();
  const membros = { select: { id: true, name: true }, orderBy: { name: "asc" as const } };
  const doItem = { id: true, name: true, status: true, members: membros } as const;
  const pendencia = { id: true, name: true, parentId: true, categoria: true, isCompleted: true, dueDate: true, members: membros } as const;
  const marco = {
    id: true, name: true, parentId: true, categoria: true, isCompleted: true, dueDate: true,
    members: membros,
    requisitos: { select: pendencia, orderBy: { dueDate: "asc" as const } },
    children: { where: { isCompleted: false }, select: pendencia, orderBy: { dueDate: "asc" as const } },
  } as const;
  const where = (dono: "initiative" | "experimento") => ({
    categoria: "MARCO" as const,
    isCompleted: false,
    dueDate: { lte: nextWeekEnd },
    AND: marcoDeItemVisivel(dono),
  });

  const [ini, exp] = await withDbRetry(() =>
    Promise.all([
      prisma.initiativeCheckpoint.findMany({
        where: where("initiative"),
        select: { ...marco, initiative: { select: { ...doItem, priority: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.experimentoCheckpoint.findMany({
        where: where("experimento"),
        select: { ...marco, experimento: { select: doItem } },
        orderBy: { dueDate: "asc" },
      }),
    ])
  );

  const hoje = hojeUTC();
  const montar = <T extends (typeof ini)[number] | (typeof exp)[number]>(m: T) => {
    const porId = new Map(m.requisitos.map((r) => [r.id, r]));
    const progresso = progressoDoMarco({ ...m, requisitoIds: m.requisitos.map((r) => r.id) }, porId, hoje);
    return {
      id: m.id,
      name: m.name,
      dueDate: m.dueDate,
      members: m.members,
      progresso,
      // Sem necessários ligados, o que falta é a árvore do próprio marco.
      subPendentes: progresso ? [] : m.children,
    };
  };
  return [
    ...ini.map((m) => ({ ...montar(m), item: { ...m.initiative, kind: "iniciativa" as const } })),
    ...exp.map((m) => ({ ...montar(m), item: { ...m.experimento, kind: "experimento" as const, priority: null } })),
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Checkpoints abertos da pessoa que vencem na semana que vem — o rodapé "Próxima
 * semana" do card. Conta o checkpoint dela (responsável próprio) e o sem
 * responsável de item dela, a mesma herança da Weekly, só que sem descer a
 * árvore: a contagem é um aviso, não a lista.
 */
export async function getProximaSemanaDaPessoa(memberId: string) {
  await assertAccess(memberId);
  const { nextWeekStart, nextWeekEnd } = weekRangeUTC();
  const where = (dono: "initiative" | "experimento") => ({
    isCompleted: false,
    dueDate: { gte: nextWeekStart, lte: nextWeekEnd },
    OR: [
      { members: { some: { id: memberId } } },
      {
        members: { none: {} },
        [dono]: { deletedAt: null, members: { some: { id: memberId } } },
      },
    ],
  });
  const [ini, exp] = await withDbRetry(() =>
    Promise.all([
      prisma.initiativeCheckpoint.count({ where: where("initiative") }),
      prisma.experimentoCheckpoint.count({ where: where("experimento") }),
    ])
  );
  return { checkpoints: ini + exp, weekOf: nextWeekStart.toISOString().slice(0, 10) };
}
