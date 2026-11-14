import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getQuartersComContagem } from "@/actions/quarters";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { QuarterList } from "@/components/configuracoes/QuarterList";


export const metadata: Metadata = {
  title: "Configurações: Quarters | Sala de Growth",
};

export default async function QuartersConfigPage() {
  const member = await getCurrentMember();
  if (member.role !== MemberRole.LIDERANCA) redirect("/configuracoes/playbook");

  const quarters = await getQuartersComContagem();

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-ink">Quarters</h2>
        <p className="text-sm text-ink-soft">Gerencie os ciclos trimestrais</p>
      </div>

      <QuarterList quarters={quarters} />
    </div>
  );
}
