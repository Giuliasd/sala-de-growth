import { Table2, LayoutGrid, BarChart2 } from "lucide-react";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";

export type ViewMode = "lista" | "kanban" | "analise";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

const ITEMS = [
  { value: "lista", label: "Tabela", icon: Table2 },
  { value: "kanban", label: "Kanban", icon: LayoutGrid },
  { value: "analise", label: "Análise", icon: BarChart2 },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <SegmentedToggle
      items={ITEMS}
      value={value}
      onChange={(v) => onChange(v as ViewMode)}
      ariaLabel="Modo de visualização"
    />
  );
}
