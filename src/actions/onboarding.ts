"use server";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";

export type WorkspaceSetupStatus = {
  hasQuarter: boolean;
  hasFrente: boolean;
  hasOKR: boolean;
  hasPlanejamento: boolean;
  hasTeam: boolean;
  /** Setup mínimo pronto para o time usar: quarter + algum conteúdo planejado. */
  hasConteudo: boolean;
  /** Todos os passos do checklist de liderança concluídos. */
  isComplete: boolean;
};

// Status de preparação da sala — decide se o dashboard mostra o onboarding
// (checklist para liderança; aviso de "em preparação" para o restante).
//
// Em cache (tag "onboarding"): roda em TODA visita ao dashboard, mas numa sala
// já preparada a resposta é sempre a mesma e o componente nem renderiza. Antes
// eram 7 COUNTs por visita, disputando o pool com as outras seções. As actions
// que criam os itens do checklist chamam `updateTag("onboarding")`, então quem
// está montando a sala vê o passo marcado na hora. Exclusões não invalidam: no
// pior caso o checklist reaparece com até 5 min de atraso.
//
// `findFirst` em vez de `count`: só importa saber se existe.
const exists = (row: unknown) => row !== null;
const _getWorkspaceSetupStatus = unstable_cache(
  async (): Promise<WorkspaceSetupStatus> => {
    const [quarter, frente, okr, iniciativa, experimento, membros, convite] =
      await Promise.all([
        prisma.quarter.findFirst({ select: { id: true } }),
        prisma.frente.findFirst({ where: { isActive: true }, select: { id: true } }),
        prisma.oKR.findFirst({ select: { id: true } }),
        prisma.iniciativa.findFirst({ where: { deletedAt: null }, select: { id: true } }),
        prisma.experimento.findFirst({ where: { deletedAt: null }, select: { id: true } }),
        // Basta saber se há MAIS de um membro ativo.
        prisma.teamMember.findMany({ where: { isActive: true }, select: { id: true }, take: 2 }),
        prisma.invite.findFirst({ select: { id: true } }),
      ]);

    const hasQuarter = exists(quarter);
    const hasFrente = exists(frente);
    const hasOKR = exists(okr);
    const hasPlanejamento = exists(iniciativa) || exists(experimento);
    // "Time convidado" = existe alguém além do primeiro membro, ou já há convite emitido.
    const hasTeam = membros.length > 1 || exists(convite);

    return {
      hasQuarter,
      hasFrente,
      hasOKR,
      hasPlanejamento,
      hasTeam,
      hasConteudo: hasQuarter && (hasOKR || hasPlanejamento),
      isComplete: hasQuarter && hasFrente && hasOKR && hasPlanejamento && hasTeam,
    };
  },
  ["workspace-setup-status"],
  { revalidate: 300, tags: ["onboarding"] },
);

export async function getWorkspaceSetupStatus(): Promise<WorkspaceSetupStatus> {
  await getCurrentMember();
  return _getWorkspaceSetupStatus();
}
