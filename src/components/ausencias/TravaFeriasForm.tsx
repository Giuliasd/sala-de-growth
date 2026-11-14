"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { createTravaFerias, updateTravaFerias } from "@/actions/travas-ferias";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { IconButton } from "@/components/shared/IconButton";
import { acaoSegura } from "@/lib/acao-segura";

export type TravaEditTarget = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
};

interface TravaFeriasFormProps {
  mode: "create" | "edit";
  trava?: TravaEditTarget;
  onSuccess: () => void;
  onCancel: () => void;
}

function toDateInput(date: Date | string): string {
  return new Date(date as string).toISOString().split("T")[0];
}

export function TravaFeriasForm({ mode, trava, onSuccess, onCancel }: TravaFeriasFormProps) {
  const isEdit = mode === "edit";

  const [name, setName] = useState(isEdit ? trava!.name : "");
  const [startDate, setStartDate] = useState(isEdit ? toDateInput(trava!.startDate) : "");
  const [endDate, setEndDate] = useState(isEdit ? toDateInput(trava!.endDate) : "");
  const [notes, setNotes] = useState(isEdit ? (trava!.notes ?? "") : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duration = useMemo(() => {
    if (!startDate || !endDate) return null;
    const diff =
      Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
    return Math.max(0, diff);
  }, [startDate, endDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const data = { name, startDate, endDate, notes: notes || undefined };
    const res = isEdit
      ? await acaoSegura(updateTravaFerias(trava!.id, data))
      : await acaoSegura(createTravaFerias(data));
    setLoading(false);
    if (res.success) onSuccess();
    else setError(res.error);
  }

  return (
    <Modal open onClose={onCancel} maxWidth={520} labelledBy="trava-form-title">
      <div className="flex items-center justify-between mb-6">
        <h2
          id="trava-form-title"
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {isEdit ? "Editar trava de férias" : "Nova trava de férias"}
        </h2>
        <IconButton boxSize={32} onClick={onCancel} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Nome">
          <Input
            type="text"
            placeholder="Black Friday"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Data de Início">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Data de Fim">
            <Input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </Field>
        </div>

        {duration !== null && (
          <p className="text-xs -mt-2" style={{ color: "var(--text-muted)" }}>
            Período travado:{" "}
            <span style={{ color: "var(--brand-primary)", fontWeight: 600 }}>
              {duration} dia{duration !== 1 ? "s" : ""}
            </span>
          </p>
        )}

        <Field label="Observações (opcional)">
          <Textarea
            rows={3}
            style={{ resize: "none" }}
            placeholder="Por que ninguém pode tirar férias nesse período..."
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
            {loading ? "Salvando..." : isEdit ? "Salvar" : "Criar trava"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
