"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { QuarterDropdown } from "@/components/shared/QuarterSelector";

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };

/**
 * Filtros de /ausencias no mesmo desenho das outras listas: dropdowns
 * encostados à direita, numa linha só. Eram pills — uma por quarter e uma por
 * pessoa —, e com o time inteiro a barra quebrava em duas linhas.
 *
 * Client component porque a página é server: a troca de filtro navega, e é o
 * router que preserva os outros params da URL.
 */
export function AusenciasFilters({
  quarters,
  selectedQuarterId,
  showQuarter,
  members,
  memberFilter,
}: {
  quarters: QuarterItem[];
  selectedQuarterId: string;
  /** O seletor de quarter só faz sentido no período "quarter". */
  showQuarter: boolean;
  members: { id: string; name: string }[];
  memberFilter: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navegar(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.push(`/ausencias${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center justify-end">
      {showQuarter && quarters.length > 0 && (
        <QuarterDropdown
          quarters={quarters}
          value={selectedQuarterId}
          onChange={(id) => navegar({ quarter: id })}
        />
      )}

      {members.length > 0 && (
        <MultiSelect
          single
          label="Membro"
          selected={memberFilter ? [memberFilter] : []}
          onChange={(next) => navegar({ member: next[0] })}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
      )}
    </div>
  );
}
