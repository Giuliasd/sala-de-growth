"use client";

import { useState } from "react";
import { useEstadoDaProp } from "@/hooks/useEstadoDaProp";
import { AlertTriangle, ArrowUp, Minus, ArrowDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/shared/Badge";
import { TagSelect } from "@/components/shared/TagSelect";
import { toast } from "@/components/shared/Toast";
import { updateIniciativaPriority } from "@/actions/iniciativas";
import { Priority } from "@/generated/prisma/enums";

export type PriorityType = "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";

interface PriorityConfig {
  label: string;
  bg: string;
  color: string;
  borderColor: string;
  icon: LucideIcon;
}

const PRIORITY_CONFIG: Record<PriorityType, PriorityConfig> = {
  URGENTE: { label: "Urgente", bg: "var(--peach-soft)",  color: "var(--peach-strong)",  borderColor: "var(--peach)",  icon: AlertTriangle },
  ALTA:    { label: "Alta",    bg: "var(--butter-soft)", color: "var(--butter-strong)", borderColor: "var(--butter)", icon: ArrowUp },
  MEDIA:   { label: "Média",   bg: "var(--sky-soft)",    color: "var(--sky-strong)",    borderColor: "var(--sky)",    icon: Minus },
  BAIXA:   { label: "Baixa",   bg: "var(--color-cream)", color: "var(--color-ink-soft)", borderColor: "var(--color-line)", icon: ArrowDown },
};

interface PriorityBadgeProps {
  priority: PriorityType | string;
  /** Se presente, o badge vira editável — clique abre o seletor (TagSelect). */
  itemId?: string;
}

export function PriorityBadge({ priority, itemId }: PriorityBadgeProps) {
  const normalize = (p: string) => (p?.toUpperCase() || "MEDIA") as PriorityType;
  const [current, setCurrent] = useEstadoDaProp(normalize(priority));
  const [loading, setLoading] = useState(false);

  const config = PRIORITY_CONFIG[current] || PRIORITY_CONFIG.MEDIA;

  const badge = (
    <Badge
      bg={config.bg}
      color={config.color}
      borderColor={config.borderColor}
      icon={config.icon}
      className={itemId ? "u-transition cursor-pointer hover:brightness-95" : ""}
    >
      {config.label}
    </Badge>
  );

  if (!itemId) return badge;

  async function handleChange(next: string) {
    setCurrent(next as PriorityType);
    setLoading(true);
    try {
      const res = await updateIniciativaPriority(itemId!, next as Priority);
      // Reverter sem avisar deixava a pessoa sem saber por que o valor voltou.
      if (res && !res.success) {
        setCurrent(normalize(priority));
        toast(res.error || "Erro ao atualizar a prioridade.", "error");
      }
    } catch (error) {
      console.error("Failed to update priority", error);
      setCurrent(normalize(priority));
      toast("Não foi possível atualizar a prioridade. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className={`inline-flex ${loading ? "opacity-50" : ""}`}>
      <TagSelect value={current} options={PRIORITY_OPTIONS} onChange={handleChange} disabled={loading} title="Alterar prioridade" undoLabel="prioridade">
        {badge}
      </TagSelect>
    </span>
  );
}

export const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "URGENTE", label: "Urgente" },
  { value: "ALTA", label: "Alta" },
  { value: "MEDIA", label: "Média" },
  { value: "BAIXA", label: "Baixa" },
];
