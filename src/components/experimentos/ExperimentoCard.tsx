"use client";

import { useState } from "react";
import { Pencil, Trash2, ChevronDown, ChevronUp, ExternalLink, Calendar } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ICEBadge } from "@/components/shared/ICEBadge";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { IconButton } from "@/components/shared/IconButton";
import { getStatusAccentColor } from "@/lib/statusColors";

export type ExperimentoItem = {
  id: string;
  name: string;
  description: string;
  objective: string;
  status: string;
  frenteId: string;
  okrId: string | null;
  impactScore: number;
  confidenceScore: number;
  effortScore: number;
  iceScore: number;
  iceAction: string;
  docLink: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  launchDate: Date | string | null;
  analysisDate: Date | string | null;
  resultado: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  quarterId: string;
  frente: { id: string; name: string };
  members: { id: string; name: string }[];
  okr: { id: string; objective: string } | null;
  quarter: { id: string; year: number; quarter: number };
  _count?: { checkpoints: number; comments: number };
};

export const ICE_ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  EXECUTAR_AGORA: { bg: "var(--status-done-bg)", text: "var(--status-done-text)" },
  EM_SEGUIDA: { bg: "var(--status-review-bg)", text: "var(--status-review-text)" },
  BACKLOG: { bg: "var(--status-progress-bg)", text: "var(--status-progress-text)" },
  ARQUIVAR: { bg: "var(--status-cancelled-bg)", text: "var(--status-cancelled-text)" },
};

export const ICE_ACTION_LABELS: Record<string, string> = {
  EXECUTAR_AGORA: "Executar Agora",
  EM_SEGUIDA: "Em Seguida",
  BACKLOG: "Backlog",
  ARQUIVAR: "Arquivar",
};

function formatDate(date: Date | string): string {
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

interface ExperimentoCardProps {
  exp: ExperimentoItem;
  currentQuarterId?: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function ExperimentoCard({ exp, currentQuarterId, onEdit, onDelete }: ExperimentoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = ICE_ACTION_COLORS[exp.iceAction] ?? ICE_ACTION_COLORS.BACKLOG;
  const actionLabel = ICE_ACTION_LABELS[exp.iceAction] ?? exp.iceAction;

  return (
    <Card
      interactive
      padding={24}
      style={{ borderLeft: `4px solid ${getStatusAccentColor("experimento", exp.status)}` }}
    >
      {/* ── Row 1: Badges + actions (full width) ────── */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={exp.status} type="experimento" itemId={exp.id} />
          <ICEBadge action={exp.iceAction} />
          {currentQuarterId && exp.quarterId !== currentQuarterId && (
            <Badge
              bg="var(--bg-app)"
              color="var(--text-muted)"
              borderColor="var(--border-subtle)"
              style={{ fontSize: 10 }}
              title="Vindo de outro quarter"
            >
              <span style={{ fontSize: "10px", lineHeight: 1 }}>↻</span> Q{exp.quarter?.quarter} {exp.quarter?.year}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton boxSize={32} onClick={onEdit} title="Editar" aria-label="Editar">
            <Pencil size={14} />
          </IconButton>
          <IconButton boxSize={32} onClick={onDelete} title="Excluir" aria-label="Excluir" className="icon-btn--danger">
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* ── Row 2: Two columns ──────────────────────── */}
      <div className="flex gap-5 items-start">

        {/* ── Left column ─────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Nome */}
          <Link href={`/experimentos/${exp.id}`}>
            <h3
              className="text-lg font-semibold leading-snug mb-2 hover:text-forest transition-colors cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              {exp.name}
            </h3>
          </Link>

          {/* Descrição */}
          <div className="mb-2">
            <p
              className={`text-sm leading-relaxed break-words ${expanded ? "" : "line-clamp-2"}`}
              style={{ color: "var(--text-secondary)", overflowWrap: "anywhere" }}
            >
              {exp.description}
            </p>
            {exp.description.length > 120 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 mt-0.5 text-xs"
                style={{ background: "none", border: "none", color: "var(--brand-primary)", cursor: "pointer", padding: 0 }}
              >
                {expanded ? <><ChevronUp size={12} /> ver menos</> : <><ChevronDown size={12} /> ver mais</>}
              </button>
            )}
          </div>

          {/* Objetivo */}
          <p
            className="text-xs leading-snug mb-3 break-words"
            style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}
          >
            <span style={{ fontWeight: 500 }}>Objetivo:</span> {exp.objective}
          </p>

          {/* Doc link */}
          {exp.docLink && (
            <div className="mb-3">
              <a
                href={exp.docLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium"
                style={{ color: "var(--brand-primary)" }}
              >
                <ExternalLink size={12} />
                Ver documentação
              </a>
            </div>
          )}

          {/* Separator */}
          <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0 12px" }} />

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Frente pill */}
            <Badge bg="var(--bg-app)" color="var(--text-secondary)" borderColor="var(--border-subtle)" className="shrink-0">
              {exp.frente.name}
            </Badge>

            {/* Avatar + nome de cada responsável — o card tem largura para a
                lista inteira, então não trunca em "+N". */}
            {exp.members.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 shrink-0">
                <Avatar name={m.name} size={20} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {m.name.split(" ")[0]}
                </span>
              </div>
            ))}

            {/* OKR */}
            {exp.okr && (
              <span
                className="text-xs min-w-0 truncate"
                style={{ color: "var(--text-muted)", maxWidth: 180 }}
                data-tooltip={exp.okr.objective}
              >
                OKR: {exp.okr.objective.length > 40
                  ? exp.okr.objective.substring(0, 40) + "…"
                  : exp.okr.objective}
              </span>
            )}

            {/* Datas */}
            {(exp.startDate || exp.endDate) && (
              <div className="flex items-center gap-1 shrink-0">
                <Calendar size={11} style={{ color: "var(--text-muted)" }} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {exp.startDate ? formatDate(exp.startDate) : "—"}
                  {" → "}
                  {exp.endDate ? formatDate(exp.endDate) : "—"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column (fixed width) ───────────────── */}
        <div
          className="flex flex-col gap-3 shrink-0"
          style={{ width: 200 }}
        >
          {/* ICE Score block */}
          <div
            className="flex flex-col items-center justify-center py-4 px-3"
            style={{
              background: colors.bg,
              borderRadius: "var(--radius-md)",
              border: `1px solid ${colors.text}22`,
            }}
          >
            <span
              className="text-3xl font-bold leading-none"
              style={{ color: colors.text }}
            >
              {exp.iceScore.toFixed(1)}
            </span>
            <span
              className="text-xs uppercase tracking-wide mt-1"
              style={{ color: colors.text, opacity: 0.7 }}
            >
              ICE Score
            </span>
            <span
              className="text-xs font-semibold mt-3 px-3 py-0.5"
              style={{
                background: colors.text,
                color: "white",
                borderRadius: "var(--radius-full)",
              }}
            >
              {actionLabel}
            </span>
          </div>

          {/* I / C / E breakdown */}
          <div
            className="flex overflow-hidden"
            style={{
              background: "var(--bg-app)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {(
              [
                { label: "I", value: exp.impactScore, title: "Impacto" },
                { label: "C", value: exp.confidenceScore, title: "Confiança" },
                { label: "E", value: exp.effortScore, title: "Esforço" },
              ] as const
            ).map(({ label, value, title }, idx) => (
              <div
                key={label}
                className="flex-1 flex flex-col items-center justify-center py-3"
                style={{ borderLeft: idx > 0 ? "1px solid var(--border-subtle)" : undefined }}
                data-tooltip={title}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {label}
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {value % 1 === 0 ? value : value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
