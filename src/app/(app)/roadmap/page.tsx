import type { Metadata } from "next";
import { getQuarters } from "@/actions/quarters";
import { getFrentes } from "@/actions/frentes";
import { getTeamMembers } from "@/actions/team-members";
import { getRoadmapIniciativas } from "@/actions/iniciativas";
import { getRoadmapExperimentos } from "@/actions/experimentos";
import { getAusenciasByQuarter } from "@/actions/ausencias";
import { getOKRsForSelect } from "@/actions/okrs";
import { RoadmapView } from "@/components/roadmap/RoadmapView";

export const metadata: Metadata = {
  title: "Roadmap | Sala de Growth",
  description: "Visão unificada de iniciativas e experimentos por responsável.",
};

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; frente?: string; type?: string; outros?: string }>;
}) {
  const { quarter, frente, type, outros } = await searchParams;

  const [quarters, frentes, members] = await Promise.all([
    getQuarters(),
    getFrentes(),
    getTeamMembers(),
  ]);

  const activeQuarter = quarters.find((q) => q.isActive);
  
  // Se não houver quarter ativo, tenta encontrar um que englobe a data de hoje
  const now = new Date();
  const currentByDate = quarters.find(q => {
    const start = new Date(q.startDate);
    const end = new Date(q.endDate);
    return now >= start && now <= end;
  });

  const selectedQuarterId = quarter || activeQuarter?.id || currentByDate?.id || (quarters.length > 0 ? quarters[0].id : null);

  const [iniciativas, experimentos, ausencias, okrs] = await Promise.all([
    selectedQuarterId
      ? getRoadmapIniciativas({ quarterId: selectedQuarterId, frenteIds: frente ? [frente] : [] })
      : Promise.resolve([]),
    selectedQuarterId
      ? getRoadmapExperimentos({ quarterId: selectedQuarterId, frenteIds: frente ? [frente] : [] })
      : Promise.resolve([]),
    selectedQuarterId ? getAusenciasByQuarter(selectedQuarterId) : Promise.resolve([]),
    selectedQuarterId
      ? getOKRsForSelect(selectedQuarterId)
      : Promise.resolve([]),
  ]);

  return (
    <RoadmapView
      quarters={quarters}
      frentes={frentes}
      members={members}
      iniciativas={iniciativas}
      experimentos={experimentos}
      ausencias={ausencias}
      okrs={okrs}
      selectedQuarterId={selectedQuarterId}
      currentFrenteId={frente ?? ""}
      currentType={(type as "all" | "iniciativas" | "experimentos") ?? "all"}
      hideOtherQuarters={outros !== "1"}
    />
  );
}
