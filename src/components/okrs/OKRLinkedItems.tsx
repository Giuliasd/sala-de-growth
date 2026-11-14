"use client";

import { useEffect, useState } from "react";
import { ClipboardList, FlaskConical } from "lucide-react";
import { getOKRLinkedItems } from "@/actions/okrs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatMemberFirstNames } from "@/components/shared/MemberChips";

type LinkedData = Awaited<ReturnType<typeof getOKRLinkedItems>>;

// Pill de resultado final — só aparece quando o experimento tem resultado definido.
const RESULTADO_CONFIG: Record<string, { label: string; classes: string; textColor: string }> = {
  SUCESSO: { label: "Sucesso", classes: "bg-sage-soft border border-sage", textColor: "var(--color-forest)" },
  PARCIAL: { label: "Parcial", classes: "bg-butter-soft border border-butter", textColor: "#7A5D0B" },
  FALHA: { label: "Falha", classes: "bg-blush-soft border border-blush", textColor: "#9B3A5A" },
};

function ResultadoBadge({ resultado }: { resultado: string }) {
  const cfg = RESULTADO_CONFIG[resultado];
  if (!cfg) return null;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap font-medium px-2.5 py-1 rounded-full text-xs ${cfg.classes}`}
      style={{ maxHeight: 32, color: cfg.textColor }}
    >
      {cfg.label}
    </span>
  );
}

function formatDate(date: Date | string | null): string {
  if (!date) return "";
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function OKRLinkedItems({ okrId }: { okrId: string }) {
  const [data, setData] = useState<LinkedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOKRLinkedItems(okrId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [okrId]);

  if (loading) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Carregando...
        </p>
      </div>
    );
  }

  const iniciativas = data?.iniciativas ?? [];
  const experimentos = data?.experimentos ?? [];

  if (iniciativas.length === 0 && experimentos.length === 0) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Nenhuma iniciativa ou experimento vinculado a este OKR.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
    >
      {/* ── Iniciativas ───────────────────────────────── */}
      {iniciativas.length > 0 && (
        <div>
          {/* Subheader */}
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}
          >
            <ClipboardList size={13} style={{ color: "var(--brand-primary)" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Iniciativas
            </span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 ml-1"
              style={{
                borderRadius: "var(--radius-full)",
                background: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              {iniciativas.length}
            </span>
          </div>

          <ul>
            {iniciativas.map((ini, idx) => {
              const isLast = idx === iniciativas.length - 1 && experimentos.length === 0;
              return (
                <li
                  key={ini.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
                  style={{
                    borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "var(--bg-surface)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {ini.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {formatMemberFirstNames(ini.members)}
                      {ini.endDate ? ` · até ${formatDate(ini.endDate)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={ini.status} type="iniciativa" itemId={ini.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Experimentos ──────────────────────────────── */}
      {experimentos.length > 0 && (
        <div>
          {/* Subheader */}
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{
              borderBottom: "1px solid var(--border-subtle)",
              borderTop: iniciativas.length > 0 ? "1px solid var(--border-default)" : "none",
              background: "var(--bg-surface)",
            }}
          >
            <FlaskConical size={13} style={{ color: "var(--brand-primary)" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Experimentos
            </span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 ml-1"
              style={{
                borderRadius: "var(--radius-full)",
                background: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              {experimentos.length}
            </span>
          </div>

          <ul>
            {experimentos.map((exp, idx) => (
              <li
                key={exp.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
                style={{
                  borderBottom: idx < experimentos.length - 1 ? "1px solid var(--border-subtle)" : "none",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "var(--bg-surface)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "transparent")
                }
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {exp.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {formatMemberFirstNames(exp.members)}
                    <span className="ml-1.5 font-semibold" style={{ color: "var(--text-secondary)" }}>
                      · ICE {exp.iceScore.toFixed(1)}
                    </span>
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <StatusBadge status={exp.status} type="experimento" itemId={exp.id} />
                  {exp.resultado && <ResultadoBadge resultado={exp.resultado} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
