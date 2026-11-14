"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { createAusencia, updateAusencia } from "@/actions/ausencias";
import { AUSENCIA_TYPE_OPTIONS } from "@/components/shared/AusenciaTypeBadge";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { IconButton } from "@/components/shared/IconButton";
import { acaoSegura } from "@/lib/acao-segura";

type MemberItem = { id: string; name: string; isActive: boolean };

export type AusenciaEditTarget = {
  id: string;
  memberId: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
};

interface AusenciaFormProps {
  mode: "create" | "edit";
  ausencia?: AusenciaEditTarget;
  members: MemberItem[];
  onSuccess: () => void;
  onCancel: () => void;
}

function toDateInput(date: Date | string): string {
  return new Date(date as any).toISOString().split("T")[0];
}

export function AusenciaForm({
  mode,
  ausencia,
  members,
  onSuccess,
  onCancel,
}: AusenciaFormProps) {
  const isEdit = mode === "edit";
  const activeMembers = members.filter((m) => m.isActive);

  const [memberId, setMemberId] = useState(
    isEdit ? ausencia!.memberId : activeMembers[0]?.id ?? ""
  );
  const [type, setType] = useState(isEdit ? ausencia!.type : "FERIAS");
  const [startDate, setStartDate] = useState(
    isEdit ? toDateInput(ausencia!.startDate) : ""
  );
  const [endDate, setEndDate] = useState(
    isEdit ? toDateInput(ausencia!.endDate) : ""
  );
  const [notes, setNotes] = useState(isEdit ? (ausencia!.notes ?? "") : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duration = useMemo(() => {
    if (!startDate || !endDate) return null;
    const diff = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    return Math.max(0, diff);
  }, [startDate, endDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Sem o `required` do select nativo, a obrigatoriedade do membro é checada
    // aqui — antes de gastar um round-trip para receber "Membro inválido".
    if (!memberId) {
      setError("Selecione o membro.");
      return;
    }
    setLoading(true);
    const data = { memberId, type, startDate, endDate, notes: notes || undefined };
    const res = isEdit
      ? await acaoSegura(updateAusencia(ausencia!.id, data as any))
      : await acaoSegura(createAusencia(data as any));
    setLoading(false);
    if (res.success) {
      onSuccess();
    } else {
      setError(res.error);
    }
  }

  return (
    <Modal open onClose={onCancel} maxWidth={520} labelledBy="ausencia-form-title">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 id="ausencia-form-title" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Editar Ausência" : "Nova Ausência"}
        </h2>
        <IconButton boxSize={32} onClick={onCancel} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Membro">
          {isEdit ? (
            <p
              className="text-sm"
              style={{
                padding: "10px 14px",
                background: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-secondary)",
              }}
            >
              {members.find((m) => m.id === memberId)?.name ?? memberId}
            </p>
          ) : (
            <Dropdown
              value={memberId}
              options={activeMembers.map((m) => ({ value: m.id, label: m.name }))}
              onChange={setMemberId}
              placeholder="Selecione"
              fullWidth
            />
          )}
        </Field>

        <Field label="Tipo">
          <Dropdown
            value={type}
            options={AUSENCIA_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
            onChange={setType}
            fullWidth
          />
        </Field>

        {/* Datas */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Data de Início">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Data de Fim">
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
          </Field>
        </div>

        {/* Duration preview */}
        {duration !== null && (
          <p className="text-xs -mt-2" style={{ color: "var(--text-muted)" }}>
            Duração:{" "}
            <span style={{ color: "var(--brand-primary)", fontWeight: 600 }}>
              {duration} dia{duration !== 1 ? "s" : ""}
            </span>
          </p>
        )}

        <Field label="Observações (opcional)">
          <Textarea
            rows={3}
            style={{ resize: "none" }}
            placeholder="Informações adicionais..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && (
          <p
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={loading}>
            {loading ? "Salvando..." : isEdit ? "Salvar" : "Criar Ausência"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
