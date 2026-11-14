import { X } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { IconButton } from "@/components/shared/IconButton";

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type TooltipIniciativa = {
  id: string;
  name: string;
  status: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  docLink: string | null;
  frente: { name: string };
  members: { name: string }[];
  okr: { objective: string } | null;
};

interface GanttTooltipProps {
  ini: TooltipIniciativa;
  onClose: () => void;
  onEdit: () => void;
}

export function GanttTooltip({ ini, onClose, onEdit }: GanttTooltipProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <Card
        className="relative pointer-events-auto m-4 z-10 space-y-3"
        padding={20}
        style={{ width: 320, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h3
            className="text-sm font-semibold leading-snug flex-1"
            style={{ color: "var(--text-primary)" }}
          >
            {ini.name}
          </h3>
          <IconButton onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X size={14} />
          </IconButton>
        </div>

        <StatusBadge status={ini.status} type="iniciativa" itemId={ini.id} />

        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Frente</dt>
            <dd className="font-medium text-right" style={{ color: "var(--text-primary)" }}>
              {ini.frente.name}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Responsável</dt>
            <dd className="font-medium text-right" style={{ color: "var(--text-primary)" }}>
              {ini.members.length > 0 ? ini.members.map((m) => m.name).join(", ") : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Início</dt>
            <dd style={{ color: "var(--text-secondary)" }}>{fmtDate(ini.startDate)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--text-muted)" }}>Fim</dt>
            <dd style={{ color: "var(--text-secondary)" }}>{fmtDate(ini.endDate)}</dd>
          </div>
          {ini.okr && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              <dt style={{ color: "var(--text-muted)" }}>OKR</dt>
              <dd className="leading-snug" style={{ color: "var(--text-secondary)" }}>
                {ini.okr.objective}
              </dd>
            </div>
          )}
          {ini.docLink && (
            <div className="flex justify-between items-center">
              <dt style={{ color: "var(--text-muted)" }}>Doc</dt>
              <dd>
                <a
                  href={ini.docLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs"
                  style={{ color: "var(--brand-primary)" }}
                >
                  Abrir link ↗
                </a>
              </dd>
            </div>
          )}
        </dl>

        <Button variant="primary" size="sm" onClick={onEdit} style={{ width: "100%" }}>
          Editar iniciativa
        </Button>
      </Card>
    </div>
  );
}
