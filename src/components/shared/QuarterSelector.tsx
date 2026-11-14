"use client";

import { useRouter } from "next/navigation";
import { Dropdown } from "./Dropdown";

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };

interface QuarterSelectorProps {
  quarters: QuarterItem[];
  selectedQuarterId: string;
  /** Rota para onde a troca de quarter navega. */
  basePath?: string;
  /** Query params preservados na navegação (ex.: a aba atual dos Rituais). */
  params?: Record<string, string>;
}

export function QuarterSelector({
  quarters,
  selectedQuarterId,
  basePath = "/dashboard",
  params,
}: QuarterSelectorProps) {
  const router = useRouter();

  function handleChange(quarterId: string) {
    const search = new URLSearchParams({ ...params, quarter: quarterId });
    router.push(`${basePath}?${search.toString()}`);
  }

  return (
    <Dropdown
      value={selectedQuarterId}
      onChange={handleChange}
      title="Quarter"
      options={quarters.map((q) => ({
        value: q.id,
        label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
      }))}
    />
  );
}

/**
 * O mesmo seletor, sem navegação: para telas que controlam o quarter no
 * estado/URL própria (Gantt, roadmap, OKRs). Usar este em vez de montar um
 * `<select>` local é o que mantém todos os seletores de quarter iguais.
 */
export function QuarterDropdown({
  quarters,
  value,
  onChange,
  placeholder = "Selecione um quarter",
}: {
  quarters: QuarterItem[];
  value: string;
  onChange: (quarterId: string) => void;
  placeholder?: string;
}) {
  return (
    <Dropdown
      value={value}
      onChange={onChange}
      title="Quarter"
      placeholder={placeholder}
      options={quarters.map((q) => ({
        value: q.id,
        label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
      }))}
    />
  );
}
