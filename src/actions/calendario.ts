"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { hojeUTC, toISODateUTC } from "@/lib/date-utils";
import {
  intervaloDaGrade,
  montarEventos,
  parseMes,
  type EventoDoCalendario,
  type TipoDeItem,
  type TravaDoCalendario,
} from "@/lib/calendario";

export type CalendarioDoMes = {
  eventos: EventoDoCalendario[];
  /** Travas de férias que cruzam a grade (contexto do dia, ex.: Black Friday). */
  travas: TravaDoCalendario[];
};

/**
 * Datas-chave do mês para o calendário (`/calendario`) e para a ferramenta
 * `ver_calendario` do MCP: lançamento e análise de iniciativas e experimentos,
 * e checkpoints de comunicação e de marco — cada um já com atraso e com os
 * responsáveis que estão fora no dia.
 *
 * Busca a GRADE inteira do mês (as semanas de borda incluem dias do mês
 * vizinho), não só o mês: senão as bordas apareceriam vazias.
 *
 * Fica de fora o que não vai mais acontecer: item excluído, iniciativa
 * cancelada e experimento arquivado.
 */
export async function getEventosDoCalendario(mes: string): Promise<CalendarioDoMes> {
  // Gate de sessão — leitura liberada a qualquer membro ativo, como as demais telas.
  await getCurrentMember();

  const alvo = parseMes(mes);
  if (!alvo) return { eventos: [], travas: [] };
  const { inicio, fim } = intervaloDaGrade(alvo.ano, alvo.mes);
  const noPeriodo = { gte: inicio, lte: fim };
  const cruzaOPeriodo = { startDate: { lte: fim }, endDate: { gte: inicio } };

  const pessoas = { select: { id: true, name: true }, orderBy: { name: "asc" as const } };
  const frente = { select: { id: true, name: true } };
  const datasDoItem = {
    id: true,
    name: true,
    status: true,
    launchDate: true,
    analysisDate: true,
    frente,
    members: pessoas,
  };
  const doCheckpoint = {
    id: true,
    name: true,
    startDate: true,
    dueDate: true,
    isCompleted: true,
    categoria: true,
    members: pessoas,
  };
  const doItemDoCheckpoint = { select: { id: true, name: true, status: true, frente } };
  const categorias = { in: ["COMUNICACAO" as const, "MARCO" as const] };

  const [iniciativas, experimentos, cpIniciativa, cpExperimento, ausencias, travas] = await Promise.all([
    prisma.iniciativa.findMany({
      where: {
        deletedAt: null,
        status: { not: "CANCELADA" },
        OR: [{ launchDate: noPeriodo }, { analysisDate: noPeriodo }],
      },
      select: datasDoItem,
    }),
    prisma.experimento.findMany({
      where: {
        deletedAt: null,
        status: { not: "ARQUIVADO" },
        OR: [{ launchDate: noPeriodo }, { analysisDate: noPeriodo }],
      },
      select: datasDoItem,
    }),
    prisma.initiativeCheckpoint.findMany({
      where: {
        categoria: categorias,
        dueDate: noPeriodo,
        initiative: { deletedAt: null, status: { not: "CANCELADA" } },
      },
      select: { ...doCheckpoint, initiative: doItemDoCheckpoint },
    }),
    prisma.experimentoCheckpoint.findMany({
      where: {
        categoria: categorias,
        dueDate: noPeriodo,
        experimento: { deletedAt: null, status: { not: "ARQUIVADO" } },
      },
      select: { ...doCheckpoint, experimento: doItemDoCheckpoint },
    }),
    // Só o necessário para o conflito: quem, que tipo e quando. As observações
    // da ausência nunca saem daqui (podem ser dado de saúde).
    prisma.ausencia.findMany({
      where: cruzaOPeriodo,
      select: { memberId: true, type: true, startDate: true, endDate: true, member: { select: { name: true } } },
    }),
    prisma.travaFerias.findMany({
      where: cruzaOPeriodo,
      select: { name: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const eventos = montarEventos(
    {
      iniciativas,
      experimentos,
      checkpointsDeIniciativa: cpIniciativa.map(({ initiative, ...cp }) => ({ ...cp, item: initiative })),
      checkpointsDeExperimento: cpExperimento.map(({ experimento, ...cp }) => ({ ...cp, item: experimento })),
      ausencias: ausencias.map((a) => ({
        memberId: a.memberId,
        memberName: a.member.name,
        type: a.type,
        startDate: a.startDate,
        endDate: a.endDate,
      })),
    },
    inicio,
    fim,
    toISODateUTC(hojeUTC())
  );

  return {
    eventos,
    travas: travas.map((t) => ({ nome: t.name, inicio: toISODateUTC(t.startDate), fim: toISODateUTC(t.endDate) })),
  };
}

export type ItemParaCalendario = {
  id: string;
  nome: string;
  tipo: TipoDeItem;
  frente: string;
  launchDate: string | null;
  analysisDate: string | null;
  memberIds: string[];
};

/**
 * Itens que podem receber uma data nova pelo calendário (criar comunicação ou
 * marco, ou marcar lançamento/análise). Fica de fora o que já acabou ou não vai
 * acontecer: excluído, cancelado/arquivado e com relatório apresentado ou
 * finalizado. Quem grava são as actions de sempre, com as permissões delas.
 */
export async function getItensParaCalendario(): Promise<ItemParaCalendario[]> {
  await getCurrentMember();
  const select = {
    id: true,
    name: true,
    launchDate: true,
    analysisDate: true,
    frente: { select: { name: true } },
    members: { select: { id: true } },
  };
  const [iniciativas, experimentos] = await Promise.all([
    prisma.iniciativa.findMany({
      where: { deletedAt: null, status: { notIn: ["CANCELADA", "RELATORIO_FINALIZADO"] } },
      select,
      orderBy: { name: "asc" },
    }),
    prisma.experimento.findMany({
      where: { deletedAt: null, status: { notIn: ["ARQUIVADO", "RESULTADOS_APRESENTADOS"] } },
      select,
      orderBy: { name: "asc" },
    }),
  ]);
  const paraItem = (tipo: TipoDeItem) => (i: (typeof iniciativas)[number]): ItemParaCalendario => ({
    id: i.id,
    nome: i.name,
    tipo,
    frente: i.frente.name,
    launchDate: i.launchDate ? toISODateUTC(i.launchDate) : null,
    analysisDate: i.analysisDate ? toISODateUTC(i.analysisDate) : null,
    memberIds: i.members.map((m) => m.id),
  });
  return [...iniciativas.map(paraItem("iniciativa")), ...experimentos.map(paraItem("experimento"))];
}
