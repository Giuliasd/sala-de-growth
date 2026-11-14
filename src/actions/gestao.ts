"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentMember } from "@/lib/session"
import { progressoAtual } from "@/lib/okr"
import { MemberRole } from "@/generated/prisma/enums"
import { INICIATIVA_CONCLUIDA_STATUSES } from "@/lib/statusConfig"

export async function getMemberStatsForQuarter(
  quarterId: string,
  monthStart?: string,
  monthEnd?: string,
) {
  const currentMember = await getCurrentMember()
  if (currentMember.role !== MemberRole.LIDERANCA) {
    throw new Error("Acesso negado. Apenas lideranças podem acessar esta página.")
  }

  const monthDateFilter =
    monthStart && monthEnd
      ? {
          OR: [
            {
              startDate: {
                gte: new Date(monthStart),
                lte: new Date(monthEnd),
              },
            },
            {
              startDate: null,
              createdAt: {
                gte: new Date(monthStart),
                lte: new Date(monthEnd),
              },
            },
          ],
        }
      : {}

  const rows = await prisma.teamMember.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      iniciativas: {
        where: {
          quarterId,
          deletedAt: null,
          status: { in: ["EM_ANDAMENTO", ...INICIATIVA_CONCLUIDA_STATUSES] },
          ...monthDateFilter,
        },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          resultado: true,
          frente: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      experimentos: {
        where: {
          quarterId,
          deletedAt: null,
          status: { in: ["EM_ANDAMENTO", "RELATORIO_PRONTO", "RESULTADOS_APRESENTADOS"] },
          ...monthDateFilter,
        },
        select: {
          id: true,
          name: true,
          status: true,
          resultado: true,
          frente: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      okrs: {
        where: { quarterId },
        select: {
          id: true,
          objective: true,
          progressPercent: true,
          targetValue: true,
          currentValue: true,
          measurementType: true,
          initialValue: true,
          monthValue1: true,
          monthValue2: true,
          monthValue3: true,
          unit: true,
          frente: { select: { name: true } },
        },
        orderBy: { objective: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  // LIDERANÇA sempre por último; dentro de cada grupo mantém ordem alfabética.
  // `email ?? ""`: só há membros ativos aqui (where isActive), que sempre têm
  // e-mail — a coerção existe só porque o campo passou a ser nullable no schema.
  return rows
    .map((r) => ({
      ...r,
      email: r.email ?? "",
      // Progresso recalculado na leitura (ver progressoAtual): a coluna gravada
      // pode estar velha e divergir de /okrs.
      okrs: r.okrs.map((o) => ({ ...o, ...progressoAtual(o) })),
    }))
    .sort((a, b) => {
      const aLast = a.role === MemberRole.LIDERANCA ? 1 : 0
      const bLast = b.role === MemberRole.LIDERANCA ? 1 : 0
      return aLast - bLast
    })
}
