"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { notificarComentario, notificarEdicaoDeComentario } from "@/lib/notificacoes-db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createCommentSchema = z.object({
  initiativeId: z.string().uuid("Iniciativa inválida."),
  content: z.string().trim().min(1, "O comentário não pode estar vazio.").max(2000, "O comentário é muito longo."),
});

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function createInitiativeComment(data: {
  initiativeId: string;
  content: string;
}): Promise<ActionResponse> {
  try {
    const member = await getCurrentMember();
    const v = createCommentSchema.parse(data);

    // Item excluído/convertido não recebe comentário novo (ele ficaria invisível).
    const existe = await prisma.iniciativa.findUnique({
      where: { id: v.initiativeId, deletedAt: null },
      select: { id: true },
    });
    if (!existe) return { success: false, error: "Iniciativa não encontrada." };

    const comment = await prisma.initiativeComment.create({
      data: {
        initiativeId: v.initiativeId,
        content: v.content,
        memberId: member.id,
      },
      include: {
        member: {
          select: { id: true, name: true },
        },
      },
    });

    await notificarComentario({ fonte: "iniciativa", itemId: v.initiativeId, autorId: member.id, conteudo: v.content });
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${v.initiativeId}`);
    return { success: true, data: comment };
  } catch (error) {
    console.error("Error creating comment:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao criar o comentário." };
  }
}

export async function updateInitiativeComment(data: {
  commentId: string;
  content: string;
}): Promise<ActionResponse> {
  try {
    const member = await getCurrentMember();

    const comment = await prisma.initiativeComment.findUnique({
      where: { id: data.commentId },
    });

    if (!comment) {
      return { success: false, error: "Comentário não encontrado." };
    }

    if (comment.memberId !== member.id) {
      return { success: false, error: "Sem permissão para editar este comentário." };
    }

    const content = data.content.trim();
    if (!content) {
      return { success: false, error: "O comentário não pode estar vazio." };
    }
    if (content.length > 2000) {
      return { success: false, error: "O comentário é muito longo." };
    }

    const updated = await prisma.initiativeComment.update({
      where: { id: data.commentId },
      data: { content },
    });

    await notificarEdicaoDeComentario({
      fonte: "iniciativa",
      itemId: comment.initiativeId,
      autorId: member.id,
      antes: comment.content,
      depois: content,
    });
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${comment.initiativeId}`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating comment:", error);
    return { success: false, error: "Erro ao atualizar o comentário." };
  }
}

export async function deleteInitiativeComment(commentId: string): Promise<ActionResponse> {
  try {
    const member = await getCurrentMember();

    const comment = await prisma.initiativeComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return { success: false, error: "Comentário não encontrado." };
    }

    if (comment.memberId !== member.id) {
      return { success: false, error: "Sem permissão para deletar este comentário." };
    }

    await prisma.initiativeComment.delete({
      where: { id: commentId },
    });

    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${comment.initiativeId}`);
    return { success: true, data: null };
  } catch (error) {
    console.error("Error deleting comment:", error);
    return { success: false, error: "Erro ao deletar o comentário." };
  }
}
