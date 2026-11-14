"use server";

import { prisma } from "@/lib/prisma";
import { findQuarterCached } from "@/lib/quarters-cache";
import { getCurrentMember } from "@/lib/session";
import { progressoAtual } from "@/lib/okr";
import { MemberRole } from "@/generated/prisma/enums";
import { isIniciativaConcluida } from "@/lib/statusConfig";

type ResultadoTally = { SUCESSO: number; PARCIAL: number; FALHA: number };

function emptyTally(): ResultadoTally {
  return { SUCESSO: 0, PARCIAL: 0, FALHA: 0 };
}

// Um experimento conta como "concluído/entregue" quando chegou a uma etapa final
// (relatório pronto ou resultados apresentados). Não há mais status "CONCLUIDO".
const EXPERIMENTO_ENTREGUE = new Set(["RELATORIO_PRONTO", "RESULTADOS_APRESENTADOS"]);
function isExperimentoEntregue(status: string): boolean {
  return EXPERIMENTO_ENTREGUE.has(status);
}

function addResultado(tally: ResultadoTally, resultado: string | null) {
  if (resultado === "SUCESSO" || resultado === "PARCIAL" || resultado === "FALHA") {
    tally[resultado] += 1;
  }
}

/**
 * Relatório geral de um quarter: resumo de resultados, entregas concluídas
 * (iniciativas + experimentos) e performance por pessoa do time.
 * Disponível para qualquer membro autenticado.
 */
