import { prisma } from "@/lib/prisma";

/**
 * Convite pelo token, para a página pública /invite/[token].
 *
 * Mora aqui, e não em actions/invites.ts, de propósito: tudo que é exportado de
 * um arquivo "use server" vira endpoint chamável por POST, e esta função não tem
 * portão — o token (UUID) é a própria credencial. Fora das actions ela só é
 * chamada pelo componente de servidor da página (auditoria de 13/11/2026).
 */
export async function getInviteByToken(token: string) {
  return prisma.invite.findUnique({
    where: { token },
    select: { id: true, email: true, role: true, expiresAt: true, usedAt: true },
  });
}
