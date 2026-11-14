import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFrentes } from "@/actions/frentes";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { FrenteList } from "@/components/configuracoes/FrenteList";
import { PageHeader } from "@/components/shared/PageHeader";


export const metadata: Metadata = {
  title: "Configurações: Frentes | Sala de Growth",
};

export default async function FrentesConfigPage() {
  const member = await getCurrentMember();
  if (member.role !== MemberRole.LIDERANCA) redirect("/configuracoes/playbook");

  const frentes = await getFrentes();

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-ink">Frentes</h2>
        <p className="text-sm text-ink-soft">Gerencie as frentes de trabalho do time</p>
      </div>
      
      <FrenteList frentes={frentes} />
    </div>
  );
}
