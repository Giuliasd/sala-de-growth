import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";


export const metadata: Metadata = {
  title: "Configurações | Sala de Growth",
};
// Liderança cai na primeira aba (Frentes); colaboradores só têm o Playbook.
export default async function ConfiguracoesPage() {
  const member = await getCurrentMember();
  redirect(
    member.role === MemberRole.LIDERANCA
      ? "/configuracoes/frentes"
      : "/configuracoes/playbook"
  );
}
