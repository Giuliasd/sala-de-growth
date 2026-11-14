"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { createExperimento, updateExperimento } from "@/actions/experimentos";
import { getOKRsForSelect } from "@/actions/okrs";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { IconButton } from "@/components/shared/IconButton";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RESULTADO_OPTIONS } from "@/components/shared/ResultadoBadge";
import { calculateICEScore, getICEAction } from "@/lib/ice";
import { ICE_ACTION_COLORS, ICE_ACTION_LABELS } from "./ExperimentoCard";
import { acaoSegura } from "@/lib/acao-segura";

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };
type OKRItem = { id: string; objective: string };

type ExperimentoItem = {
  id: string;
  name: string;
  description: string;
  objective: string;
  status: string;
  frenteId: string;
  okrId: string | null;
  members: { id: string; name: string }[];
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
  quarterId: string;
};

interface ExperimentoFormProps {
  mode: "create" | "edit";
  experimento?: ExperimentoItem;
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  initialOkrs: OKRItem[];
  selectedQuarterId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const EXPERIMENTO_STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "EM_ANDAMENTO", label: "Em Andamento" },
  { value: "AGUARDANDO_RESULTADOS", label: "Aguardando resultados" },
  { value: "RELATORIO_PRONTO", label: "Relatório pronto" },
  { value: "RESULTADOS_APRESENTADOS", label: "Resultados apresentados" },
  { value: "PAUSADO", label: "Pausado" },
  { value: "ARQUIVADO", label: "Arquivado" },
] as const;

function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date as any).toISOString().split("T")[0];
}

