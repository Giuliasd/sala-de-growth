"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentMember, hasOwnershipAccess, requireEditPermission, requireOwnershipPermission, type OwnershipMember } from "@/lib/session";
import { MemberRole, OKRUnit } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { computeProgress } from "@/lib/okr";
import { notificarResponsaveis, responsaveisAtuais } from "@/lib/notificacoes-db";
import { INICIATIVA_CONCLUIDA_STATUSES } from "@/lib/statusConfig";

const createOKRSchema = z
  .object({
    quarterId: z.string().uuid("Quarter inválido."),
    frenteId: z.string().uuid("Frente inválida."),
    objetivoId: z.string().uuid("Objetivo inválido."),
    memberIds: z.array(z.string().uuid("Responsável inválido.")).optional().nullable(),
    objective: z.string().min(5, "O KR deve ter pelo menos 5 caracteres.").max(300, "O KR é muito longo."),
    targetValue: z.number().positive("A meta deve ser um valor positivo."),
    initialValue: z.number().min(0, "O valor inicial não pode ser negativo."),
    unit: z.enum(["UNIDADE", "REAL", "PORCENTAGEM"]).default("UNIDADE"),
    measurementType: z.enum(["ACUMULADO", "MEDIA_MENSAL"]).default("ACUMULADO"),
  })
  // No modo média não há "valor inicial" (sempre 0), então a regra meta ≠ inicial só vale no acumulado.
  .refine((d) => d.measurementType === "MEDIA_MENSAL" || d.targetValue !== d.initialValue, {
    message: "A meta deve ser diferente do valor inicial.",
    path: ["targetValue"],
  });

const updateOKRSchema = z.object({
  objective: z.string().min(5, "O objetivo deve ter pelo menos 5 caracteres.").max(300, "O KR é muito longo.").optional(),
  targetValue: z.number().positive("A meta deve ser um valor positivo.").optional(),
  initialValue: z.number().min(0, "O valor inicial não pode ser negativo.").optional(),
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional().nullable(),
  unit: z.enum(["UNIDADE", "REAL", "PORCENTAGEM"]).optional(),
  measurementType: z.enum(["ACUMULADO", "MEDIA_MENSAL"]).optional(),
});

// Observação opcional de quem atualizou; vazia vira null na gravação.
const updateNoteSchema = z.string().trim().max(280, "A observação deve ter até 280 caracteres.").optional();

const updateProgressSchema = z.object({
  newValue: z.number().min(0, "O novo valor não pode ser negativo."),
  note: updateNoteSchema,
});