export async function getQuarterReport(quarterId: string) {
  await getCurrentMember();

  // Quarter primeiro: as ausências são filtradas pela janela de datas dele.
  // Vem da lista em cache — sem round-trip antes das consultas do relatório.
  const q = await findQuarterCached(quarterId);
  const quarter = q && {
    id: q.id,
    year: q.year,
    quarter: q.quarter,
    startDate: q.startDate,
    endDate: q.endDate,
    isActive: q.isActive,
  };

  const [okrsGravados, iniciativas, experimentos, members, ausenciasRaw] = await Promise.all([
    prisma.oKR.findMany({
      where: { quarterId },
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
        frente: { select: { name: true } },
        members: { select: { id: true } },
      },
      orderBy: [{ frente: { name: "asc" } }, { objective: "asc" }],
    }),
    prisma.iniciativa.findMany({
      where: { quarterId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        resultado: true,
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        frente: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.experimento.findMany({
      where: { quarterId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        resultado: true,
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        frente: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // Sem e-mail: o relatório é aberto a qualquer membro (VISITANTE incluso) e
    // e-mail é contato da liderança (getTeamMembersComContato). Ver team-members.ts.
    prisma.teamMember.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    // Ausências que sobrepõem a janela do quarter (mesmo critério de /ausencias).
    quarter
      ? prisma.ausencia.findMany({
          where: {
            startDate: { lte: quarter.endDate },
            endDate: { gte: quarter.startDate },
          },
          select: {
            id: true,
            type: true,
            startDate: true,
            endDate: true,
            notes: true,
            member: { select: { id: true, name: true } },
          },
          orderBy: [{ member: { name: "asc" } }, { startDate: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const iniConcluidas = iniciativas.filter((i) => isIniciativaConcluida(i.status));
  const expConcluidos = experimentos.filter((e) => isExperimentoEntregue(e.status));

  // ── Entregas concluídas (iniciativas + experimentos) ──────────────────
  // Uma entrega pode ter vários responsáveis; `memberNames` é a lista completa,
  // já ordenada, para o relatório mostrar todos em vez de eleger um.
  const entregas = [
    ...iniConcluidas.map((i) => ({
      tipo: "iniciativa" as const,
      id: i.id,
      name: i.name,
      memberNames: i.members.map((m) => m.name),
      memberIds: i.members.map((m) => m.id),
      frente: i.frente.name,
      resultado: i.resultado,
    })),
    ...expConcluidos.map((e) => ({
      tipo: "experimento" as const,
      id: e.id,
      name: e.name,
      memberNames: e.members.map((m) => m.name),
      memberIds: e.members.map((m) => m.id),
      frente: e.frente.name,
      resultado: e.resultado,
    })),
  ];

  // Recalculado na leitura (ver progressoAtual): a coluna gravada pode estar velha.
  const okrs = okrsGravados.map((o) => ({ ...o, ...progressoAtual(o) }));

  // ── Resumo geral ──────────────────────────────────────────────────────
  const avgProgress =
    okrs.length > 0
      ? Math.round(okrs.reduce((sum, o) => sum + o.progressPercent, 0) / okrs.length)
      : 0;

  const resultadosGeral = emptyTally();
  entregas.forEach((e) => addResultado(resultadosGeral, e.resultado));

  const planejadoTotal = iniciativas.length + experimentos.length;

  const expResultados = emptyTally();
  expConcluidos.forEach((e) => addResultado(expResultados, e.resultado));

  const summary = {
    okrCount: okrs.length,
    avgProgress,
    iniTotal: iniciativas.length,
    iniConcluidas: iniConcluidas.length,
    expTotal: experimentos.length,
    expConcluidos: expConcluidos.length,
    expResultados,
    entregasConcluidas: entregas.length,
    planejadoTotal,
    // Taxa de conclusão: % dos itens planejados (iniciativas + experimentos) que foram concluídos.
    taxaConclusao: planejadoTotal > 0 ? Math.round((entregas.length / planejadoTotal) * 100) : 0,
    resultados: resultadosGeral,
  };

  // ── Performance por pessoa ────────────────────────────────────────────
  const membros = members
    .map((m) => {
      // Item com vários responsáveis conta para cada um deles — a soma das
      // linhas por pessoa passa a ser maior que o total do quarter, e é isso
      // mesmo: a coluna descreve envolvimento, não fatia exclusiva.
      const minhasIni = iniciativas.filter((i) => i.members.some((mm) => mm.id === m.id));
      const meusExp = experimentos.filter((e) => e.members.some((mm) => mm.id === m.id));
      const meusOkrs = okrs.filter((o) => o.members.some((mm) => mm.id === m.id));

      const iniConc = minhasIni.filter((i) => isIniciativaConcluida(i.status)).length;
      const expConc = meusExp.filter((e) => isExperimentoEntregue(e.status)).length;

      const resultados = emptyTally();
      minhasIni.filter((i) => isIniciativaConcluida(i.status)).forEach((i) => addResultado(resultados, i.resultado));
      meusExp.filter((e) => isExperimentoEntregue(e.status)).forEach((e) => addResultado(resultados, e.resultado));

      return {
        id: m.id,
        name: m.name,
        role: m.role,
        iniTotal: minhasIni.length,
        iniConcluidas: iniConc,
        expTotal: meusExp.length,
        expConcluidos: expConc,
        entregasConcluidas: iniConc + expConc,
        resultados,
        okrs: meusOkrs.map((o) => ({
          id: o.id,
          objective: o.objective,
          progressPercent: Math.round(o.progressPercent),
        })),
        entregas: [
          ...minhasIni
            .filter((i) => isIniciativaConcluida(i.status))
            .map((i) => ({ tipo: "iniciativa" as const, name: i.name, frente: i.frente.name, resultado: i.resultado })),
          ...meusExp
            .filter((e) => isExperimentoEntregue(e.status))
            .map((e) => ({ tipo: "experimento" as const, name: e.name, frente: e.frente.name, resultado: e.resultado })),
        ],
      };
    })
    // LIDERANÇA por último, mantendo ordem alfabética dentro de cada grupo
    .sort((a, b) => {
      const aLast = a.role === MemberRole.LIDERANCA ? 1 : 0;
      const bLast = b.role === MemberRole.LIDERANCA ? 1 : 0;
      return aLast - bLast;
    });

  // ── Ausências no quarter ──────────────────────────────────────────────
  // Duração em dias corridos, inclusiva (10→14 = 5 dias). Normaliza para o
  // dia UTC antes de subtrair: endDate pode vir como 23:59:59, o que inflaria
  // a conta se usássemos a diferença bruta de milissegundos.
  const MS_DIA = 24 * 60 * 60 * 1000;
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ausencias = ausenciasRaw.map((a) => ({
    id: a.id,
    memberId: a.member.id,
    memberName: a.member.name,
    type: a.type,
    startDate: a.startDate,
    endDate: a.endDate,
    notes: a.notes,
    dias: Math.max(1, Math.round((utcDay(a.endDate) - utcDay(a.startDate)) / MS_DIA) + 1),
  }));

  return {
    quarter,
    ausencias,
    summary,
    okrs: okrs.map((o) => ({
      id: o.id,
      objective: o.objective,
      progressPercent: Math.round(o.progressPercent),
      currentValue: o.currentValue,
      targetValue: o.targetValue,
      unit: o.unit,
      frente: o.frente.name,
    })),
    entregas,
    membros,
  };
}
