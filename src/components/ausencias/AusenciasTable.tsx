"use client";

import { useState } from "react";
import { Pencil, Trash2, CalendarOff } from "lucide-react";
import { deleteAusencia } from "@/actions/ausencias";
import { AusenciaTypeBadge } from "@/components/shared/AusenciaTypeBadge";
import { getStatusAccentColor } from "@/lib/statusColors";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AusenciaForm, type AusenciaEditTarget } from "./AusenciaForm";

type MemberItem = { id: string; name: string; isActive: boolean };

export type TableAusencia = {
  id: string;
  memberId: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
  member: { id: string; name: string };
};

interface AusenciasTableProps {
  ausencias: TableAusencia[];
  members: MemberItem[];
}

function fmtShortDate(date: Date | string): string {
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function calcDuration(start: Date | string, end: Date | string): number {
  // Dias corridos, inclusivo (12→20 = 9 dias). Normaliza para o dia UTC antes
  // de subtrair: endDate pode vir gravado como 23:59:59, o que inflava a
  // diferença bruta de milissegundos em +1 dia. Mesmo cálculo do relatório.
  const utcDay = (d: Date | string) => {
    const x = new Date(d);
    return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  };
  return Math.round((utcDay(end) - utcDay(start)) / (1000 * 60 * 60 * 24)) + 1;
}

export function AusenciasTable({ ausencias, members }: AusenciasTableProps) {
  const [editTarget, setEditTarget] = useState<AusenciaEditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; memberName: string } | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    await deleteAusencia(id);
  }

  const sorted = [...ausencias].sort(
    (a, b) => new Date(a.startDate as any).getTime() - new Date(b.startDate as any).getTime()
  );

  return (
    <>
      <Card className="overflow-hidden" padding={0}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Lista de Ausências
          </h2>
          <Badge bg="var(--bg-app)" color="var(--text-muted)" borderColor="var(--border-subtle)">
            {sorted.length} ausência{sorted.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="Nenhuma ausência registrada"
            description="Nenhuma ausência registrada neste período."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {["Membro", "Tipo", "Período", "Duração", "Observações", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left whitespace-nowrap"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((aus, idx) => {
                    const dur = calcDuration(aus.startDate, aus.endDate);
                    return (
                      <tr
                        key={aus.id}
                        className="list-row"
                        style={{
                          borderBottom:
                            idx < sorted.length - 1 ? "1px solid var(--border-subtle)" : "none",
                          boxShadow: `inset 4px 0 0 ${getStatusAccentColor("ausencia", aus.type)}`,
                        }}
                      >
                        {/* Membro */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Avatar name={aus.member.name} size={28} />
                            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {aus.member.name}
                            </span>
                          </div>
                        </td>

                        {/* Tipo */}
                        <td className="px-4 py-3">
                          <AusenciaTypeBadge type={aus.type} />
                        </td>

                        {/* Período */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                          {fmtShortDate(aus.startDate)} → {fmtShortDate(aus.endDate)}
                        </td>

                        {/* Duração */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                          {dur} dia{dur !== 1 ? "s" : ""}
                        </td>

                        {/* Observações */}
                        <td className="px-4 py-3 max-w-[200px]">
                          {aus.notes ? (
                            <span
                              className="truncate block text-xs"
                              style={{ color: "var(--text-secondary)" }}
                              data-tooltip={aus.notes}
                            >
                              {aus.notes.length > 50 ? aus.notes.substring(0, 50) + "…" : aus.notes}
                            </span>
                          ) : (
                            <span style={{ color: "var(--border-default)" }}>—</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <IconButton
                              onClick={() =>
                                setEditTarget({
                                  id: aus.id,
                                  memberId: aus.memberId,
                                  type: aus.type,
                                  startDate: aus.startDate,
                                  endDate: aus.endDate,
                                  notes: aus.notes,
                                })
                              }
                              title="Editar"
                              aria-label="Editar"
                            >
                              <Pencil size={13} />
                            </IconButton>
                            <IconButton
                              onClick={() => setDeleteTarget({ id: aus.id, memberName: aus.member.name })}
                              title="Excluir"
                              aria-label="Excluir"
                              className="icon-btn--danger"
                            >
                              <Trash2 size={13} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              className="px-4 py-2 text-xs"
              style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
            >
              {sorted.length} ausência{sorted.length !== 1 ? "s" : ""}
            </div>
          </>
        )}
      </Card>

      {/* Edit modal */}
      {editTarget && (
        <AusenciaForm
          mode="edit"
          ausencia={editTarget}
          members={members}
          onSuccess={() => {
            setEditTarget(null);
          }}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir ausência"
          message={`Excluir ausência de "${deleteTarget.memberName}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
