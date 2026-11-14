"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentMember, requireLeadershipPermission } from "@/lib/session";

const _getFrentes = unstable_cache(
  () => prisma.frente.findMany({ orderBy: { name: "asc" } }),
  ["frentes"],
  { revalidate: 300, tags: ["frentes"] },
);

const createFrenteSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres.").max(80, "O nome é muito longo."),
});

const updateFrenteSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres.").max(80, "O nome é muito longo.").optional(),
  isActive: z.boolean().optional(),
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function getFrentes() {
  await getCurrentMember();
  return _getFrentes();
}

export async function createFrente(data: z.infer<typeof createFrenteSchema>): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const validated = createFrenteSchema.parse(data);
    const frente = await prisma.frente.create({
      data: {
        name: validated.name,
        isActive: true, // Default via banco e explícito
      },
    });
    revalidatePath("/configuracoes");
    updateTag("frentes");
    updateTag("onboarding");
    return { success: true, data: frente };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    // Retorna mensagem formatada se erro for de parsing Zod
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar a frente." };
  }
}

export async function updateFrente(
  id: string,
  data: z.infer<typeof updateFrenteSchema>
): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const validated = updateFrenteSchema.parse(data);
    const frente = await prisma.frente.update({
      where: { id },
      data: validated,
    });
    revalidatePath("/configuracoes");
    updateTag("frentes");
    return { success: true, data: frente };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar a frente." };
  }
}

export async function toggleFrenteActive(id: string): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const frente = await prisma.frente.findUnique({ where: { id } });
    if (!frente) {
      return { success: false, error: "Frente não encontrada no banco." };
    }

    const updatedFrente = await prisma.frente.update({
      where: { id },
      data: { isActive: !frente.isActive },
    });
    
    revalidatePath("/configuracoes");
    updateTag("frentes");
    return { success: true, data: updatedFrente };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro crítico ao desativar frente." };
  }
}
