"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentMember, requireEditPermission, requireLeadershipPermission } from "@/lib/session";
import { NOME_EM_USO, nomeEmUso } from "@/lib/nome-membro";

// Só o que as telas usam para listar, filtrar e escolher responsáveis. Esta
// lista vai no payload de quase toda página (e para quem é VISITANTE): e-mail e
// timestamps ficam de fora. A tela de membros usa getTeamMembersComContato.
const _getTeamMembers = unstable_cache(
  () =>
    prisma.teamMember.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, isActive: true },
    }),
  ["team-members"],
  { revalidate: 300, tags: ["team-members"] },
);

// E-mail normalizado (minúsculas, sem espaços): é a chave de login, e o Google
// devolve sempre minúsculo — ver lib/email.ts.
const createTeamMemberSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(120, "O nome é muito longo."),
  email: z.string().trim().toLowerCase().max(254, "E-mail muito longo.").email("E-mail inválido."),
});

const updateTeamMemberSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(120, "O nome é muito longo.").optional(),
  email: z.string().trim().toLowerCase().max(254, "E-mail muito longo.").email("E-mail inválido.").optional(),
  role: z.enum(["VISITANTE", "COLABORADOR", "LIDERANCA"]).optional(),
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function getTeamMembers() {
  await getCurrentMember();
  return _getTeamMembers();
}

// Linha completa (com e-mail), só para a gestão de membros — liderança.
export async function getTeamMembersComContato() {
  await requireLeadershipPermission();
  return prisma.teamMember.findMany({ orderBy: { name: "asc" } });
}

export async function createTeamMember(data: z.infer<typeof createTeamMemberSchema>): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    const validated = createTeamMemberSchema.parse(data);
    
    const existing = await prisma.teamMember.findUnique({ where: { email: validated.email } });
    if (existing) {
      return { success: false, error: "Este e-mail já está cadastrado para outro membro." };
    }
    if (await nomeEmUso(validated.name)) {
      return { success: false, error: NOME_EM_USO };
    }

    const member = await prisma.teamMember.create({
      data: {
        name: validated.name,
        email: validated.email,
        role: "VISITANTE",
        isActive: true,
      },
    });
    revalidatePath("/configuracoes");
    updateTag("team-members");
    return { success: true, data: member };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao criar membro do time." };
  }
}

export async function updateTeamMember(
  id: string,
  data: z.infer<typeof updateTeamMemberSchema>
): Promise<ActionResponse> {
  try {
    const validated = updateTeamMemberSchema.parse(data);
    if (validated.role !== undefined) {
      await requireLeadershipPermission();
    } else {
      const caller = await requireEditPermission();
      if (caller.id !== id) {
        throw new Error("Permissão negada. Você só pode editar o seu próprio perfil.");
      }
      // O e-mail é a chave de login. Quem edita o próprio perfil não pode
      // trocá-lo: apontar a conta para o e-mail de um terceiro entregaria a ele
      // o papel e os itens da pessoa sem nenhum convite. Só a liderança (caminho
      // acima, com `role`) altera e-mail.
      if (validated.email !== undefined) {
        throw new Error("Permissão negada. Apenas a liderança pode alterar o e-mail.");
      }
    }
    
    if (validated.email) {
      const existing = await prisma.teamMember.findUnique({ where: { email: validated.email } });
      if (existing && existing.id !== id) {
        return { success: false, error: "Este e-mail já está em uso por outro membro." };
      }
    }
    if (validated.name !== undefined && (await nomeEmUso(validated.name, id))) {
      return { success: false, error: NOME_EM_USO };
    }

    const member = await prisma.teamMember.update({
      where: { id },
      data: validated,
    });

    revalidatePath("/configuracoes");
    updateTag("team-members");
    return { success: true, data: member };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error?.issues?.[0]?.message) {
      return { success: false, error: error.issues[0].message };
    }
    // Mensagem genérica: `error.message` de erro do Prisma traz nome de modelo e
    // coluna, e não deve chegar à tela.
    console.error("Error updating team member:", error);
    return { success: false, error: "Erro ao atualizar membro." };
  }
}

export async function toggleMemberActive(id: string): Promise<ActionResponse> {
  try {
    const currentMember = await requireLeadershipPermission();
    
    if (currentMember.id === id) {
      return { success: false, error: "Você não pode desativar o seu próprio acesso." };
    }

    const memberToToggle = await prisma.teamMember.findUnique({ where: { id } });
    if (!memberToToggle) {
      return { success: false, error: "Membro não encontrado." };
    }

    const willDeactivate = memberToToggle.isActive;
    const updated = await prisma.teamMember.update({
      where: { id },
      // Ao desativar, apaga o e-mail: o registro é mantido só com o nome (para
      // preservar autoria em iniciativas/experimentos/OKRs/comentários) e o
      // endereço é liberado para reconvite. Reativar não restaura o e-mail —
      // a pessoa precisa ser convidada de novo.
      data: willDeactivate
        ? { isActive: false, email: null }
        : { isActive: true },
    });

    revalidatePath("/configuracoes");
    updateTag("team-members");
    return { success: true, data: updated };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro inesperado ao alterar status do membro." };
  }
}
