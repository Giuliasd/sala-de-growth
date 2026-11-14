import { getQuarters } from "@/actions/quarters";
import { getFrentes } from "@/actions/frentes";
import { getUnlinkedItems } from "@/actions/okrs";
import { getObjetivosComRelogio } from "@/actions/objetivos";
import { getTeamMembers } from "@/actions/team-members";
import { OKRList } from "@/components/okrs/OKRList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OKRs | Sala de Growth",
  description: "Objetivos e resultados-chave do time de Growth.",
};

export default async function OKRsPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;

  const [quarters, frentes, allMembers] = await Promise.all([
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

  const [objetivosComRelogio, unlinkedItems] = await Promise.all([
    selectedQuarterId
      ? getObjetivosComRelogio(selectedQuarterId)
      : Promise.resolve({ objetivos: [], nowMs: 0, podeEditar: false }),
    selectedQuarterId ? getUnlinkedItems(selectedQuarterId) : Promise.resolve({ iniciativas: [], experimentos: [] }),
  ]);

  const members = allMembers.filter((m) => m.isActive && m.role !== "VISITANTE");

  const { objetivos, nowMs, podeEditar } = objetivosComRelogio;

  return (
    <OKRList
      nowMs={nowMs}
      podeEditar={podeEditar}
      quarters={quarters}
      frentes={frentes}
      objetivos={objetivos}
      members={members}
      selectedQuarterId={selectedQuarterId}
      unlinkedItems={unlinkedItems}
    />
  );
}
