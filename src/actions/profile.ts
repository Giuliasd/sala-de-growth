"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { updateTag } from "next/cache";
import { NOME_EM_USO, nomeEmUso } from "@/lib/nome-membro";

// Mesmas regras de nome da gestão de membros (team-members.ts): as duas telas
// gravam o mesmo campo e não podem aceitar coisas diferentes.
const UpdateProfileSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(120, "O nome é muito longo."),
});

export async function updateProfile(data: { name: string }) {
  const member = await getCurrentMember();

  const validated = UpdateProfileSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message };
  }

  try {
    if (await nomeEmUso(validated.data.name, member.id)) {
      return { success: false, error: NOME_EM_USO };
    }
    await prisma.teamMember.update({
      where: { id: member.id },
      data: { name: validated.data.name },
    });
    updateTag("team-members");
    return { success: true };
  } catch {
    return { success: false, error: "Erro ao atualizar perfil." };
  }
}
