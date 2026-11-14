import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { ConfiguracoesShell } from "@/components/configuracoes/ConfiguracoesShell";

// Configurações é acessível a quem pode editar (liderança e colaboradores);
// visitantes são redirecionados. Frentes, membros e quarters continuam
// restritos à liderança — o gate fino fica em cada página e nas actions
// (defesa em profundidade). Colaboradores enxergam só o Playbook.
export default async function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();
  if (member.role === MemberRole.VISITANTE) {
    redirect("/dashboard");
  }

  return (
    <ConfiguracoesShell isLideranca={member.role === MemberRole.LIDERANCA}>
      {children}
    </ConfiguracoesShell>
  );
}