function ScoreButtons({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="flex-1 py-2 text-sm font-semibold transition-all"
              style={{
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
                background: active ? "var(--brand-primary)" : "var(--bg-app)",
                color: active ? "white" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ExperimentoForm({
  mode,
  experimento,
  quarters,
  frentes,
  members,
  initialOkrs,
  selectedQuarterId,
  onSuccess,
  onCancel,
}: ExperimentoFormProps) {
  const isEdit = mode === "edit";

  // Quarter é editável: na criação começa no quarter em contexto, na edição no
  // do próprio experimento. Trocar o quarter recarrega os OKRs (que são por quarter).
  const [quarterId, setQuarterId] = useState(
    isEdit ? experimento!.quarterId : selectedQuarterId
  );
  const [frenteId, setFrenteId] = useState(
    isEdit ? experimento!.frenteId : ""
  );
  const [memberIds, setMemberIds] = useState<string[]>(
    isEdit ? experimento!.members.map((m) => m.id) : []
  );
  const [okrId, setOkrId] = useState(isEdit ? experimento!.okrId : "");
  const [name, setName] = useState(isEdit ? experimento!.name : "");
  const [description, setDescription] = useState(isEdit ? experimento!.description : "");
  const [objective, setObjective] = useState(isEdit ? experimento!.objective : "");
  const [status, setStatus] = useState(isEdit ? experimento!.status : "BACKLOG");
  const [impactScore, setImpactScore] = useState(isEdit ? experimento!.impactScore : 3);
  const [confidenceScore, setConfidenceScore] = useState(
    isEdit ? experimento!.confidenceScore : 3
  );
  const [effortScore, setEffortScore] = useState(isEdit ? experimento!.effortScore : 3);
  const [docLink, setDocLink] = useState(isEdit ? experimento!.docLink ?? "" : "");
  const [startDate, setStartDate] = useState(isEdit ? toDateInput(experimento!.startDate) : "");
  const [endDate, setEndDate] = useState(isEdit ? toDateInput(experimento!.endDate) : "");
  const [launchDate, setLaunchDate] = useState(isEdit ? toDateInput(experimento!.launchDate) : "");
  const [analysisDate, setAnalysisDate] = useState(isEdit ? toDateInput(experimento!.analysisDate) : "");
  const [resultado, setResultado] = useState(isEdit ? experimento!.resultado ?? "" : "");
  const [okrs, setOkrs] = useState<OKRItem[]>(initialOkrs);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [initialValues] = useState({
    quarterId: isEdit ? experimento!.quarterId : selectedQuarterId,
    frenteId: isEdit ? experimento!.frenteId : "",
    memberIds: isEdit ? experimento!.members.map((m) => m.id) : [],
    okrId: isEdit ? experimento!.okrId : "",
    name: isEdit ? experimento!.name : "",
    description: isEdit ? experimento!.description : "",
    objective: isEdit ? experimento!.objective : "",
    status: isEdit ? experimento!.status : "BACKLOG",
    impactScore: isEdit ? experimento!.impactScore : 3,
    confidenceScore: isEdit ? experimento!.confidenceScore : 3,
    effortScore: isEdit ? experimento!.effortScore : 3,
    docLink: isEdit ? experimento!.docLink ?? "" : "",
    startDate: isEdit ? toDateInput(experimento!.startDate) : "",
    endDate: isEdit ? toDateInput(experimento!.endDate) : "",
    launchDate: isEdit ? toDateInput(experimento!.launchDate) : "",
    analysisDate: isEdit ? toDateInput(experimento!.analysisDate) : "",
    resultado: isEdit ? experimento!.resultado ?? "" : "",
  });

  const isDirty =
    quarterId !== initialValues.quarterId ||
    frenteId !== initialValues.frenteId ||
    JSON.stringify(memberIds) !== JSON.stringify(initialValues.memberIds) ||
    okrId !== initialValues.okrId ||
    name !== initialValues.name ||
    description !== initialValues.description ||
    objective !== initialValues.objective ||
    status !== initialValues.status ||
    impactScore !== initialValues.impactScore ||
    confidenceScore !== initialValues.confidenceScore ||
    effortScore !== initialValues.effortScore ||
    docLink !== initialValues.docLink ||
    startDate !== initialValues.startDate ||
    endDate !== initialValues.endDate ||
    launchDate !== initialValues.launchDate ||
    analysisDate !== initialValues.analysisDate ||
    resultado !== initialValues.resultado;

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

  const liveScore = useMemo(
    () => calculateICEScore(impactScore, confidenceScore, effortScore),
    [impactScore, confidenceScore, effortScore]
  );
  const liveAction = useMemo(() => getICEAction(liveScore), [liveScore]);
  const iceColors = ICE_ACTION_COLORS[liveAction] ?? ICE_ACTION_COLORS.BACKLOG;

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
      res = await acaoSegura(updateExperimento(experimento!.id, {
        quarterId,
        name,
        description,
        objective,
        status: status as any,
        frenteId,
        okrId,
        memberIds,
        impactScore,
        confidenceScore,
        effortScore,
        docLink: docLink || null,
        startDate: startDate || null,
        endDate: endDate || null,
        launchDate: launchDate || null,
        analysisDate: analysisDate || null,
        resultado: (resultado || null) as any,
      }));
    } else {
      res = await acaoSegura(createExperimento({
        quarterId,
        frenteId,
        okrId,
        memberIds,
        name,
        description,
        objective,
        status: status as any,
        impactScore,
        confidenceScore,
        effortScore,
        docLink: docLink || null,
        startDate: startDate || null,
        endDate: endDate || null,
        launchDate: launchDate || null,
        analysisDate: analysisDate || null,
        resultado: (resultado || null) as any,
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
      <Modal open onClose={handleClose} maxWidth={720} labelledBy="experimento-form-title">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="experimento-form-title" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            {isEdit ? "Editar Experimento" : "Novo Experimento"}
          </h2>
          <IconButton boxSize={32} onClick={handleClose} aria-label="Fechar">
            <X size={18} />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Seção 1: Informações básicas ─────────── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Informações básicas
            </p>

            <Field label="Nome">
              <Input
                type="text"
                autoFocus
                placeholder="Nome do experimento"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>

            <Field label="Descrição">
              <Textarea
                rows={3}
                style={{ resize: "none" }}
                placeholder="Descreva o experimento"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </Field>

            <Field label="Objetivo / Hipótese">
              <Textarea
                rows={2}
                style={{ resize: "none" }}
                placeholder="Qual hipótese este experimento testa?"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                required
              />
            </Field>

            {/* Datas, resultado e doc só na edição — preenchidos depois de criar */}
            {isEdit && (
              <>
                {/* Datas */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Data Início (opcional)">
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="Data Fim (opcional)">
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </Field>
                </div>

                {/* Data de lançamento + Análise de resultados */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Data de Lançamento (opcional)">
                    <Input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} />
                  </Field>
                  {/* Marco de parada para olhar os resultados do que foi entregue. */}
                  <Field label="Data de Análise de Resultados (opcional)">
                    <Input type="date" value={analysisDate} onChange={(e) => setAnalysisDate(e.target.value)} />
                  </Field>
                </div>

                {/* Resultado */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Resultado (opcional)">
                    <Dropdown
                      value={resultado}
                      options={[
                        { value: "", label: "— A definir —" },
                        ...RESULTADO_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
                      ]}
                      onChange={setResultado}
                      fullWidth
                    />
                  </Field>
                </div>

                <Field label="Link da Documentação (opcional)">
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={docLink}
                    onChange={(e) => setDocLink(e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>

          {/* ── Seção 2: Contexto ─────────────────────── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Contexto
            </p>

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

            {/* Responsáveis, OKR e status só na edição — na criação o status
                nasce sempre como BACKLOG e o resto é preenchido depois */}
            {isEdit && (
              <>
                {/* Responsáveis */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Responsáveis
                  </label>
                  <MemberPicker members={activeMembers} value={memberIds} onChange={setMemberIds} />
                </div>

                {/* OKR + Status */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="OKR Vinculado (Opcional)">
                    <Dropdown
                      value={okrId || ""}
                      options={[
                        { value: "", label: "Nenhum OKR vinculado" },
                        ...okrs.map((o) => ({
                          value: o.id,
                          label:
                            o.objective.length > 50
                              ? o.objective.substring(0, 50) + "…"
                              : o.objective,
                        })),
                      ]}
                      onChange={setOkrId}
                      fullWidth
                    />
                  </Field>
                  <Field label="Status">
                    <Dropdown
                      value={status}
                      options={EXPERIMENTO_STATUS_OPTIONS.map((s) => ({
                        value: s.value,
                        label: s.label,
                      }))}
                      onChange={setStatus}
                      fullWidth
                    />
                  </Field>
                </div>
              </>
            )}
          </div>

          {/* ── Seção 3: Avaliação ICE ─────────────────── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Avaliação ICE{!isEdit && " (opcional)"}
            </p>

            {/* Score buttons */}
            <div className="grid grid-cols-3 gap-4">
              <ScoreButtons label="Impacto" value={impactScore} onChange={setImpactScore} />
              <ScoreButtons label="Confiança" value={confidenceScore} onChange={setConfidenceScore} />
              <ScoreButtons label="Esforço" value={effortScore} onChange={setEffortScore} />
            </div>

            {/* Live preview */}
            <div
              className="flex items-center justify-between gap-4 p-5"
              style={{
                background: iceColors.bg,
                borderRadius: "var(--radius-lg)",
                transition: "background 0.3s ease",
                border: `1px solid ${iceColors.text}22`,
              }}
            >
              <div>
                <p
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: iceColors.text, opacity: 0.7 }}
                >
                  ICE Score
                </p>
                <p
                  className="font-bold leading-none"
                  style={{ color: iceColors.text, fontSize: 44, transition: "color 0.3s ease" }}
                >
                  {liveScore.toFixed(1)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs mb-2" style={{ color: iceColors.text, opacity: 0.7 }}>
                  Ação recomendada
                </p>
                <span
                  className="inline-block text-sm font-semibold px-4 py-2"
                  style={{
                    background: iceColors.text,
                    color: "white",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  {ICE_ACTION_LABELS[liveAction] ?? liveAction}
                </span>
              </div>
            </div>
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
            <Button type="button" variant="secondary" size="md" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={loading}>
              {loading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Salvar Experimento"}
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
