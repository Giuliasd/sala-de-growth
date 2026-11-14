"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";

type SortableColumnHeaderProps = {
  colKey: string;
  label: string;
  sortKey?: string;
  width: number;
  currentSortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  onResizeStart: (e: React.MouseEvent, colKey: string) => void;
  resizingColKey?: string | null;
};

/**
 * Indicador de ordenação da coluna: ↕ inerte, ↑/↓ na cor da marca quando a
 * coluna manda na ordem.
 *
 * Exportado porque a lista de checkpoints (CheckpointSection) tem cabeçalho
 * próprio — é flexbox, não <table>, então não dá para reusar o <th> daqui —
 * e o ícone precisa ser o mesmo nas duas, senão as duas ordenações passam a
 * parecer recursos diferentes.
 */
export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className="ml-0.5" style={{ color: active ? "var(--brand-primary)" : "var(--border-default)" }}>
      {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );
}

export function SortableColumnHeader({
  colKey,
  label,
  sortKey,
  width,
  currentSortKey,
  sortDir = "asc",
  onSort,
  onResizeStart,
  resizingColKey,
}: SortableColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey,
  });

  const isThisResizing = resizingColKey === colKey;

  return (
    <th
      ref={setNodeRef}
      className="text-left px-4 py-3 select-none"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
        cursor: "default",
        background: isDragging ? "var(--bg-surface)" : undefined,
        boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        {/* Drag grip — only this triggers DnD */}
        <span
          {...listeners}
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            opacity: 0.35,
            display: "inline-flex",
            alignItems: "center",
            flexShrink: 0,
          }}
          data-tooltip="Arrastar para reordenar"
          onClickCapture={(e) => e.stopPropagation()}
        >
          <GripHorizontal size={11} />
        </span>

        {/* Label / sort button */}
        {sortKey && onSort ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSort(sortKey); }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              fontSize: "inherit",
              fontWeight: "inherit",
              color: "inherit",
              textTransform: "uppercase",
              letterSpacing: "inherit",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
            <SortIcon active={currentSortKey === sortKey} dir={sortDir} />
          </button>
        ) : (
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </span>
        )}
      </div>

      {/* Resize handle — thin strip on the right edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 8,
          cursor: "col-resize",
          userSelect: "none",
          zIndex: 2,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "flex-end",
          pointerEvents: isDragging ? "none" : "auto",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onResizeStart(e, colKey);
        }}
      >
        <div
          style={{
            width: 2,
            background: isThisResizing ? "var(--brand-primary)" : "var(--border-subtle)",
            opacity: isThisResizing ? 1 : 0,
            transition: "opacity 0.15s",
          }}
          className="group-hover:opacity-100"
        />
      </div>
    </th>
  );
}