const updateMonthlyValuesSchema = z.object({
  monthValue1: z.number().min(0, "Valor inválido.").nullable(),
  monthValue2: z.number().min(0, "Valor inválido.").nullable(),
  monthValue3: z.number().min(0, "Valor inválido.").nullable(),
  note: updateNoteSchema,
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// Garante que o membro atual pode editar o OKR (é um dos responsáveis, o OKR
// não tem responsáveis, ou é liderança). Lança se o OKR não existir.
async function requireOKROwnership(id: string, member?: OwnershipMember) {
  const okr = await prisma.oKR.findUnique({
    where: { id },
    select: { members: { select: { id: true } } },
  });
  if (!okr) throw new Error("OKR não encontrado.");
  return requireOwnershipPermission(okr.members.map((m) => m.id), member);
}

// Lightweight query for form dropdowns — only fetches id + objective
export async function getOKRsForSelect(quarterId: string): Promise<{ id: string; objective: string }[]> {
  await getCurrentMember();
  return await prisma.oKR.findMany({
    where: { quarterId },
    select: { id: true, objective: true },
    orderBy: { objective: "asc" },
  });
}

// Só contabilizamos itens em progresso ou finalizados (experimentos incluem "aguardando resultados").
const LINKED_INICIATIVA_STATUS = ["EM_ANDAMENTO", ...INICIATIVA_CONCLUIDA_STATUSES] as const;
const LINKED_EXPERIMENTO_STATUS = ["EM_ANDAMENTO", "AGUARDANDO_RESULTADOS", "RELATORIO_PRONTO", "RESULTADOS_APRESENTADOS"] as const;

export async function getOKRHistory(okrId: string) {
  const member = await getCurrentMember();
  const [okr, updates] = await Promise.all([
    prisma.oKR.findUnique({ where: { id: okrId }, select: { members: { select: { id: true } } } }),
    prisma.oKRUpdate.findMany({
      where: { okrId },
      include: {
        member: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    }),
  ]);
  const ownerIds = okr?.members.map((m) => m.id) ?? [];
  const podeEditar = member.role !== MemberRole.VISITANTE;

  return updates.map((u) => ({
    ...u,
    // Atualização de quem não é responsável pelo KR: a tela marca com uma pill.
    // KR sem responsável não tem "fora" — ninguém é marcado.
    porNaoResponsavel: ownerIds.length > 0 && !ownerIds.includes(u.memberId),
    // Mesma regra de `deleteOKRUpdate`: quem fez, os responsáveis ou a liderança.
    podeApagar: podeEditar && (u.memberId === member.id || hasOwnershipAccess(member, ownerIds)),
  }));
}

export async function getOKRLinkedItems(okrId: string) {
  await getCurrentMember();
  const [iniciativas, experimentos] = await Promise.all([
    prisma.iniciativa.findMany({
      where: { okrId, deletedAt: null, status: { in: [...LINKED_INICIATIVA_STATUS] } },
      select: {
        id: true,
        name: true,
        status: true,
        endDate: true,
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.experimento.findMany({
      where: { okrId, deletedAt: null, status: { in: [...LINKED_EXPERIMENTO_STATUS] } },
      select: {
        id: true,
        name: true,
        status: true,
        iceScore: true,
        resultado: true,
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { iceScore: "desc" },
    }),
  ]);
  return { iniciativas, experimentos };
}

export async function getUnlinkedItems(quarterId: string) {
  await getCurrentMember();
  const [iniciativas, experimentos] = await Promise.all([
    prisma.iniciativa.findMany({
      where: { quarterId, okrId: null, deletedAt: null, status: { in: [...LINKED_INICIATIVA_STATUS] } },
      select: {
        id: true,
        name: true,
        status: true,
        endDate: true,
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        frente: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.experimento.findMany({
      where: { quarterId, okrId: null, deletedAt: null, status: { in: [...LINKED_EXPERIMENTO_STATUS] } },
      select: {
        id: true,
        name: true,
        status: true,
        iceScore: true,
        iceAction: true,
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        frente: { select: { name: true } },
      },
      orderBy: { iceScore: "desc" },
    }),
  ]);
  return { iniciativas, experimentos };
}

export async function createOKR(
  data: z.infer<typeof createOKRSchema>
): Promise<ActionResponse> {
  try {
    const autor = await requireEditPermission();
    const v = createOKRSchema.parse(data);

    const isMonthly = v.measurementType === "MEDIA_MENSAL";
    // O ponto de partida é gravado nos dois modos — na média mensal ele diz a
    // direção do KR (meta abaixo dele = redução). O que muda é o valor de
    // partida do currentValue: a média começa em 0, sem meses preenchidos.
    const initialValue = v.initialValue;

    const okr = await prisma.oKR.create({
      data: {
        quarterId: v.quarterId,
        frenteId: v.frenteId,
        objetivoId: v.objetivoId,
        ...(v.memberIds?.length && { members: { connect: v.memberIds.map((id) => ({ id })) } }),
        objective: v.objective,
        targetValue: v.targetValue,
        initialValue,
        currentValue: isMonthly ? 0 : initialValue,
        progressPercent: 0,
        unit: v.unit,
        measurementType: v.measurementType,
      },
    });

    await notificarResponsaveis({ fonte: "okr", id: okr.id, autorId: autor.id, antes: [], depois: v.memberIds ?? [] });
    revalidatePath("/okrs");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    updateTag("onboarding");
    return { success: true, data: okr };
  } catch (error) {
    console.error("createOKR error:", error);
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrado"))) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar o OKR." };
  }
}

/**
 * Trava a linha do KR até o fim da transação (SELECT … FOR UPDATE).
 *
 * As três escritas de KR (editar, lançar valor, lançar meses) leem o KR,
 * calculam e gravam `currentValue`/`progressPercent`. Sem a trava, duas ao
 * mesmo tempo liam o mesmo estado e a segunda gravava por cima da primeira com
 * um valor calculado sobre o dado velho — um lançamento sumia sem erro.
 */
async function travarKR(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "OKR" WHERE id = ${id} FOR UPDATE`;
}

export async function updateOKR(
  id: string,
  data: z.infer<typeof updateOKRSchema>
): Promise<ActionResponse> {
  try {
    const ator = await requireOKROwnership(id);
    const v = updateOKRSchema.parse(data);
    const respAntes = v.memberIds !== undefined ? await responsaveisAtuais("okr", id) : null;

    const { memberIds, ...rest } = v;
    // Ler, recalcular e gravar numa transação só, com o KR travado: um valor
    // lançado no meio (updateOKRProgress) não é mais sobrescrito por esta edição.
    const updated = await prisma.$transaction(async (tx) => {
      await travarKR(tx, id);
      const okr = await tx.oKR.findUnique({ where: { id } });
      if (!okr) throw new Error("OKR não encontrado.");

      const measurementType = v.measurementType ?? okr.measurementType;
      // O ponto de partida vale nos dois modos: na média mensal é opcional e serve
      // para dizer a direção do KR (meta abaixo dele = redução).
      const newInitial = v.initialValue ?? okr.initialValue;
      const newTarget = v.targetValue ?? okr.targetValue;

      const { currentValue, progressPercent } = computeProgress({
        measurementType,
        targetValue: newTarget,
        initialValue: newInitial,
        currentValue: okr.currentValue,
        monthValues: [okr.monthValue1, okr.monthValue2, okr.monthValue3],
      });

      return tx.oKR.update({
        where: { id },
        data: {
          ...rest,
          initialValue: newInitial,
          currentValue,
          progressPercent,
          ...(memberIds !== undefined && { members: { set: (memberIds ?? []).map((mid) => ({ id: mid })) } }),
        },
      });
    });

    if (memberIds !== undefined) {
      await notificarResponsaveis({ fonte: "okr", id, autorId: ator.id, antes: respAntes, depois: memberIds ?? [] });
    }
    revalidatePath("/okrs");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: updated };
  } catch (error) {
    console.error("updateOKR error:", error);
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrado"))) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar o OKR." };
  }
}

export async function deleteOKR(id: string): Promise<ActionResponse> {
  try {
    await requireOKROwnership(id);
    const okr = await prisma.oKR.findUnique({
      where: { id },
    });

    if (!okr) {
      return { success: false, error: "OKR não encontrado." };
    }

    // Since OKR is optional for both initiatives and experiments,
    // we can safely delete it and Prisma will set the okrId to null.
    // We only need to clear the updates history.

    await prisma.$transaction([
      prisma.oKRUpdate.deleteMany({ where: { okrId: id } }),
      prisma.oKR.delete({ where: { id } }),
    ]);

    revalidatePath("/okrs");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    console.error("deleteOKR error:", error);
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrado"))) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao excluir o OKR." };
  }
}

export async function updateOKRProgress(
  id: string,
  newValue: number,
  note?: string
): Promise<ActionResponse> {
  try {
    const v = updateProgressSchema.parse({ newValue, note });
    // Atualizar o valor não exige ser responsável: qualquer um que edite pode
    // lançar. O histórico marca quando quem lançou não é responsável pelo KR.
    const member = await requireEditPermission();

    const updatedOKR = await prisma.$transaction(async (tx) => {
      await travarKR(tx, id);
      const okr = await tx.oKR.findUnique({ where: { id } });
      if (!okr) throw new Error("OKR não encontrado.");

      // KR de média mensal vive de `updateOKRMonthlyValues`: gravar `currentValue`
      // direto aqui deixava os meses e a média inconsistentes.
      if (okr.measurementType === "MEDIA_MENSAL") {
        throw new Error("Este OKR usa meta por média mensal: lance os valores por mês.");
      }
      // Fonte única da conta (antes era uma cópia da fórmula do acumulado).
      const { progressPercent } = computeProgress({
        measurementType: okr.measurementType,
        targetValue: okr.targetValue,
        initialValue: okr.initialValue,
        currentValue: v.newValue,
      });

      await tx.oKRUpdate.create({
        data: {
          okrId: id,
          memberId: member.id,
          previousValue: okr.currentValue,
          newValue: v.newValue,
          note: v.note || null,
          date: new Date(),
        },
      });

      return tx.oKR.update({
        where: { id },
        data: {
          currentValue: v.newValue,
          progressPercent,
          lastUpdatedAt: new Date(),
        },
      });
    });

    revalidatePath("/okrs");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: updatedOKR };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrado"))) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar o progresso." };
  }
}

export async function updateOKRMonthlyValues(
  id: string,
  values: z.infer<typeof updateMonthlyValuesSchema>
): Promise<ActionResponse> {
  try {
    const v = updateMonthlyValuesSchema.parse(values);
    // Idem `updateOKRProgress`: lançar valor não é restrito aos responsáveis.
    const member = await requireEditPermission();

    const updatedOKR = await prisma.$transaction(async (tx) => {
      await travarKR(tx, id);
      const okr = await tx.oKR.findUnique({ where: { id } });
      if (!okr) throw new Error("OKR não encontrado.");
      if (okr.measurementType !== "MEDIA_MENSAL") {
        throw new Error("Este OKR não usa meta por média mensal.");
      }

      const { currentValue, progressPercent } = computeProgress({
        measurementType: "MEDIA_MENSAL",
        targetValue: okr.targetValue,
        // Ponto de partida também vale aqui: é o que diz se o KR sobe ou desce.
        initialValue: okr.initialValue,
        currentValue: okr.currentValue,
        monthValues: [v.monthValue1, v.monthValue2, v.monthValue3],
      });

      // A linha do histórico guarda a média E o snapshot dos três meses: a
      // média sozinha não diz qual mês mudou, e é isso que se quer ler depois.
      await tx.oKRUpdate.create({
        data: {
          okrId: id,
          memberId: member.id,
          previousValue: okr.currentValue,
          newValue: currentValue,
          monthValue1: v.monthValue1,
          monthValue2: v.monthValue2,
          monthValue3: v.monthValue3,
          note: v.note || null,
          date: new Date(),
        },
      });

      return tx.oKR.update({
        where: { id },
        data: {
          monthValue1: v.monthValue1,
          monthValue2: v.monthValue2,
          monthValue3: v.monthValue3,
          currentValue,
          progressPercent,
          lastUpdatedAt: new Date(),
        },
      });
    });

    revalidatePath("/okrs");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: updatedOKR };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrado"))) {
      return { success: false, error: error.message };
    }
    if (error instanceof Error && error.message.includes("média mensal")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar os valores mensais." };
  }
}

// Apaga uma atualização do histórico (ex.: valor digitado errado) e devolve o KR
// ao estado que o histórico restante descreve. Quem pode: quem fez a
// atualização, os responsáveis pelo KR ou a liderança.
export async function deleteOKRUpdate(updateId: string): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();

    await prisma.$transaction(async (tx) => {
      const alvo = await tx.oKRUpdate.findUnique({
        where: { id: updateId },
        include: { okr: { include: { members: { select: { id: true } } } } },
      });
      if (!alvo) throw new Error("Atualização não encontrada.");

      const ownerIds = alvo.okr.members.map((m) => m.id);
      if (alvo.memberId !== member.id && !hasOwnershipAccess(member, ownerIds)) {
        throw new Error(
          "Permissão negada. Só quem fez a atualização, os responsáveis pelo KR ou a liderança podem apagá-la."
        );
      }

      // Trava o KR ANTES de ler o histórico: daqui sai o currentValue que vamos
      // regravar. Sem a trava, um lançamento que outra pessoa gravasse entre a
      // leitura e o update era sobrescrito com um valor calculado sem ele — o
      // mesmo problema que travarKR resolve nos outros três escritores do KR.
      await travarKR(tx, alvo.okrId);

      // Cronológico: a linha seguinte guarda "de X → Y" e X era o valor que esta
      // atualização pôs. Sem religar, ela citaria um valor que não está mais no
      // histórico.
      const todas = await tx.oKRUpdate.findMany({
        where: { okrId: alvo.okrId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });
      const idx = todas.findIndex((u) => u.id === alvo.id);
      const seguinte = todas[idx + 1];
      const restantes = todas.filter((u) => u.id !== alvo.id);

      await tx.oKRUpdate.delete({ where: { id: alvo.id } });

      if (seguinte) {
        await tx.oKRUpdate.update({
          where: { id: seguinte.id },
          data: { previousValue: alvo.previousValue },
        });
        // Não era a mais recente: o valor atual do KR não muda.
        return;
      }

      const okr = alvo.okr;
      const ultima = restantes[restantes.length - 1];

      if (okr.measurementType === "MEDIA_MENSAL") {
        const comSnapshot = [...restantes]
          .reverse()
          .find((u) => u.monthValue1 !== null || u.monthValue2 !== null || u.monthValue3 !== null);
        const meses = [
          comSnapshot?.monthValue1 ?? null,
          comSnapshot?.monthValue2 ?? null,
          comSnapshot?.monthValue3 ?? null,
        ];
        const { currentValue, progressPercent } = computeProgress({
          measurementType: "MEDIA_MENSAL",
          targetValue: okr.targetValue,
          initialValue: okr.initialValue,
          currentValue: okr.currentValue,
          monthValues: meses,
        });
        await tx.oKR.update({
          where: { id: okr.id },
          data: {
            monthValue1: meses[0],
            monthValue2: meses[1],
            monthValue3: meses[2],
            currentValue,
            progressPercent,
            lastUpdatedAt: ultima?.date ?? null,
          },
        });
        return;
      }

      // Sem atualização sobrando, o KR volta ao ponto de partida (como ao criar).
      const { currentValue, progressPercent } = computeProgress({
        measurementType: okr.measurementType,
        targetValue: okr.targetValue,
        initialValue: okr.initialValue,
        currentValue: ultima?.newValue ?? okr.initialValue,
      });
      await tx.oKR.update({
        where: { id: okr.id },
        data: { currentValue, progressPercent, lastUpdatedAt: ultima?.date ?? null },
      });
    });

    revalidatePath("/okrs");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    console.error("deleteOKRUpdate error:", error);
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrad"))) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao apagar a atualização." };
  }
}
