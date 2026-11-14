import { getQuarters } from "@/actions/quarters";
import { getQuarterReport } from "@/actions/relatorios";
import { RelatorioView } from "@/components/relatorios/RelatorioView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Relatórios | Sala de Growth",
  description: "Relatório geral do quarter: resultados, entregas e performance do time.",
};

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
  const quarters = await getQuarters();

  const activeQuarter = quarters.find((q) => q.isActive);
  const now = new Date();
  const currentByDate = quarters.find((q) => {
    const start = new Date(q.startDate);
    const end = new Date(q.endDate);
    return now >= start && now <= end;
  });

  const selectedQuarterId =
    quarter || activeQuarter?.id || currentByDate?.id || quarters[0]?.id || null;

  const report = selectedQuarterId ? await getQuarterReport(selectedQuarterId) : null;

  return (
    <RelatorioView
      quarters={quarters}
      selectedQuarterId={selectedQuarterId}
      report={report}
    />
  );
}
