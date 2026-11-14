import { getQuarters } from "@/actions/quarters";
import { getFrentes } from "@/actions/frentes";
import { getTeamMembers } from "@/actions/team-members";
import { getExperimentos } from "@/actions/experimentos";
import { getOKRsForSelect } from "@/actions/okrs";
import { getCurrentMember } from "@/lib/session";
import { ExperimentoTable } from "@/components/experimentos/ExperimentoTable";
import type { Metadata } from "next";
import { normalizarBusca } from "@/lib/busca";

export const metadata: Metadata = {
  title: "Experimentos | Sala de Growth",
  description: "Gerencie os experimentos do time de Growth.",
};

export default async function ExperimentosPage({
  searchParams,
}: {
  searchParams: Promise<{
    quarter?: string;
    status?: string;
    frente?: string;
    member?: string;
    iceAction?: string;
    outros?: string;
    q?: string;
  }>;
}) {
  const { quarter, status, frente, member, iceAction, outros, q } = await searchParams;
  const busca = normalizarBusca(q) ?? "";
  const hideOtherQuarters = outros !== "1";

  const splitParam = (v?: string) => v?.split(",").filter(Boolean) ?? [];
  const statuses = splitParam(status);
  const frenteIds = splitParam(frente);
  const memberIds = splitParam(member);
  const iceActions = splitParam(iceAction);

  const [quarters, frentes, allMembers, currentMember] = await Promise.all([
    getQuarters(),
    getFrentes(),
    getTeamMembers(),
    getCurrentMember(),
  ]);
  const members = allMembers.filter((m) => m.isActive && m.role !== "VISITANTE");

  const activeQuarter = quarters.find((q) => q.isActive);
  
  // Se não houver quarter ativo, tenta encontrar um que englobe a data de hoje
  const now = new Date();
  const currentByDate = quarters.find(q => {
    const start = new Date(q.startDate);
    const end = new Date(q.endDate);
    return now >= start && now <= end;
  });

  const selectedQuarterId = quarter || activeQuarter?.id || currentByDate?.id || (quarters.length > 0 ? quarters[0].id : null);

  const [experimentos, okrs] = await Promise.all([
    selectedQuarterId
      ? getExperimentos({
          quarterId: selectedQuarterId,
          statuses,
          frenteIds,
          memberIds,
          iceActions,
          q: busca,
        })
      : Promise.resolve([]),
    selectedQuarterId ? getOKRsForSelect(selectedQuarterId) : Promise.resolve([]),
  ]);

  return (
    <ExperimentoTable
      quarters={quarters}
      frentes={frentes}
      members={members}
      okrs={okrs}
      experimentos={experimentos}
      selectedQuarterId={selectedQuarterId}
      currentStatuses={statuses}
      currentFrenteIds={frenteIds}
      currentMemberIds={memberIds}
      currentIceActions={iceActions}
      currentQuery={busca}
      hideOtherQuarters={hideOtherQuarters}
      userEmail={currentMember.email}
      canEdit={currentMember.role !== "VISITANTE"}
    />
  );
}
