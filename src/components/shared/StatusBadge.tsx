"use client";

import { Palmtree, HeartPulse, Baby, CalendarDays, Coffee } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useEstadoDaProp } from "@/hooks/useEstadoDaProp";
import { updateIniciativaStatus } from "@/actions/iniciativas";
import { updateExperimentoStatus } from "@/actions/experimentos";
import { IniciativaStatus, ExperimentoStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/shared/Badge";
import { TagSelect } from "@/components/shared/TagSelect";
import { toast } from "@/components/shared/Toast";
import {
  getStatusMeta,
  familyBg,
  familyBorder,
  familyStrong,
  INICIATIVA_STATUSES,
  EXPERIMENTO_STATUSES,
} from "@/lib/statusConfig";

interface StatusConfig {
  label: string;
  bg: string;
  color: string;
  borderColor: string;
  icon?: LucideIcon;
  faded?: boolean;
}

// Paleta neutra (outros) — via tokens.
const NEUTRAL = {
  bg: "var(--color-cream)",
  color: "var(--color-ink-soft)",
  borderColor: "var(--color-line)",
};

// Ausência tem cores próprias (o "status" aqui é o tipo da ausência).
const AUSENCIA_CONFIG: Record<string, StatusConfig> = {
  FERIAS:              { label: "Férias",      bg: "var(--sky-soft)",   color: "var(--sky-strong)",   borderColor: "var(--sky)",   icon: Palmtree },
  LICENCA_MEDICA:      { label: "Lic. Médica", bg: "var(--blush-soft)", color: "var(--blush-strong)", borderColor: "var(--blush)", icon: HeartPulse },
  LICENCA_MATERNIDADE: { label: "Maternidade", bg: "var(--blush-soft)", color: "var(--blush-strong)", borderColor: "var(--blush)", icon: Baby },
  DAY_OFF:             { label: "Day Off",     bg: "var(--peach-soft)", color: "var(--peach-strong)", borderColor: "var(--peach)", icon: Coffee },
  OUTROS:              { label: "Outros",      ...NEUTRAL, icon: CalendarDays },
};

// Iniciativa/experimento derivam da fonte única (statusConfig).
function getConfig(
  status: string,
  type?: "iniciativa" | "experimento" | "ausencia"
): StatusConfig {
  if (type === "ausencia") {
    return AUSENCIA_CONFIG[status] ?? { label: status, ...NEUTRAL };
  }
  if (type === "iniciativa" || type === "experimento") {
    const m = getStatusMeta(type, status);
    return {
      label: m.label,
      bg: familyBg(m.family),
      color: familyStrong(m.family),
      borderColor: familyBorder(m.family),
      icon: m.icon,
      faded: m.faded,
    };
  }
  return { label: status, ...NEUTRAL };
}

interface StatusBadgeProps {
  status: string;
  type?: "iniciativa" | "experimento" | "ausencia";
  showIcon?: boolean;
  itemId?: string; // If provided, badge is interactive
}

export function StatusBadge({ status, type, showIcon = true, itemId }: StatusBadgeProps) {
  const [currentStatus, setCurrentStatus] = useEstadoDaProp(status);
  const [isLoading, setIsLoading] = useState(false);

  const config = getConfig(currentStatus, type);
  const isInteractive = !!itemId && (type === "iniciativa" || type === "experimento");

  const handleChange = async (newStatus: string) => {
    setCurrentStatus(newStatus);
    setIsLoading(true);

    try {
      const res =
        type === "iniciativa"
          ? await updateIniciativaStatus(itemId!, newStatus as IniciativaStatus)
          : await updateExperimentoStatus(itemId!, newStatus as ExperimentoStatus);
      // As actions devolvem `{ success: false }` em vez de lançar: sem olhar o
      // resultado, a falha deixava o status novo na tela e o antigo no banco.
      if (!res.success) {
        setCurrentStatus(status);
        toast(res.error || "Erro ao atualizar o status.", "error");
      }
    } catch (error) {
      console.error("Failed to update status", error);
      setCurrentStatus(status); // Revert on failure
      toast("Não foi possível atualizar o status. Tente novamente.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const statuses =
    type === "iniciativa" ? INICIATIVA_STATUSES : type === "experimento" ? EXPERIMENTO_STATUSES : [];
  const options = statuses.map((opt) => ({ value: opt, label: getConfig(opt, type).label }));

  const badge = (
    <Badge
      bg={config.bg}
      color={config.color}
      borderColor={config.borderColor}
      icon={showIcon ? config.icon : undefined}
      className={isInteractive ? "u-transition cursor-pointer hover:brightness-95" : ""}
      style={config.faded ? { opacity: 0.7 } : undefined}
    >
      {config.label}
    </Badge>
  );

  if (!isInteractive) return badge;

  return (
    <span className={`inline-flex ${isLoading ? "opacity-50" : ""}`}>
      <TagSelect
        value={currentStatus}
        options={options}
        onChange={handleChange}
        disabled={isLoading}
        title="Alterar status"
        undoLabel="status"
      >
        {badge}
      </TagSelect>
    </span>
  );
}

// Deriva da fonte única (statusConfig) — adicionar/remover status é feito lá.
export const STATUS_OPTIONS = INICIATIVA_STATUSES.map((value) => ({
  value,
  label: getStatusMeta("iniciativa", value).label,
}));
