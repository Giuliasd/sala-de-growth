"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeProgress } from "@/lib/okr";
import { getCurrentMember, hasOwnershipAccess, requireEditPermission } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { INICIATIVA_CONCLUIDA_STATUSES } from "@/lib/statusConfig";

const objetivoSchema = z.object({
  quarterId: z.string().uuid("Quarter inválido."),
  title: z.string().min(3, "O objetivo deve ter pelo menos 3 caracteres.").max(300, "O objetivo é muito longo."),
  description: z.string().max(5000, "A descrição é muito longa.").optional().nullable(),
});

const updateObjetivoSchema = z.object({
  title: z.string().min(3, "O objetivo deve ter pelo menos 3 caracteres.").max(300, "O objetivo é muito longo.").optional(),
  description: z.string().max(5000, "A descrição é muito longa.").optional().nullable(),
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// Só contabilizamos itens em progresso ou finalizados (mesma regra dos OKRs).
const LINKED_INICIATIVA_STATUS = ["EM_ANDAMENTO", ...INICIATIVA_CONCLUIDA_STATUSES] as const;
const LINKED_EXPERIMENTO_STATUS = [
  "EM_ANDAMENTO",
  "AGUARDANDO_RESULTADOS",
  "RELATORIO_PRONTO",
  "RESULTADOS_APRESENTADOS",
] as const;

// Objetivos do quarter, cada um com seus KRs (o modelo OKR). Os KRs trazem tudo
// que o card precisa, inclusive a frente (o agrupamento agora é por objetivo, e
// cada KR mostra a própria frente como chip).
export async function getObjetivosByQuarter(quarterId: string) {
  await getCurrentMember();
  return await prisma.objetivo.findMany({
    where: { quarterId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      krs: {
        orderBy: [{ frente: { name: "asc" } }, { objective: "asc" }],
        include: {
          // Só o que o card usa: `true` trazia a linha inteira de frente e de
          // quarter repetida em cada KR.
          frente: { select: { id: true, name: true, isActive: true } },
          quarter: { select: { id: true, year: true, quarter: true, startDate: true, endDate: true } },
          members: { select: { id: true, name: true } },
          // Para a confirmação de exclusão dizer quanto histórico vai junto.
          _count: { select: { okrUpdates: true } },
          // Vinculados ao KR. A contagem que o card mostra sai do tamanho destas
          // listas (ver getObjetivosComRelogio) — antes havia também um _count
          // com o MESMO filtro, que custava duas subconsultas a mais por KR.
          iniciativas: {
            where: { deletedAt: null, status: { in: [...LINKED_INICIATIVA_STATUS] } },
            select: { id: true, status: true },
          },
          experimentos: {
            where: { deletedAt: null, status: { in: [...LINKED_EXPERIMENTO_STATUS] } },
            select: { id: true, status: true },
          },
          // Histórico recente: alimenta a sparkline, a velocidade e a projeção
          // do card. 12 pontos cobrem um quarter de atualizações semanais.
          okrUpdates: {
            orderBy: { date: "desc" },
            take: 12,
            select: { id: true, date: true, newValue: true, previousValue: true },
          },
        },
      },
    },
  });
}

export async function createObjetivo(
  data: z.infer<typeof objetivoSchema>
): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = objetivoSchema.parse(data);

    const count = await prisma.objetivo.count({ where: { quarterId: v.quarterId } });
    const objetivo = await prisma.objetivo.create({
      data: {
        quarterId: v.quarterId,
        title: v.title,
        description: v.description?.trim() || null,
        order: count,
      },
    });

    revalidatePath("/okrs");
    return { success: true, data: objetivo };
  } catch (error) {
    console.error("createObjetivo error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar o objetivo." };
  }
}

export async function updateObjetivo(
  id: string,
  data: z.infer<typeof updateObjetivoSchema>
): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = updateObjetivoSchema.parse(data);

    const objetivo = await prisma.objetivo.update({
      where: { id },
      data: {
        ...(v.title !== undefined && { title: v.title }),
        ...(v.description !== undefined && { description: v.description?.trim() || null }),
      },
    });

    revalidatePath("/okrs");
    return { success: true, data: objetivo };
  } catch (error) {
    console.error("updateObjetivo error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar o objetivo." };
  }
}

export async function deleteObjetivo(id: string): Promise<ActionResponse> {
  try {
    await requireEditPermission();

    // Não deixamos excluir um objetivo que ainda tem KRs — os KRs ficariam órfãos
    // (fora de qualquer objetivo) e sumiriam da tela. A liderança move ou exclui
    // os KRs antes.
    const krCount = await prisma.oKR.count({ where: { objetivoId: id } });
    if (krCount > 0) {
      return {
        success: false,
        error: "Este objetivo ainda tem KRs. Mova ou exclua os KRs antes de excluí-lo.",
      };
    }

    await prisma.objetivo.delete({ where: { id } });

    revalidatePath("/okrs");
    return { success: true, data: null };
  } catch (error) {
    console.error("deleteObjetivo error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao excluir o objetivo." };
  }
}

/**
 * Objetivos do quarter + o instante da leitura.
 *
 * O acompanhamento de OKR (tempo decorrido do quarter, "parado há N dias")
 * depende da hora. Calcular isso no servidor e de novo no cliente dava valores
 * diferentes e quebrava a hidratação — então o relógio viaja junto com os
 * dados, e os dois lados renderizam o mesmo número.
 */
export async function getObjetivosComRelogio(quarterId: string) {
  const objetivos = await getObjetivosByQuarter(quarterId);
  const member = await getCurrentMember();
  // A tela esconde o que a pessoa não pode fazer; o servidor continua sendo o
  // gate de verdade (ver requireEditPermission / requireOKROwnership em okrs.ts).
  const podeEditar = member.role !== MemberRole.VISITANTE;

  // Progresso recalculado na leitura por computeProgress, a fonte única da
  // conta. O valor gravado só é reescrito quando alguém atualiza o KR — sem
  // isso, um KR de redução em média mensal continuaria mostrando o número
  // antigo (churn de 4,6% aparecia como 153% de progresso) até a próxima
  // atualização.
  const corrigidos = objetivos.map((objetivo) => ({
    ...objetivo,
    krs: objetivo.krs.map((kr) => ({
      ...kr,
      _count: {
        iniciativas: kr.iniciativas.length,
        experimentos: kr.experimentos.length,
        okrUpdates: kr._count.okrUpdates,
      },
      // Lançar valor é de qualquer um que edita; editar/excluir o KR é dos
      // responsáveis (ou liderança, ou KR sem responsável).
      podeAtualizar: podeEditar,
      podeGerir: podeEditar && hasOwnershipAccess(member, kr.members.map((m) => m.id)),
      ...computeProgress({
        measurementType: kr.measurementType,
        targetValue: kr.targetValue,
        initialValue: kr.initialValue,
        currentValue: kr.currentValue,
        monthValues: [kr.monthValue1, kr.monthValue2, kr.monthValue3],
      }),
    })),
  }));

  return { objetivos: corrigidos, nowMs: Date.now(), podeEditar };
}
