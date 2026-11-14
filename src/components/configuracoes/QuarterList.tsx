"use client";

import { useState, useMemo } from "react";
import { CalendarRange, CalendarDays, Plus } from "lucide-react";
import { Quarter } from "@/generated/prisma/client";
import { createQuarter, setActiveQuarter, deleteQuarter } from "@/actions/quarters";
import { formatQuarterPeriod } from "@/lib/quarter-dates";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "@/components/shared/Toast";
import { acaoSegura } from "@/lib/acao-segura";

type QuarterWithCount = Quarter & {
  _count: { okrs: number; iniciativas: number; experimentos: number };
};

function formatDate(date: Date | string): string {
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function QuarterList({ quarters }: { quarters: QuarterWithCount[] }) {
  const currentYear = new Date().getFullYear();

  const [isAdding, setIsAdding] = useState(false);
  const [addYear, setAddYear] = useState(String(currentYear));
  const [addQuarter, setAddQuarter] = useState<"1" | "2" | "3" | "4">("1");
  const [loading, setLoading] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState<{
    type: "activate" | "delete";
    id: string;
    label: string;
  } | null>(null);

  const preview = useMemo(() => {
    const yr = Number(addYear);
    const q = Number(addQuarter) as 1 | 2 | 3 | 4;
    if (!yr || yr < 2024 || yr > 2030 || !q) return null;
    return formatQuarterPeriod(yr, q);
  }, [addYear, addQuarter]);

  function startAdding() {
    setIsAdding(true);
    setAddYear(String(currentYear));
    setAddQuarter("1");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await acaoSegura(createQuarter({ year: Number(addYear), quarter: Number(addQuarter) }));
    setLoading(false);
    if (res.success) {
      setIsAdding(false);
      toast("Quarter criado com sucesso.");
    } else {
      toast(res.error, "error");
    }
  }

  async function doConfirmed() {
    if (!confirmDlg) return;
    const { type, id } = confirmDlg;
    setConfirmDlg(null);
    if (type === "activate") {
      const res = await setActiveQuarter(id);
      toast(res.success ? "Quarter ativado." : res.error, res.success ? "success" : "error");
    } else {
      const res = await deleteQuarter(id);
      toast(res.success ? "Quarter excluído." : res.error, res.success ? "success" : "error");
    }
  }

  return (
    <>
      <Card padding="24px 28px">
        {/* Section header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--radius-full)",
                background: "var(--accent-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CalendarRange size={18} style={{ color: "var(--brand-primary)" }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Quarters
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Ciclos trimestrais da operação
              </p>
            </div>
          </div>
          {!isAdding && (
            <Button variant="primary" size="sm" onClick={startAdding}>
              <Plus size={14} />
              Novo Quarter
            </Button>
          )}
        </div>

        {/* Inline add form */}
        {isAdding && (
          <form
            onSubmit={handleAdd}
            className="mb-5 space-y-4 p-4 rounded-xl"
            style={{
              background: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Ano
                </label>
                <Input
                  type="number"
                  min={2024}
                  max={2030}
                  autoFocus
                  value={addYear}
                  onChange={(e) => setAddYear(e.target.value)}
                  required
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Quarter
                </label>
                <Dropdown
                  value={addQuarter}
                  options={[
                    { value: "1", label: "Q1 — Jan a Mar" },
                    { value: "2", label: "Q2 — Abr a Jun" },
                    { value: "3", label: "Q3 — Jul a Set" },
                    { value: "4", label: "Q4 — Out a Dez" },
                  ]}
                  onChange={(v) => setAddQuarter(v as "1" | "2" | "3" | "4")}
                  fullWidth
                />
              </div>
            </div>

            {preview && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <CalendarDays size={14} style={{ color: "var(--brand-primary)", flexShrink: 0 }} />
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    Período:
                  </span>{" "}
                  {preview}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={loading}>
                {loading ? "Salvando..." : "Criar Quarter"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setIsAdding(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* Quarter list */}
        {quarters.length === 0 && !isAdding ? (
          <EmptyState icon={CalendarRange} title="Nenhum quarter cadastrado" />
        ) : (
          <ul className="space-y-2">
            {quarters.map((q) => {
              const hasLinked =
                q._count.okrs + q._count.iniciativas + q._count.experimentos > 0;

              return (
                <li
                  key={q.id}
                  className="flex items-center justify-between px-4 py-3 transition-colors"
                  style={{
                    borderRadius: "var(--radius-md)",
                    background: q.isActive ? "var(--accent-subtle)" : "transparent",
                    border: `1px solid ${q.isActive ? "var(--accent)" : "var(--border-subtle)"}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!q.isActive)
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-app)";
                  }}
                  onMouseLeave={(e) => {
                    if (!q.isActive)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-base font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Q{q.quarter} {q.year}
                      </span>
                      {q.isActive && (
                        <Badge bg="var(--status-done-bg)" color="var(--status-done-text)">
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {formatDate(q.startDate)} – {formatDate(q.endDate)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!q.isActive && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setConfirmDlg({
                            type: "activate",
                            id: q.id,
                            label: `Q${q.quarter} ${q.year}`,
                          })
                        }
                      >
                        Ativar
                      </Button>
                    )}
                    {!hasLinked && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          setConfirmDlg({
                            type: "delete",
                            id: q.id,
                            label: `Q${q.quarter} ${q.year}`,
                          })
                        }
                      >
                        Excluir
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Confirm dialog */}
      {confirmDlg && (
        <ConfirmDialog
          title={confirmDlg.type === "activate" ? "Ativar Quarter" : "Excluir Quarter"}
          message={
            confirmDlg.type === "activate"
              ? `${confirmDlg.label} será definido como quarter ativo, desativando o atual.`
              : `Excluir ${confirmDlg.label}? Esta ação não pode ser desfeita.`
          }
          confirmLabel={confirmDlg.type === "activate" ? "Ativar" : "Excluir"}
          variant={confirmDlg.type === "delete" ? "danger" : "primary"}
          onConfirm={doConfirmed}
          onCancel={() => setConfirmDlg(null)}
        />
      )}
    </>
  );
}
