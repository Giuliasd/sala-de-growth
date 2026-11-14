"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { notificarComentario } from "@/lib/notificacoes-db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createCommentSchema = z.object({
  experimentoId: z.string().uuid("Experimento inválido."),
  content: z.string().trim().min(1, "O comentário não pode estar vazio.").max(2000, "O comentário é muito longo."),
});

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function createExperimentoComment(data: {
  experimentoId: string;
  content: string;
}): Promise<ActionResponse> {
  try {
    const member = await getCurrentMember();
    const v = createCommentSchema.parse(data);

    // Item excluído/convertido não recebe comentário novo (ele ficaria invisível).
    const existe = await prisma.experimento.findUnique({
      where: { id: v.experimentoId, deletedAt: null },
      select: { id: true },
    });
    if (!existe) return { success: false, error: "Experimento não encontrado." };

    const comment = await prisma.experimentoComment.create({
      data: {
        experimentoId: v.experimentoId,
        content: v.content,
        memberId: member.id,
      },
      include: {
        member: {
          select: { id: true, name: true },
        },
      },
    });

    await notificarComentario({ fonte: "experimento", itemId: v.experimentoId, autorId: member.id, conteudo: v.content });
    revalidatePath("/experimentos", "layout");
    revalidatePath(`/experimentos/${v.experimentoId}`);
    return { success: true, data: comment };
  } catch (error) {
    console.error("Error creating comment:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao criar o comentário." };
  }
}

export async function deleteExperimentoComment(commentId: string): Promise<ActionResponse> {
  try {
    const member = await getCurrentMember();

    const comment = await prisma.experimentoComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return { success: false, error: "Comentário não encontrado." };
    }

    if (comment.memberId !== member.id) {
      return { success: false, error: "Sem permissão para deletar este comentário." };
    }

    await prisma.experimentoComment.delete({
      where: { id: commentId },
    });

    revalidatePath("/experimentos", "layout");
    revalidatePath(`/experimentos/${comment.experimentoId}`);
    return { success: true, data: null };
  } catch (error) {
    console.error("Error deleting comment:", error);
    return { success: false, error: "Erro ao deletar o comentário." };
  }
}
