import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTeamMembersComContato } from "@/actions/team-members";
import { listInvites } from "@/actions/invites";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { MemberList } from "@/components/configuracoes/MemberList";
import { InviteSection } from "@/components/configuracoes/InviteSection";


export const metadata: Metadata = {
  title: "Configurações: Membros | Sala de Growth",
};

export default async function MembrosConfigPage() {
  const currentMember = await getCurrentMember();
  const isLideranca = currentMember.role === MemberRole.LIDERANCA;
  if (!isLideranca) redirect("/configuracoes/playbook");

  const [allMembers, pendingInvites] = await Promise.all([
    getTeamMembersComContato(),
    listInvites(),
  ]);

  // Membros inativos (removidos) somem da lista do time. O registro permanece no
  // banco — nunca é deletado — para que iniciativas, experimentos, OKRs,
  // comentários e histórico continuem exibindo o nome da pessoa.
  const members = allMembers.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-ink">Membros</h2>
        <p className="text-sm text-ink-soft">Gerencie os membros do time</p>
      </div>

      <MemberList members={members} currentUserId={currentMember.id} currentUserRole={currentMember.role} />

      {isLideranca && (
        <InviteSection pendingInvites={pendingInvites.map(i => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt,
          createdBy: i.createdBy,
        }))} />
      )}
    </div>
  );
}
