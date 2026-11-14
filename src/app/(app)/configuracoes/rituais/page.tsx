import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getHorariosDoRitual } from "@/actions/horario-do-ritual";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { HorariosDoRitualForm } from "@/components/configuracoes/HorariosDoRitualForm";


export const metadata: Metadata = {
  title: "Configurações: Rituais | Sala de Growth",
};

export default async function RituaisConfigPage() {
  const member = await getCurrentMember();
  if (member.role !== MemberRole.LIDERANCA) redirect("/configuracoes/playbook");

  const { horarios, semanaAtual } = await getHorariosDoRitual();

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-ink">Rituais</h2>
        <p className="text-sm text-ink-soft">Quando a semana da Weekly fecha e até quando o que entra nela é planejado</p>
      </div>

      {/* key: depois de salvar, o formulário recomeça do que ficou gravado. */}
      <HorariosDoRitualForm
        key={JSON.stringify(horarios)}
        horarios={horarios}
        semanaAtual={semanaAtual}
      />
    </div>
  );
}
