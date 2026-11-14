"use server";

import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentMember, requireEditPermission } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseISODateUTC, startOfWeekMondayUTC } from "@/lib/date-utils";
import { ERRO_SEMANA_FECHADA, semanaFechadaParaEdicao } from "@/lib/registro-semanal-db";

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

/** Uma marcação: quem marcou, e qual item, na semana consultada. */
export type FocoDaSemana = {
  memberId: string;
  itemId: string;
  kind: FocoKind;
};

/** O que pode ser prioridade da semana: item do quarter ou ação da semana. */
export type FocoKind = "iniciativa" | "experimento" | "acao";

const weekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Semana inválida.");
const toggleSchema = z.object({
  weekOf: weekSchema,
  memberId: z.string().uuid("Membro inválido."),
  itemId: z.string().uuid("Item inválido."),
  kind: z.enum(["iniciativa", "experimento", "acao"]),
});

/** Ver `semanaCanonica` em weekly-comments: a chave é sempre a segunda-feira. */
function semanaCanonica(weekOf: string): Date {
  const parsed = parseISODateUTC(weekSchema.parse(weekOf));
  if (!parsed) throw new z.ZodError([]);
  return startOfWeekMondayUTC(parsed);
}

export async function getWeeklyFocus(weekOf: string): Promise<FocoDaSemana[]> {
  await getCurrentMember();
  const weekStart = semanaCanonica(weekOf);

  const rows = await withDbRetry(() =>
    prisma.weeklyFocus.findMany({
      where: { weekStart },
      select: { memberId: true, iniciativaId: true, experimentoId: true, acaoId: true },
    })
  );

  return rows.map((r) => ({
    memberId: r.memberId,
    itemId: (r.iniciativaId ?? r.experimentoId ?? r.acaoId)!,
    kind: r.iniciativaId
      ? ("iniciativa" as const)
      : r.experimentoId
        ? ("experimento" as const)
        : ("acao" as const),
  }));
}

/**
 * Marca ou desmarca um item como foco da semana daquela pessoa.
 *
 * NÃO trava em duas. O "máximo de duas" é combinado de time, e a página avisa
 * quando passa — travar no servidor esconderia a terceira prioridade em vez de
 * expor a escolha difícil, que é justamente o assunto do ritual.
 *
 * Quem marca: a própria pessoa, ou liderança em qualquer linha. Marcar foco
 * para outra pessoa não é edição do item — é dizer qual é a prioridade dela.
 */
export async function toggleWeeklyFocus(data: {
  weekOf: string;
  memberId: string;
  itemId: string;
  kind: FocoKind;
}): Promise<ActionResponse<{ marcado: boolean }>> {
  try {
    const atual = await requireEditPermission();
    const v = toggleSchema.parse(data);
    if (atual.role !== MemberRole.LIDERANCA && v.memberId !== atual.id) {
      return {
        success: false,
        error: "Permissão negada. Você só marca a prioridade da sua própria semana.",
      };
    }

    const weekStart = semanaCanonica(v.weekOf);
    if (await semanaFechadaParaEdicao(weekStart)) {
      return { success: false, error: ERRO_SEMANA_FECHADA };
    }
    const where =
      v.kind === "iniciativa"
        ? { weekStart, memberId: v.memberId, iniciativaId: v.itemId }
        : v.kind === "experimento"
          ? { weekStart, memberId: v.memberId, experimentoId: v.itemId }
          : { weekStart, memberId: v.memberId, acaoId: v.itemId };

    // Ação é trabalho pessoal: só vira prioridade na linha de quem responde
    // por ela. Marcar a ação da Camila como prioridade do Rafael não descreve
    // a semana de ninguém.
    if (v.kind === "acao") {
      const acao = await prisma.acao.findUnique({
        where: { id: v.itemId },
        select: { responsavelId: true, deletedAt: true },
      });
      if (!acao || acao.deletedAt) return { success: false, error: "Ação não encontrada." };
      if (acao.responsavelId !== v.memberId) {
        return { success: false, error: "A ação só pode ser prioridade de quem responde por ela." };
      }
    }

    const existente = await prisma.weeklyFocus.findFirst({ where, select: { id: true } });
    if (existente) {
      await prisma.weeklyFocus.delete({ where: { id: existente.id } });
      revalidatePath("/rituais");
      return { success: true, data: { marcado: false } };
    }

    await prisma.weeklyFocus.create({ data: where });
    revalidatePath("/rituais");
    return { success: true, data: { marcado: true } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message ?? "Dados inválidos." };
    }
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    console.error("Erro ao marcar foco da semana:", error);
    return { success: false, error: "Erro ao marcar a prioridade da semana." };
  }
}
