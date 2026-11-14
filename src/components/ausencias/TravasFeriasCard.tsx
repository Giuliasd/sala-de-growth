"use client";

import { useState } from "react";
import { Lock, Pencil, Trash2, Plus, AlertTriangle } from "lucide-react";
import { deleteTravaFerias } from "@/actions/travas-ferias";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { CardHeader } from "@/components/shared/CardHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { toast } from "@/components/shared/Toast";
import {
  useCursorTooltip,
  CursorTooltip,
  TooltipTitle,
  TooltipLine,
} from "@/components/shared/CursorTooltip";
import { TravaFeriasForm, type TravaEditTarget } from "./TravaFeriasForm";

export type TravaItem = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
  /** Nomes de quem tem férias marcadas dentro da trava — calculado na página. */
  conflitos: string[];
};

interface TravasFeriasCardProps {
  travas: TravaItem[];
  /** Janela fixa do card (quarter atual + 4 seguintes), ex.: "Q3 2026 – Q3 2027". */
  windowLabel: string;
  /** Só liderança cria/edita: a trava vale para o time inteiro. */
  canManage: boolean;
}

// A janela do card passa de um ano (quarter atual + 4), então o ano aparece
// sempre que não for o corrente — senão "15 set." seria ambíguo.
function fmtShortDate(date: Date | string): string {
  const d = new Date(date as string);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(d.getUTCFullYear() !== new Date().getUTCFullYear() && { year: "numeric" }),
    timeZone: "UTC",
  });
}

function calcDuration(start: Date | string, end: Date | string): number {
  const utcDay = (d: Date | string) => {
    const x = new Date(d as string);
    return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  };
  return Math.round((utcDay(end) - utcDay(start)) / (1000 * 60 * 60 * 24)) + 1;
}

export function TravasFeriasCard({ travas, windowLabel, canManage }: TravasFeriasCardProps) {
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<TravaEditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TravaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Quem são as pessoas com férias na janela — tooltip do padrão, não o title
  // nativo (que abre fora do tema).
  const conflitoTip = useCursorTooltip<TravaItem>();

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteTravaFerias(deleteTarget.id);
    setDeleting(false);
    if (res.success) {
      setDeleteTarget(null);
      toast("Trava de férias excluída.");
    } else {
      toast(res.error, "error");
    }
  }

  const ordenadas = [...travas].sort(
    (a, b) => new Date(a.startDate as string).getTime() - new Date(b.startDate as string).getTime()
  );

  return (
    <>
      <Card className="overflow-hidden" padding={0}>
        {/* Cabeçalho grande do design system (mesmo dos objetivos de OKR). */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <CardHeader
            icon={Lock}
            iconBg="var(--blush-soft)"
            iconColor="var(--blush-strong)"
            title="Travas de Férias"
            badge={`${ordenadas.length} · ${windowLabel}`}
            subtitle="Períodos em que ninguém do time pode tirar férias"
            actions={
              canManage && (
                <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                  <Plus size={14} />
                  Nova trava
                </Button>
              )
            }
          />
        </div>

        {ordenadas.length === 0 ? (
          <EmptyState
            icon={Lock}
            title={`Nenhuma trava entre ${windowLabel}`}
            description={
              canManage
                ? "Crie uma trava para marcar janelas em que ninguém pode tirar férias (Black Friday, virada de ano)."
                : "Janelas em que ninguém pode tirar férias aparecem aqui."
            }
            density="compact"
          />
        ) : (
          <div>
            {ordenadas.map((trava, idx) => {
              const dur = calcDuration(trava.startDate, trava.endDate);
              return (
                <div
                  key={trava.id}
                  className="list-row flex items-center gap-3 px-4 py-3 flex-wrap"
                  style={{
                    borderBottom:
                      idx < ordenadas.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    boxShadow: "inset 4px 0 0 var(--blush)",
                  }}
                >
                  <span
                    className="text-sm font-semibold min-w-0 truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {trava.name}
                  </span>

                  <span
                    className="text-sm whitespace-nowrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {fmtShortDate(trava.startDate)} → {fmtShortDate(trava.endDate)}
                  </span>

                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {dur} dia{dur !== 1 ? "s" : ""}
                  </span>

                  {trava.notes && (
                    <span
                      className="text-xs truncate max-w-[220px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {trava.notes}
                    </span>
                  )}

                  {/* Férias marcadas dentro da janela: a trava não impede o
                      registro (dado histórico continua válido), então avisa. */}
                  {trava.conflitos.length > 0 && (
                    <span
                      className="text-xs font-medium inline-flex items-center gap-1 px-2 py-0.5 whitespace-nowrap"
                      style={{
                        background: "var(--peach-soft)",
                        color: "var(--peach-strong)",
                        borderRadius: "var(--radius-full)",
                      }}
                      {...conflitoTip.bind(trava)}
                    >
                      <AlertTriangle size={12} />
                      {trava.conflitos.length} com férias no período
                    </span>
                  )}

                  {canManage && (
                    <div className="flex items-center gap-1 ml-auto">
                      <IconButton
                        onClick={() =>
                          setEditTarget({
                            id: trava.id,
                            name: trava.name,
                            startDate: trava.startDate,
                            endDate: trava.endDate,
                            notes: trava.notes,
                          })
                        }
                        title="Editar trava"
                        aria-label={`Editar a trava ${trava.name}`}
                      >
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        onClick={() => setDeleteTarget(trava)}
                        title="Excluir trava"
                        aria-label={`Excluir a trava ${trava.name}`}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {conflitoTip.tip && (
        <CursorTooltip x={conflitoTip.tip.x} y={conflitoTip.tip.y}>
          <TooltipTitle>Férias dentro da trava</TooltipTitle>
          {conflitoTip.tip.data.conflitos.map((nome) => (
            <TooltipLine key={nome}>{nome}</TooltipLine>
          ))}
        </CursorTooltip>
      )}

      {creating && (

        <TravaFeriasForm
          mode="create"
          onSuccess={() => {
            setCreating(false);
            toast("Trava de férias criada.");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {editTarget && (
        <TravaFeriasForm
          mode="edit"
          trava={editTarget}
          onSuccess={() => {
            setEditTarget(null);
            toast("Trava de férias atualizada.");
          }}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Excluir a trava "${deleteTarget.name}"?`}
          message="O período volta a ficar liberado para férias. Essa ação não pode ser desfeita."
          confirmLabel={deleting ? "Excluindo..." : "Excluir"}
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => !deleting && setDeleteTarget(null)}
        />
      )}
    </>
  );
}
