import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./KanbanCard";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { ICE_ACTION_COLORS } from "./ExperimentoCard";
import type { ExperimentoItem } from "./ExperimentoCard";
import { IceAction } from "@/generated/prisma/enums";

/** Largura fixa da coluna no board horizontal. */
export const COLUMN_W = 340;

interface KanbanColumnProps {
  iceAction: IceAction;
  title: string;
  experimentos: ExperimentoItem[];
  emptyMessage: string;
  onEdit?: (exp: ExperimentoItem) => void;
  canEdit?: boolean;
}

// Mesmo layout de coluna da aba "Experimentos ativos" em Rituais (StageColumn):
// cabeçalho com pill + contador e área de drop transparente com contorno
// tracejado ao passar por cima. A pill usa a cor da ação ICE. Diferente de lá,
// a coluna tem largura fixa: o board rola na horizontal em vez de quebrar em
// grade, para as quatro etapas ficarem lado a lado como num kanban.
function KanbanColumnComponent({
  iceAction,
  title,
  experimentos,
  emptyMessage,
  onEdit,
  canEdit = true,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: iceAction });
  const colors = ICE_ACTION_COLORS[iceAction];

  return (
    <div className="flex flex-col gap-3 shrink-0" style={{ width: COLUMN_W }}>
      {/* Cabeçalho da coluna */}
      <div className="flex items-center justify-between gap-2">
        <Badge bg={colors.bg} color={colors.text}>
          {title}
        </Badge>
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {experimentos.length}
        </span>
      </div>

      {/* Área de drop */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-2.5 rounded-xl u-transition"
        style={{
          minHeight: 120,
          padding: 4,
          background: isOver ? "var(--accent-subtle)" : "transparent",
          outline: isOver ? "1px dashed var(--accent)" : "1px solid transparent",
        }}
      >
        {experimentos.length === 0 ? (
          <Card padding="16px" className="flex items-center justify-center">
            <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
              {emptyMessage}
            </p>
          </Card>
        ) : (
          experimentos.map((exp) => (
            <KanbanCard key={exp.id} experimento={exp} onEdit={onEdit} canEdit={canEdit} />
          ))
        )}
      </div>
    </div>
  );
}

export const KanbanColumn = memo(KanbanColumnComponent);
