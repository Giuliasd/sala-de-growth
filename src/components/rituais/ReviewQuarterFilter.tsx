"use client";

import { useRouter } from "next/navigation";
import { MultiSelect } from "@/components/shared/MultiSelect";

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };

/**
 * Filtro de quarter da Review semanal, no gatilho compacto das barras de
 * filtro — o mesmo que a Weekly usa, para as duas abas não terem desenhos
 * diferentes para a mesma coisa.
 */
export function ReviewQuarterFilter({
  quarters,
  selectedQuarterId,
}: {
  quarters: QuarterItem[];
  selectedQuarterId: string;
}) {
  const router = useRouter();

  return (
    <MultiSelect
      single
      label="Quarter"
      selected={selectedQuarterId ? [selectedQuarterId] : []}
      onChange={(next) => {
        const search = new URLSearchParams({ view: "experimentos" });
        if (next[0]) search.set("quarter", next[0]);
        router.push(`/rituais?${search.toString()}`);
      }}
      options={quarters.map((q) => ({
        value: q.id,
        label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
      }))}
    />
  );
}
