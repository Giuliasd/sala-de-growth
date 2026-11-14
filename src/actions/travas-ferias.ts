"use server";

import { prisma } from "@/lib/prisma";
import { dataSchema } from "@/lib/date-validation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, requireLeadershipPermission } from "@/lib/session";

/**
 * Travas de férias: janelas em que ninguém do time pode tirar férias (Black
 * Friday, virada de ano, semana de lançamento). Diferente de `Ausencia`, que é
 * de uma pessoa, a trava vale para o time inteiro — por isso quem cria é a
 * liderança, mesma regra dos quarters.
 */


const createTravaSchema = z
  .object({
    name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(80),
    startDate: dataSchema,
    endDate: dataSchema,
    notes: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: "A data de fim deve ser igual ou posterior à data de início.",
    path: ["endDate"],
  });

const updateTravaSchema = z
  .object({
    name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(80).optional(),
    startDate: dataSchema.optional(),
    endDate: dataSchema.optional(),
    notes: z.string().max(500).optional().or(z.literal("")).nullable(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return new Date(d.endDate) >= new Date(d.startDate);
      return true;
    },
    { message: "A data de fim deve ser igual ou posterior à data de início.", path: ["endDate"] }
  );

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// ─── Queries ───────────────────────────────────────────────────────

/** Travas que cruzam a janela pedida (ou todas, se a janela for omitida). */
export async function getTravasFerias(filters?: { rangeStart?: Date; rangeEnd?: Date }) {
  await getCurrentMember();
  return await prisma.travaFerias.findMany({
    where:
      filters?.rangeStart && filters?.rangeEnd
        ? { startDate: { lte: filters.rangeEnd }, endDate: { gte: filters.rangeStart } }
        : undefined,
    orderBy: { startDate: "asc" },
  });
}

// ─── Mutations ─────────────────────────────────────────────────────

function revalidate() {
  revalidatePath("/ausencias");
  revalidatePath("/dashboard");
}

export async function createTravaFerias(
  data: z.infer<typeof createTravaSchema>
): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const v = createTravaSchema.parse(data);
    const trava = await prisma.travaFerias.create({
      data: {
        name: v.name,
        startDate: new Date(v.startDate),
        endDate: new Date(v.endDate),
        notes: v.notes || null,
      },
    });
    revalidate();
    return { success: true, data: trava };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao criar a trava de férias." };
  }
}

export async function updateTravaFerias(
  id: string,
  data: z.infer<typeof updateTravaSchema>
): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const v = updateTravaSchema.parse(data);
    // Datas parciais precisam ser comparadas com o que já está gravado, senão
    // dá para inverter o período mandando só uma das duas.
    const atual = await prisma.travaFerias.findUnique({ where: { id } });
    if (!atual) return { success: false, error: "Trava de férias não encontrada." };
    const inicio = v.startDate ? new Date(v.startDate) : atual.startDate;
    const fim = v.endDate ? new Date(v.endDate) : atual.endDate;
    if (fim < inicio) {
      return { success: false, error: "A data de fim deve ser igual ou posterior à data de início." };
    }

    const trava = await prisma.travaFerias.update({
      where: { id },
      data: {
        ...(v.name !== undefined && { name: v.name }),
        startDate: inicio,
        endDate: fim,
        ...("notes" in v && { notes: v.notes || null }),
      },
    });
    revalidate();
    return { success: true, data: trava };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao atualizar a trava de férias." };
  }
}

export async function deleteTravaFerias(id: string): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    await prisma.travaFerias.delete({ where: { id } });
    revalidate();
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao excluir a trava de férias." };
  }
}
