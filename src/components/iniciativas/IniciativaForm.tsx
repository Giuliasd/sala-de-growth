"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createIniciativa, updateIniciativa } from "@/actions/iniciativas";
import { getOKRsForSelect } from "@/actions/okrs";
import { STATUS_OPTIONS } from "@/components/shared/StatusBadge";
import { PriorityType, PRIORITY_OPTIONS } from "@/components/shared/PriorityBadge";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { IconButton } from "@/components/shared/IconButton";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { acaoSegura } from "@/lib/acao-segura";

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };
type OKRItem = { id: string; objective: string };

type IniciativaItem = {
  id: string;
  name: string;
  status: string;
  priority: string;
  frenteId: string;
  members: { id: string; name: string }[];
  startDate: Date | string | null;
  endDate: Date | string | null;
  launchDate: Date | string | null;
  analysisDate: Date | string | null;
  resultado: string | null;
  okrId: string | null;
  docLink: string | null;
  quarterId: string;
};

interface IniciativaFormProps {
  mode: "create" | "edit";
  iniciativa?: IniciativaItem;
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  initialOkrs: OKRItem[];
  selectedQuarterId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function toDateInput(date: Date | string | null): string {
  if (!date) return "";
  return new Date(date as any).toISOString().split("T")[0];
}

export function IniciativaForm({
  mode,
  iniciativa,
  quarters,
  frentes,
  members,
  initialOkrs,
  selectedQuarterId,
  onSuccess,
  onCancel,
}: IniciativaFormProps) {
  const isEdit = mode === "edit";

  const [quarterId, setQuarterId] = useState(
    isEdit ? iniciativa!.quarterId : selectedQuarterId
  );
  const [frenteId, setFrenteId] = useState(
    isEdit ? iniciativa!.frenteId : ""
  );
  const [memberIds, setMemberIds] = useState<string[]>(
    isEdit ? iniciativa!.members.map((m) => m.id) : []
  );
  const [name, setName] = useState(isEdit ? iniciativa!.name : "");
  const [status, setStatus] = useState(isEdit ? iniciativa!.status : "BACKLOG");
  const [priority, setPriority] = useState<PriorityType>(
    (isEdit ? iniciativa!.priority : "MEDIA") as PriorityType
  );
  const [startDate, setStartDate] = useState(
    isEdit ? toDateInput(iniciativa!.startDate) : ""
  );
  const [endDate, setEndDate] = useState(
    isEdit ? toDateInput(iniciativa!.endDate) : ""
  );
  const [launchDate, setLaunchDate] = useState(
    isEdit ? toDateInput(iniciativa!.launchDate) : ""
  );
  const [analysisDate, setAnalysisDate] = useState(
    isEdit ? toDateInput(iniciativa!.analysisDate) : ""
  );
  const [okrId, setOkrId] = useState(isEdit ? iniciativa!.okrId ?? "" : "");
  const [docLink, setDocLink] = useState(isEdit ? iniciativa!.docLink ?? "" : "");
  const [okrs, setOkrs] = useState<OKRItem[]>(initialOkrs);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [initialValues] = useState({
    quarterId: isEdit ? iniciativa!.quarterId : selectedQuarterId,
    frenteId: isEdit ? iniciativa!.frenteId : "",
    memberIds: isEdit ? iniciativa!.members.map((m) => m.id) : [],
    name: isEdit ? iniciativa!.name : "",
    status: isEdit ? iniciativa!.status : "BACKLOG",
    priority: isEdit ? iniciativa!.priority : "MEDIA",
    startDate: isEdit ? toDateInput(iniciativa!.startDate) : "",
    endDate: isEdit ? toDateInput(iniciativa!.endDate) : "",
    launchDate: isEdit ? toDateInput(iniciativa!.launchDate) : "",
    analysisDate: isEdit ? toDateInput(iniciativa!.analysisDate) : "",
    okrId: isEdit ? iniciativa!.okrId ?? "" : "",
    docLink: isEdit ? iniciativa!.docLink ?? "" : "",
  });

  const isDirty =
    quarterId !== initialValues.quarterId ||
    frenteId !== initialValues.frenteId ||
    JSON.stringify(memberIds) !== JSON.stringify(initialValues.memberIds) ||
    name !== initialValues.name ||
    status !== initialValues.status ||
    priority !== initialValues.priority ||
    startDate !== initialValues.startDate ||
    endDate !== initialValues.endDate ||
    launchDate !== initialValues.launchDate ||
    analysisDate !== initialValues.analysisDate ||
    okrId !== initialValues.okrId ||
    docLink !== initialValues.docLink;

  function handleClose() {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onCancel();
    }
  }

