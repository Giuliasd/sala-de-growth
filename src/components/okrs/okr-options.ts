import type { DropdownOption } from "@/components/shared/Dropdown";

// Opções dos dropdowns de KR. Ficam aqui porque o formulário de criação
// (OKRForm) e a edição inline no card (OKRCard) ofereciam a mesma lista escrita
// duas vezes — e uma unidade nova entrava só num dos dois.

export const UNIT_OPTIONS: DropdownOption[] = [
  { value: "UNIDADE", label: "Unidade (un)" },
  { value: "REAL", label: "Real (R$)" },
  { value: "PORCENTAGEM", label: "Porcentagem (%)" },
];

export const MEASUREMENT_OPTIONS: DropdownOption[] = [
  { value: "ACUMULADO", label: "Acumulada" },
  { value: "MEDIA_MENSAL", label: "Média mensal" },
];
