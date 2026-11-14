"use server";

import { prisma } from "@/lib/prisma";
import { requireLeadershipPermission } from "@/lib/session";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { MemberRole } from "@/generated/prisma/enums";
import { randomUUID } from "crypto";

const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, "E-mail muito longo.").email("E-mail inválido."),
  role: z.enum(["VISITANTE", "COLABORADOR", "LIDERANCA"]),
});

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export async function createInvite(
  data: { email: string; role: string }
): Promise<ActionResponse<{ inviteUrl: string }>> {
  try {
    const leader = await requireLeadershipPermission();
    const validated = createInviteSchema.parse(data);

    const existing = await prisma.teamMember.findUnique({ where: { email: validated.email } });
    if (existing) {
      return { success: false, error: "Este e-mail já tem uma conta cadastrada." };
    }

    const existingInvite = await prisma.invite.findUnique({ where: { email: validated.email } });
    if (existingInvite && !existingInvite.usedAt && existingInvite.expiresAt > new Date()) {
      return { success: false, error: "Já existe um convite pendente para este e-mail." };
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.invite.upsert({
      where: { email: validated.email },
      update: { role: validated.role as MemberRole, token, createdById: leader.id, expiresAt, usedAt: null },
      create: {
        email: validated.email,
        role: validated.role as MemberRole,
        token,
        createdById: leader.id,
        expiresAt,
      },
    });

    // NextAuth v5 usa AUTH_URL; NEXTAUTH_URL fica como fallback de compatibilidade (v4).
    const appUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/invite/${token}`;

    revalidatePath("/configuracoes/membros");
    updateTag("onboarding");
    return { success: true, data: { inviteUrl } };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao criar convite." };
  }
}

export async function listInvites() {
  await requireLeadershipPermission();
  return prisma.invite.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeInvite(id: string): Promise<ActionResponse> {
  try {
    await requireLeadershipPermission();
    await prisma.invite.delete({ where: { id } });
    revalidatePath("/configuracoes/membros");
    return { success: true, data: null };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erro ao revogar convite." };
  }
}

// getInviteByToken mora em lib/invites.ts: aqui, sem portão, ela virava endpoint.
