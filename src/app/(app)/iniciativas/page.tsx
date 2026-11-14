import { getQuarters } from "@/actions/quarters";
import { getFrentes } from "@/actions/frentes";
import { getTeamMembers } from "@/actions/team-members";
import { getIniciativas } from "@/actions/iniciativas";
import { getOKRsForSelect } from "@/actions/okrs";
import { getAusenciasByQuarter } from "@/actions/ausencias";
import { getCurrentMember } from "@/lib/session";
import { IniciativaTable } from "@/components/iniciativas/IniciativaTable";
import { GanttChart } from "@/components/iniciativas/GanttChart";
import type { Metadata } from "next";
import { normalizarBusca } from "@/lib/busca";

export const metadata: Metadata = {
  title: "Iniciativas | Sala de Growth",
  description: "Gerencie as iniciativas do time de Growth.",
};

export default async function IniciativasPage({
  searchParams,
}: {
  searchParams: Promise<{
    quarter?: string;
    status?: string;
    priority?: string;
    frente?: string;
    member?: string;
    view?: string;
    outros?: string;
    q?: string;
  }>;
}) {
  const { quarter, status, priority, frente, member, view, outros, q } = await searchParams;
  const busca = normalizarBusca(q) ?? "";
  const isGantt = view === "gantt";
  const hideOtherQuarters = outros !== "1";

  const splitParam = (v?: string) => v?.split(",").filter(Boolean) ?? [];
  const statuses = splitParam(status);
  const priorities = splitParam(priority);
  const frenteIds = splitParam(frente);
  const memberIds = splitParam(member);

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

  const [iniciativas, okrs, ausencias] = await Promise.all([
    selectedQuarterId
      ? getIniciativas({
          quarterId: selectedQuarterId,
          statuses,
          priorities,
          frenteIds,
          memberIds,
          q: busca,
        })
      : Promise.resolve([]),
    selectedQuarterId ? getOKRsForSelect(selectedQuarterId) : Promise.resolve([]),
    selectedQuarterId && isGantt
      ? getAusenciasByQuarter(selectedQuarterId)
      : Promise.resolve([]),
  ]);

  const filteredIniciativas = iniciativas;

  if (isGantt) {
    return (
      <GanttChart
        quarters={quarters}
        frentes={frentes}
        members={members}
        iniciativas={filteredIniciativas}
        ausencias={ausencias}
        selectedQuarterId={selectedQuarterId}
        currentFrenteIds={frenteIds}
        currentMemberIds={memberIds}
        currentPriorities={priorities}
        currentView="gantt"
      />
    );
  }

  return (
    <IniciativaTable
      quarters={quarters}
      frentes={frentes}
      members={members}
      okrs={okrs}
      iniciativas={filteredIniciativas}
      selectedQuarterId={selectedQuarterId}
      currentStatuses={statuses}
      currentFrenteIds={frenteIds}
      currentMemberIds={memberIds}
      currentPriorities={priorities}
      currentView="table"
      currentQuery={busca}
      hideOtherQuarters={hideOtherQuarters}
      userEmail={currentMember.email}
    />
  );
}
