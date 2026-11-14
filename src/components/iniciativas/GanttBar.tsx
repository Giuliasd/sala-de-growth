"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, AlertTriangle, ArrowUp, Minus, ArrowDown } from "lucide-react";
import { PriorityType } from "@/components/shared/PriorityBadge";
import { getStatusMeta, familyBarClasses, familyStrong } from "@/lib/statusConfig";

const HANDLE_W = 6; // px — resize handle width

// Aparência derivada da fonte única statusConfig.
function getIniciativaStyles(status: string) {
  const m = getStatusMeta("iniciativa", status);
  return familyBarClasses(m.family) + (m.faded ? " opacity-70" : "");
}

function getStatusTextColor(status: string) {
  return familyStrong(getStatusMeta("iniciativa", status).family);
}

const PRIORITY_ICONS = {
  URGENTE: { icon: AlertTriangle, color: "var(--peach)" },
  ALTA: { icon: ArrowUp, color: "var(--status-progress-text)" },
  MEDIA: { icon: Minus, color: "var(--status-review-text)" },
  BAIXA: { icon: ArrowDown, color: "var(--text-muted)" },
};

interface GanttBarProps {
  id: string;
  name: string;
  status: string;
  priority?: string;
  leftPx: number;
  widthPx: number;
  rowHeight: number;
  isLive: boolean; // currently being dragged
  isForeignQuarter?: boolean;
  onDragStart: (e: React.MouseEvent, type: "move" | "left" | "right") => void;
  onClick: () => void; // Currently opens tooltip
}

export function GanttBar({
  id,
  name,
  status,
  priority,
  leftPx,
  widthPx,
  rowHeight,
  isLive,
  isForeignQuarter,
  onDragStart,
  onClick,
}: GanttBarProps) {
  const router = useRouter();
  const mouseDownPos = useRef<{ x: number, y: number } | null>(null);
  
  const statusClasses = getIniciativaStyles(status);
  const textColor = getStatusTextColor(status);
  const barH = rowHeight - 12; // vertical padding
  const topPx = 6;

  const normalizedPriority = priority?.toUpperCase() as PriorityType;
  const PriorityIcon = priority ? PRIORITY_ICONS[normalizedPriority]?.icon : undefined;
  const priorityColor = priority ? PRIORITY_ICONS[normalizedPriority]?.color : undefined;
  const showPriority = widthPx > 100 && PriorityIcon;

  return (
    <div
      className={`absolute flex items-center rounded select-none transition-all ${statusClasses} cursor-pointer hover:brightness-95`}
      style={{
        left: leftPx,
        width: Math.max(widthPx, HANDLE_W * 2 + 4),
        top: topPx,
        height: barH,
        opacity: isLive ? 0.8 : 0.95,
        zIndex: isLive ? 20 : 10,
        boxShadow: isLive ? "0 4px 12px rgba(0,0,0,0.15), 0 0 0 2px rgba(255,255,255,0.4)" : undefined,
        border: isForeignQuarter ? "1px dashed rgba(0,0,0,0.2)" : undefined,
        color: textColor,
      }}
      onMouseDown={(e) => {
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        
        // Middle area → move
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        if (relX < HANDLE_W) {
          onDragStart(e, "left");
        } else if (relX > rect.width - HANDLE_W) {
          onDragStart(e, "right");
        } else {
          onDragStart(e, "move");
        }
      }}
      onMouseUp={(e) => {
        if (!mouseDownPos.current) return;
        const deltaX = Math.abs(e.clientX - mouseDownPos.current.x);
        const deltaY = Math.abs(e.clientY - mouseDownPos.current.y);
        
        // If moved less than 5px, it's a click
        if (deltaX < 5 && deltaY < 5) {
          router.push(`/iniciativas/${id}`);
        }
        mouseDownPos.current = null;
      }}
      onMouseEnter={() => {
        // Option B from prompt: open tooltip on hover
        onClick();
      }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        style={{ width: HANDLE_W, cursor: "ew-resize" }}
        onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, "left"); }}
      >
        <div className="w-0.5 h-4 rounded" style={{ background: "rgba(0,0,0,0.1)" }} />
      </div>

      {/* Label */}
      <div 
        className="flex items-center gap-1.5 flex-1 overflow-hidden pointer-events-none"
        style={{ paddingLeft: HANDLE_W + 4, paddingRight: HANDLE_W + 4 }}
      >
        {isForeignQuarter && (
          <span className="text-[10px] shrink-0 opacity-70">
            ↻
          </span>
        )}
        
        {showPriority && PriorityIcon && (
          <PriorityIcon size={12} strokeWidth={2} style={{ color: priorityColor, flexShrink: 0 }} />
        )}

        <ClipboardList size={14} strokeWidth={2} className="shrink-0" />
        <span className="text-xs font-medium truncate">
          {name}
        </span>
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        style={{ width: HANDLE_W, cursor: "ew-resize" }}
        onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, "right"); }}
      >
        <div className="w-0.5 h-4 rounded" style={{ background: "rgba(0,0,0,0.1)" }} />
      </div>
    </div>
  );
}
