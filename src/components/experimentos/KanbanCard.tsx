"use client";

import { memo } from "react";
import { Pencil, Target } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { IconButton } from "@/components/shared/IconButton";
import { ActivityItemCard, ActivityStatusPill } from "@/components/shared/ActivityItemCard";
import {
  useCursorTooltip,
  CursorTooltip,
  TooltipTitle,
  TooltipLine,
} from "@/components/shared/CursorTooltip";
import type { ExperimentoItem } from "./ExperimentoCard";

interface KanbanCardProps {
  experimento: ExperimentoItem;
  onEdit?: (exp: ExperimentoItem) => void;
  /** Sem permissão de edição não se arrasta nem se edita — só se lê. */
  canEdit?: boolean;
  /** Cópia sob o cursor no DragOverlay: sem drag próprio, sem botão. */
  isOverlay?: boolean;
}

/** O que o tooltip do card tem a dizer (ICE detalhado ou o OKR vinculado). */
type CardTip = { titulo: string; linhas: string[] };

// Mesmo card da aba "Experimentos ativos" em Rituais (ActivityItemCard), com
// uma diferença: aqui a coluna comunica a AÇÃO ICE, não a etapa — então o
// status continua no card. Ele desceu para o corpo porque, no cabeçalho, a
// pill espremia o nome até sobrar "Reordenar navegação par…".
function KanbanCardComponent({ experimento, onEdit, canEdit = true, isOverlay = false }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: experimento.id,
    disabled: !canEdit || isOverlay,
  });
  const tip = useCursorTooltip<CardTip>();

  const iceTip: CardTip = {
    titulo: `ICE ${experimento.iceScore.toFixed(1)}`,
    linhas: [
      `Impacto ${experimento.impactScore}`,
      `Confiança ${experimento.confidenceScore}`,
      `Esforço ${experimento.effortScore}`,
    ],
  };

  return (
    <div
      ref={setNodeRef}
      {...(isOverlay ? {} : listeners)}
      {...(isOverlay ? {} : attributes)}
      style={{
        transform: isOverlay ? undefined : CSS.Translate.toString(transform),
        // No overlay o card viaja sob o cursor; o original fica esmaecido no
        // lugar, marcando de onde ele saiu.
        opacity: isDragging ? 0.4 : 1,
        touchAction: canEdit ? "none" : undefined,
        cursor: isOverlay ? "grabbing" : canEdit ? "grab" : "default",
        boxShadow: isOverlay ? "var(--shadow-lg)" : undefined,
        borderRadius: isOverlay ? "var(--radius-md)" : undefined,
      }}
      className="group"
    >
      <ActivityItemCard
        kind="experimento"
        name={experimento.name}
        // No board o nome é o que identifica o card: quebra em quantas linhas
        // precisar em vez de truncar.
        wrapName
        members={experimento.members}
        href={`/experimentos/${experimento.id}`}
        trailing={
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && canEdit && !isOverlay && (
              <IconButton
                boxSize={24}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(experimento);
                }}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                title="Editar experimento"
                aria-label="Editar experimento"
              >
                <Pencil size={14} />
              </IconButton>
            )}
            <span
              className="text-xs font-mono font-semibold tabular-nums"
              style={{ color: "var(--text-muted)" }}
              aria-label={`ICE ${experimento.iceScore.toFixed(1)}`}
              {...tip.bind(iceTip)}
            >
              {experimento.iceScore.toFixed(1)}
            </span>
          </div>
        }
      >
        {/* Uma linha de contexto: status + frente + OKR (ícone, detalhe no
            tooltip) — antes eram três linhas e cabiam 4 cards por coluna. */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <ActivityStatusPill type="experimento" status={experimento.status} />
            {experimento.frente && (
              <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {experimento.frente.name}
              </span>
            )}
            {experimento.members.length === 0 && (
              <span className="text-xs italic shrink-0" style={{ color: "var(--text-muted)" }}>
                · sem responsável
              </span>
            )}
            {experimento.okr && (
              <span
                className="shrink-0 ml-auto inline-flex"
                {...tip.bind({ titulo: "OKR vinculado", linhas: [experimento.okr.objective] })}
              >
                <Target size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              </span>
            )}
          </div>

          <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            I {experimento.impactScore} · C {experimento.confidenceScore} · E{" "}
            {experimento.effortScore}
          </span>
        </div>
      </ActivityItemCard>

      {tip.tip && (
        <CursorTooltip x={tip.tip.x} y={tip.tip.y}>
          <TooltipTitle>{tip.tip.data.titulo}</TooltipTitle>
          {tip.tip.data.linhas.map((linha) => (
            <TooltipLine key={linha}>{linha}</TooltipLine>
          ))}
        </CursorTooltip>
      )}
    </div>
  );
}

export const KanbanCard = memo(KanbanCardComponent);
