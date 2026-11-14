"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, requireEditPermission } from "@/lib/session";
import { safeHttpUrl } from "@/lib/url";
import { ERRO_LISTA_GRANDE, ERRO_LISTA_REPETIDA, MAX_ITENS_NA_ORDEM } from "@/lib/lista-de-ordem";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const playbookLinkSchema = z.object({
  title: z.string().min(1, "O título é obrigatório.").max(200, "O título é muito longo."),
  subtitle: z.string().min(1, "O subtítulo é obrigatório.").max(300, "O subtítulo é muito longo."),
  url: safeHttpUrl,
  iconName: z.string().min(1, "Selecione um ícone.").max(60, "Ícone inválido."),
  sectionId: z.string().uuid("Seção inválida.").nullable().optional().or(z.literal("")),
});

const playbookSectionSchema = z.object({
  name: z.string().min(1, "O nome da seção é obrigatório.").max(120, "O nome da seção é muito longo."),
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function getPlaybookLinks() {
  await getCurrentMember();
  return await prisma.playbookLink.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

export async function getPlaybookSections() {
  await getCurrentMember();
  return await prisma.playbookSection.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

export async function createPlaybookSection(
  data: z.infer<typeof playbookSectionSchema>
): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = playbookSectionSchema.parse(data);

    const count = await prisma.playbookSection.count();
    const section = await prisma.playbookSection.create({
      data: { name: v.name, order: count },
    });

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: section };
  } catch (error) {
    console.error("createPlaybookSection error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar a seção." };
  }
}

export async function updatePlaybookSection(
  id: string,
  data: z.infer<typeof playbookSectionSchema>
): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = playbookSectionSchema.parse(data);

    const section = await prisma.playbookSection.update({
      where: { id },
      data: { name: v.name },
    });

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: section };
  } catch (error) {
    console.error("updatePlaybookSection error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar a seção." };
  }
}

export async function deletePlaybookSection(id: string): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    // onDelete: SetNull move os links da seção para "Sem seção".
    await prisma.playbookSection.delete({ where: { id } });

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: null };
  } catch (error) {
    console.error("deletePlaybookSection error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao excluir a seção." };
  }
}

// Cada id vira um UPDATE na transação: sem repetidos e com teto (ver
// lib/lista-de-ordem.ts). Id que não existe já aborta a transação no update.
const reorderSchema = z
  .array(z.string().uuid("Id inválido."))
  .min(1, "Lista vazia.")
  .max(MAX_ITENS_NA_ORDEM, ERRO_LISTA_GRANDE)
  .refine((ids) => new Set(ids).size === ids.length, ERRO_LISTA_REPETIDA);

// Recebe a lista COMPLETA de ids na nova ordem e grava order = índice.
// Nas listas de links, a ordem é relativa dentro do grupo (seção) — o cliente
// envia só os ids daquele grupo, já na sequência desejada.
export async function reorderPlaybookSections(ids: string[]): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = reorderSchema.parse(ids);

    await prisma.$transaction(
      v.map((id, index) => prisma.playbookSection.update({ where: { id }, data: { order: index } }))
    );

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: null };
  } catch (error) {
    console.error("reorderPlaybookSections error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao reordenar as seções." };
  }
}

export async function reorderPlaybookLinks(ids: string[]): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = reorderSchema.parse(ids);

    await prisma.$transaction(
      v.map((id, index) => prisma.playbookLink.update({ where: { id }, data: { order: index } }))
    );

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: null };
  } catch (error) {
    console.error("reorderPlaybookLinks error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao reordenar os links." };
  }
}

export async function createPlaybookLink(data: z.infer<typeof playbookLinkSchema>): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = playbookLinkSchema.parse(data);

    const link = await prisma.playbookLink.create({
      data: {
        title: v.title,
        subtitle: v.subtitle,
        url: v.url,
        iconName: v.iconName,
        sectionId: v.sectionId || null,
      },
    });

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: link };
  } catch (error) {
    console.error("createPlaybookLink error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar link do playbook." };
  }
}

export async function updatePlaybookLink(
  id: string,
  data: z.infer<typeof playbookLinkSchema>
): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    const v = playbookLinkSchema.parse(data);

    const link = await prisma.playbookLink.update({
      where: { id },
      data: {
        title: v.title,
        subtitle: v.subtitle,
        url: v.url,
        iconName: v.iconName,
        sectionId: v.sectionId || null,
      },
    });

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: link };
  } catch (error) {
    console.error("updatePlaybookLink error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar link do playbook." };
  }
}

export async function deletePlaybookLink(id: string): Promise<ActionResponse> {
  try {
    await requireEditPermission();
    
    await prisma.playbookLink.delete({
      where: { id },
    });

    revalidatePath("/playbook");
    revalidatePath("/configuracoes/playbook");
    return { success: true, data: null };
  } catch (error) {
    console.error("deletePlaybookLink error:", error);
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao excluir link do playbook." };
  }
}
