"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { getQuartersCached } from "@/lib/quarters-cache";
import { getQuarterDates } from "@/lib/quarter-dates";
import { getCurrentMember, requireLeadershipPermission } from "@/lib/session";

const createQuarterSchema = z.object({
  year: z.number().int().min(2024, "Ano mínimo: 2024.").max(2030, "Ano máximo: 2030."),
  quarter: z.number().int().min(1, "Quarter inválido.").max(4, "Quarter inválido."),
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function getQuarters() {
  await getCurrentMember();
  return getQuartersCached();
}

// Só a tela de configuração de quarters usa as contagens (para travar o botão
// de excluir). Ficam fora do getQuarters em cache: aquele vai em quase toda
// página e não precisa de três subconsultas por quarter — e, em cache, as
// contagens ficavam até 5 min desatualizadas, porque criar uma iniciativa não
// invalida a tag "quarters". A exclusão em si confere de novo no servidor.
export async function getQuartersComContagem() {
  await getCurrentMember();
  return prisma.quarter.findMany({
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
    include: { _count: { select: { okrs: true, iniciativas: true, experimentos: true, objetivos: true } } },
  });
}

export async function getActiveQuarter() {
  await getCurrentMember();
  return await prisma.quarter.findFirst({
    where: { isActive: true },
  });
}

export async function createQuarter(
  data: z.infer<typeof createQuarterSchema>
): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const v = createQuarterSchema.parse(data);

    const existing = await prisma.quarter.findFirst({
      where: { year: v.year, quarter: v.quarter },
    });
    if (existing) {
      return { success: false, error: `Q${v.quarter} ${v.year} já existe.` };
    }

    const { startDate, endDate } = getQuarterDates(v.year, v.quarter as 1 | 2 | 3 | 4);

    const count = await prisma.quarter.count();

    const quarter = await prisma.quarter.create({
      data: {
        year: v.year,
        quarter: v.quarter,
        startDate,
        endDate,
        isActive: count === 0, // Primeiro quarter criado é o ativo por default
      },
    });

    revalidatePath("/configuracoes");
    updateTag("quarters");
    updateTag("onboarding");
    return { success: true, data: quarter };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar o quarter." };
  }
}

export async function setActiveQuarter(id: string): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    await prisma.$transaction([
      prisma.quarter.updateMany({ data: { isActive: false } }),
      prisma.quarter.update({ where: { id }, data: { isActive: true } }),
    ]);

    revalidatePath("/configuracoes");
    updateTag("quarters");
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao ativar o quarter." };
  }
}

export async function deleteQuarter(id: string): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const quarter = await prisma.quarter.findUnique({
      where: { id },
      include: {
        _count: {
          select: { okrs: true, iniciativas: true, experimentos: true, objetivos: true },
        },
      },
    });

    if (!quarter) {
      return { success: false, error: "Quarter não encontrado." };
    }

    // Objetivo.quarterId é FK obrigatória sem cascade: ficar de fora da soma deixava
    // um quarter só com objetivos passar na trava e estourar no delete.
    const total =
      quarter._count.okrs +
      quarter._count.iniciativas +
      quarter._count.experimentos +
      quarter._count.objetivos;
    if (total > 0) {
      return {
        success: false,
        error: "Este quarter possui registros vinculados e não pode ser excluído.",
      };
    }

    await prisma.quarter.delete({ where: { id } });

    revalidatePath("/configuracoes");
    updateTag("quarters");
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao excluir o quarter." };
  }
}
