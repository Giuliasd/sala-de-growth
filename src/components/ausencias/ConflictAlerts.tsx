"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Alert } from "@/components/shared/Alert";

function fmtDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const AUSENCIA_LABELS: Record<string, string> = {
  FERIAS: "Férias",
  LICENCA_MEDICA: "Licença Médica",
  LICENCA_MATERNIDADE: "Lic. Maternidade",
  DAY_OFF: "Day Off",
  OUTROS: "Outros",
};

export type ConflictItem = {
  iniciativa: {
    id: string;
    name: string;
    status: string;
    endDate: Date | string | null;
    member: { id: string; name: string } | null;
    frente: { name: string };
  };
  ausencia: {
    id: string;
    type: string;
    startDate: Date | string;
    endDate: Date | string;
    member: { id: string; name: string };
  };
};

interface ConflictAlertsProps {
  conflicts: ConflictItem[];
  compact?: boolean;
}

export function ConflictAlerts({ conflicts, compact = false }: ConflictAlertsProps) {
  const [expanded, setExpanded] = useState(!compact);

  // ── No conflicts ───────────────────────────────────────────────────
  if (conflicts.length === 0) {
    return <Alert variant="success">Nenhum conflito detectado neste período.</Alert>;
  }

  // ── Has conflicts ──────────────────────────────────────────────────
  const headerText = `${conflicts.length} iniciativa${
    conflicts.length !== 1 ? "s têm" : " tem"
  } deadline durante ausência${conflicts.length !== 1 ? "s" : ""}`;

  return (
    <Alert
      variant="warning"
      title={
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-left w-full leading-snug"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
        >
          {headerText}
        </button>
      }
      action={
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Recolher" : "Expandir"}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex" }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      }
    >
      {expanded && (
        <ul className="mt-2 flex flex-col gap-2">
          {conflicts.map((c, i) => (
            <li
              key={i}
              className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4 pt-2"
              style={{ borderTop: "1px solid color-mix(in srgb, var(--butter) 55%, transparent)" }}
            >
              <div className="flex-1 min-w-0">
                <Link
                  href="/iniciativas"
                  className="text-sm font-medium block truncate transition-opacity hover:opacity-75"
                  data-tooltip={c.iniciativa.name}
                >
                  {c.iniciativa.name.length > 55
                    ? c.iniciativa.name.substring(0, 55) + "…"
                    : c.iniciativa.name}
                </Link>
                <p className="text-xs mt-0.5 opacity-75">
                  {c.iniciativa.frente.name} · {c.iniciativa.member?.name.split(" ")[0] ?? "—"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold" style={{ color: "var(--peach-strong)" }}>
                  Deadline: {fmtDate(c.iniciativa.endDate)}
                </p>
                <p className="text-xs mt-0.5 opacity-75">
                  {AUSENCIA_LABELS[c.ausencia.type] ?? c.ausencia.type}:{" "}
                  {fmtDate(c.ausencia.startDate)} – {fmtDate(c.ausencia.endDate)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