  async function handleQuarterChange(newQuarterId: string) {
    setQuarterId(newQuarterId);
    setOkrId("");
    setOkrs(await getOKRsForSelect(newQuarterId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    // Sem o `required` do select nativo, a frente obrigatória é checada aqui.
    if (!frenteId) {
      setErrorMsg("Selecione a frente.");
      return;
    }
    setLoading(true);

    let res;
    if (isEdit) {
      res = await acaoSegura(updateIniciativa(iniciativa!.id, {
        quarterId,
        name,
        status: status as any,
        priority,
        frenteId,
        memberIds,
        startDate: startDate || null,
        endDate: endDate || null,
        launchDate: launchDate || null,
        analysisDate: analysisDate || null,
        okrId: okrId || null,
        docLink: docLink || null,
      }));
    } else {
      res = await acaoSegura(createIniciativa({
        quarterId,
        frenteId,
        memberIds,
        name,
        status: status as any,
        priority,
        startDate: startDate || null,
        endDate: endDate || null,
        launchDate: launchDate || null,
        analysisDate: analysisDate || null,
        okrId: okrId || null,
        docLink: docLink || null,
      }));
    }

    setLoading(false);
    if (res.success) {
      onSuccess();
    } else {
      setErrorMsg(res.error);
    }
  }

  const activeFrentes = frentes.filter((f) => f.isActive);
  const activeMembers = members.filter((m) => m.isActive);

  return (
    <>
      <Modal open onClose={handleClose} maxWidth={640} labelledBy="iniciativa-form-title">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="iniciativa-form-title" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            {isEdit ? "Editar Iniciativa" : "Nova Iniciativa"}
          </h2>
          <IconButton boxSize={32} onClick={handleClose} aria-label="Fechar">
            <X size={18} />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Quarter + Frente */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quarter">
              <Dropdown
                value={quarterId}
                options={quarters.map((q) => ({ value: q.id, label: `Q${q.quarter} ${q.year}` }))}
                onChange={handleQuarterChange}
                fullWidth
              />
            </Field>
            <Field label="Frente">
              <Dropdown
                value={frenteId}
                options={activeFrentes.map((f) => ({ value: f.id, label: f.name }))}
                onChange={setFrenteId}
                placeholder="Selecione"
                fullWidth
              />
            </Field>
          </div>

          <Field label="Nome">
            <Input
              type="text"
              autoFocus
              placeholder="Nome da iniciativa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Responsáveis
            </label>
            <MemberPicker members={activeMembers} value={memberIds} onChange={setMemberIds} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Dropdown
                value={status}
                options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                onChange={setStatus}
                fullWidth
              />
            </Field>
            <Field label="Prioridade">
              <Dropdown
                value={priority}
                options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                onChange={(v) => setPriority(v as PriorityType)}
                fullWidth
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Data Início">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Data Fim">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>

          {/* Resultado é exclusivo de experimentos — iniciativas não têm esse campo. */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data de Lançamento (opcional)">
              <Input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} />
            </Field>
            {/* Marco de parada para olhar os resultados do que foi entregue. */}
            <Field label="Data de Análise de Resultados (opcional)">
              <Input type="date" value={analysisDate} onChange={(e) => setAnalysisDate(e.target.value)} />
            </Field>
          </div>

          <Field label="OKR Vinculado (opcional)">
            <Dropdown
              value={okrId}
              options={[
                { value: "", label: "— Nenhum —" },
                ...okrs.map((o) => ({
                  value: o.id,
                  label:
                    o.objective.length > 70 ? o.objective.substring(0, 70) + "…" : o.objective,
                })),
              ]}
              onChange={setOkrId}
              fullWidth
            />
          </Field>

          <Field label="Link da Documentação (opcional)">
            <Input
              type="url"
              placeholder="https://..."
              value={docLink}
              onChange={(e) => setDocLink(e.target.value)}
            />
          </Field>

          {errorMsg && (
            <p
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}
            >
              {errorMsg}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={loading}>
              {loading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Iniciativa"}
            </Button>
          </div>
        </form>
      </Modal>

      {showConfirm && (
        <ConfirmDialog
          title="Fechar formulário?"
          message="Existem alterações não salvas. Se fechar agora, você perderá o que preencheu."
          confirmLabel="Fechar mesmo assim"
          cancelLabel="Continuar editando"
          onConfirm={onCancel}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
