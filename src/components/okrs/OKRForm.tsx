"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createOKR } from "@/actions/okrs";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { MEASUREMENT_OPTIONS, UNIT_OPTIONS } from "./okr-options";
import { IconButton } from "@/components/shared/IconButton";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { OKRUnit, OKRMeasurementType } from "@/generated/prisma/enums";
import { acaoSegura } from "@/lib/acao-segura";

type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string };

interface OKRFormProps {
  frentes: FrenteItem[];
  members: MemberItem[];
  selectedQuarterId: string;
  // KR é sempre criado dentro de um objetivo.
  objetivoId: string;
  objetivoTitle: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function OKRForm({ frentes, members, selectedQuarterId, objetivoId, objetivoTitle, onSuccess, onCancel }: OKRFormProps) {
  const [quarterId] = useState(selectedQuarterId);
  const [frenteId, setFrenteId] = useState(frentes[0]?.id ?? "");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [objective, setObjective] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [initialValue, setInitialValue] = useState("0");
  const [unit, setUnit] = useState<OKRUnit>("UNIDADE");
  const [measurementType, setMeasurementType] = useState<OKRMeasurementType>("ACUMULADO");
  const isMonthly = measurementType === "MEDIA_MENSAL";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    // Sem o `required` do select nativo, a frente obrigatória é checada aqui.
    if (!frenteId) {
      setErrorMsg("Selecione a frente.");
      return;
    }
    setLoading(true);
    const res = await acaoSegura(createOKR({
      quarterId,
      frenteId,
      objetivoId,
      memberIds: memberIds.length > 0 ? memberIds : undefined,
      objective,
      targetValue: Number(targetValue),
      initialValue: Number(initialValue),
      unit,
      measurementType,
    }));
    setLoading(false);
    if (res.success) {
      onSuccess();
    } else {
      setErrorMsg(res.error);
    }
  }

  return (
    <Modal open onClose={onCancel} labelledBy="okr-form-title">
      {/* Modal header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 id="okr-form-title" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Novo KR
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            no objetivo <span className="font-medium" style={{ color: "var(--text-primary)" }}>{objetivoTitle}</span>
          </p>
        </div>
        <IconButton boxSize={32} onClick={onCancel} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Frente">
          <Dropdown
            value={frenteId}
            options={frentes.map((f) => ({ value: f.id, label: f.name }))}
            onChange={setFrenteId}
            placeholder="Selecione"
            fullWidth
          />
        </Field>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Responsável <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span>
          </label>
          <MemberPicker members={members} value={memberIds} onChange={setMemberIds} />
        </div>

        <Field label="Resultado-chave (KR)">
          <Textarea
            autoFocus
            rows={3}
            style={{ resize: "none" }}
            placeholder="Descreva o resultado-chave de forma clara e mensurável..."
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Unidade de Medida">
            <Dropdown
              value={unit}
              options={UNIT_OPTIONS}
              onChange={(v) => setUnit(v as OKRUnit)}
              fullWidth
            />
          </Field>
          <Field label="Tipo de Meta">
            <Dropdown
              value={measurementType}
              options={MEASUREMENT_OPTIONS}
              onChange={(v) => setMeasurementType(v as OKRMeasurementType)}
              fullWidth
            />
          </Field>
        </div>

        {isMonthly && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            O valor do KR será a média dos 3 meses do quarter. Preencha cada mês depois,
            pelo botão <strong>Atualizar</strong> no card.
          </p>
        )}

        {/* Valor inicial + Meta. Na média mensal o inicial é opcional e serve
            para dizer a direção: meta abaixo dele é KR de redução (churn), e o
            progresso passa a contar a queda em vez de média ÷ meta. */}
        <div className="grid grid-cols-2 gap-4">
          <Field label={isMonthly ? "Ponto de partida (opcional)" : "Valor Inicial"}>
            <Input
              type="number"
              step="any"
              min="0"
              value={initialValue}
              onChange={(e) => setInitialValue(e.target.value)}
              required={!isMonthly}
            />
          </Field>
          <Field label="Meta">
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="Ex: 1000"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              required
            />
          </Field>
        </div>

        {errorMsg && (
          <p
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}
          >
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={loading}>
            {loading ? "Salvando..." : "Salvar KR"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
