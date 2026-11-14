"use client";

import { useEffect, useState } from "react";
import { Clock, TrendingUp, Pencil, Trash2, ChevronDown, ChevronUp, X, LayoutList, User } from "lucide-react";

// Painel expansível animado (altura + opacidade), só com CSS: a coluna do grid
// vai de 0fr a 1fr, o que anima até a altura do conteúdo sem medir nada. Antes
// era o `motion`, que só servia para isto e pesava no bundle de /okrs.
// O conteúdo só monta ao abrir e desmonta no fim do fechamento, como no
// AnimatePresence: o histórico busca dados quando monta. Com "reduzir
// movimento" o reset global leva a transição a 0,01ms; o transitionend ainda
// dispara e o painel desmonta.
const EXPAND_EASE = "200ms cubic-bezier(0.16, 1, 0.3, 1)";

function ExpandPanel({ show, children }: { show: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const [entered, setEntered] = useState(show);
  // Ajuste durante o render (padrão do React para estado derivado de prop).
  if (show && !mounted) setMounted(true);
  if (!show && entered) setEntered(false);

  // Abre um frame depois de montar, para o navegador ter o 0fr de partida.
  useEffect(() => {
    if (!show || entered) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [show, entered]);

  if (!mounted) return null;
  const open = show && entered;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: `grid-template-rows ${EXPAND_EASE}, opacity ${EXPAND_EASE}`,
      }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && !show) setMounted(false);
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
import { updateOKR, deleteOKR } from "@/actions/okrs";
import { ProgressUpdate } from "./ProgressUpdate";
import { OKRHistory } from "./OKRHistory";
import { OKRLinkedItems } from "./OKRLinkedItems";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Modal } from "@/components/shared/Modal";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { MEASUREMENT_OPTIONS, UNIT_OPTIONS } from "./okr-options";
import { IconButton } from "@/components/shared/IconButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { isIniciativaConcluida } from "@/lib/statusConfig";
import {
  MonthlyBreakdown,
  PaceChip,
  StaleChip,
} from "./OKRTracking";
import {
  daysSince,
  isStale,
  okrDirection,
  paceStatus,
  projectValue,
  projectionMeetsTarget,
  quarterElapsedPercent,
  velocityPerWeek,
} from "@/lib/okr";
import { OKRUnit, OKRMeasurementType } from "@/generated/prisma/enums";

type MemberItem = { id: string; name: string };

type OKRItem = {
  id: string;
  objective: string;
  targetValue: number;
  initialValue: number;
  currentValue: number;
  progressPercent: number;
  unit: OKRUnit;
  measurementType: OKRMeasurementType;
  monthValue1: number | null;
  monthValue2: number | null;
  monthValue3: number | null;
  lastUpdatedAt: Date | string | null;
  members: { id: string; name: string }[];
  frente?: { id: string; name: string } | null;
  quarter: { startDate: Date | string; endDate: Date | string };
  _count: { iniciativas: number; experimentos: number; okrUpdates?: number };
  // Calculados no servidor (ver getObjetivosComRelogio): o que a pessoa pode
  // fazer neste KR. Só escondem botões — quem decide mesmo são as actions.
  podeAtualizar?: boolean;
  podeGerir?: boolean;
  // Histórico recente (mais novo primeiro) — alimenta sparkline, velocidade e
  // projeção.
  okrUpdates?: { id: string; date: Date | string; newValue: number }[];
  // Vinculados com status: KR atrasado com tudo concluído é hipótese furada;
  // atrasado sem nada rodando é falta de execução.
  iniciativas?: { id: string; status: string }[];
  experimentos?: { id: string; status: string }[];
};

// Diz o que some junto com o KR. O histórico é apagado; iniciativas e
// experimentos continuam existindo, só perdem o vínculo.
function mensagemExcluirKR(c: { iniciativas: number; experimentos: number; okrUpdates?: number }): string {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const partes: string[] = [];
  if (c.okrUpdates) partes.push(`apaga ${plural(c.okrUpdates, "atualização", "atualizações")} do histórico`);
  const vinculados = c.iniciativas + c.experimentos;
  if (vinculados > 0) {
    partes.push(
      `deixa ${plural(vinculados, "item vinculado", "itens vinculados")} sem KR (continuam existindo)`
    );
  }
  const efeitos = partes.length > 0 ? ` Isso ${partes.join(" e ")}.` : "";  return `Tem certeza que deseja excluir este KR?${efeitos} Esta ação não pode ser desfeita.`;
}

function timeAgo(date: Date | string | null, now: Date): string {
  if (!date) return "nunca";
  const d = new Date(date as any);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  if (diffDays < 30) return `há ${Math.floor(diffDays / 7)} sem.`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
}

export function formatOKRValue(value: number, unit: string): string {
  if (unit === "REAL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  if (unit === "PORCENTAGEM") {
    return `${value}%`;
  }
  return value.toString();
}

export function OKRCard({
  okr,
  members,
  nowMs,
}: {
  okr: OKRItem;
  members: MemberItem[];
  /** Instante do render vindo do servidor — ver OKRList. */
  nowMs: number;
}) {
  const agora = new Date(nowMs);
  const [showProgress, setShowProgress] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLinked, setShowLinked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [editObjective, setEditObjective] = useState(okr.objective);
  const [editTargetValue, setEditTargetValue] = useState(String(okr.targetValue));
  const [editInitialValue, setEditInitialValue] = useState(String(okr.initialValue));
  const [editUnit, setEditUnit] = useState<OKRUnit>(okr.unit);
  const [editMeasurementType, setEditMeasurementType] = useState<OKRMeasurementType>(okr.measurementType);
  const [editMemberIds, setEditMemberIds] = useState<string[]>(okr.members.map((m) => m.id));
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isMensal = okr.measurementType === "MEDIA_MENSAL";
  // O do formulário de edição pode divergir do KR enquanto se edita.
  const isMonthly = editMeasurementType === "MEDIA_MENSAL";
  const hasLinked = okr._count.iniciativas + okr._count.experimentos > 0;

  function openEdit() {
    setEditObjective(okr.objective);
    setEditTargetValue(String(okr.targetValue));
    setEditInitialValue(String(okr.initialValue));
    setEditUnit(okr.unit);
    setEditMeasurementType(okr.measurementType);
    setEditMemberIds(okr.members.map((m) => m.id));
    setEditError(null);
    setIsEditing(true);
    setShowProgress(false);
    setShowHistory(false);
    setShowLinked(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const targetNum = Number(editTargetValue);
    // O ponto de partida tambem diz a direcao na media mensal (ver lib/okr).
    const initialNum = Number(editInitialValue);
    if (!isMonthly && targetNum === initialNum) {
      setEditError("A meta deve ser diferente do valor inicial.");
      return;
    }
    setEditLoading(true);
    const res = await updateOKR(okr.id, {
      objective: editObjective,
      targetValue: targetNum,
      initialValue: initialNum,
      memberIds: editMemberIds.length > 0 ? editMemberIds : [],
      unit: editUnit,
      measurementType: editMeasurementType,
    });
    setEditLoading(false);
    if (res.success) {
      setIsEditing(false);
    } else {
      setEditError(res.error);
    }
  }

  async function handleDelete() {
    setConfirmingDelete(false);
    setDeleteError(null);
    const res = await deleteOKR(okr.id);
    if (!res.success) setDeleteError(res.error);
  }

  // ── Acompanhamento ────────────────────────────────────────────────────────
  // Progresso sozinho não diz se está bem: a régua é o tempo decorrido do
  // quarter, e a tendência vem do histórico que já está gravado.
  const elapsedPercent = quarterElapsedPercent(okr.quarter.startDate, okr.quarter.endDate, agora);
  const gap = okr.progressPercent - elapsedPercent;
  const pace = paceStatus(okr.progressPercent, elapsedPercent);
  const parado = isStale(okr.lastUpdatedAt, 14, agora);
  const diasSemAtualizar = daysSince(okr.lastUpdatedAt, agora);
  const pontos = (okr.okrUpdates ?? []).map((u) => ({ date: u.date, value: u.newValue }));
  // Arredonda antes de formatar: velocidade e projeção saem de divisões e
  // imprimiriam "840.1013298670964" no card.
  const arredonda = (v: number) => Math.round(v * 10) / 10;
  const velocidadeBruta = velocityPerWeek(pontos);
  const velocidade = velocidadeBruta === null ? null : arredonda(velocidadeBruta);
  // Quantos dos vinculados já terminaram: separa "aposta furada" de "nada
  // rodando" quando o KR está atrasado.
  const vinculadosConcluidos =
    (okr.iniciativas ?? []).filter((i) => isIniciativaConcluida(i.status)).length +
    (okr.experimentos ?? []).filter((e) => e.status === "RESULTADOS_APRESENTADOS").length;
  const projecaoBruta = projectValue({
    currentValue: okr.currentValue,
    velocityPerWeek: velocidadeBruta,
    quarterEnd: okr.quarter.endDate,
    now: agora,
  });
  const projecao = projecaoBruta === null ? null : arredonda(projecaoBruta);
  // CAC e churn caem para bater a meta: comparar sempre com ">=" pintava de
  // vermelho uma projeção que era exatamente o objetivo.
  const tituloDosValores =
    "Atual " +
    formatOKRValue(okr.currentValue, okr.unit) +
    " · Meta " +
    formatOKRValue(okr.targetValue, okr.unit) +
    (okr.initialValue !== 0
      ? " · Partiu de " + formatOKRValue(okr.initialValue, okr.unit)
      : "") +
    " — o progresso conta do ponto de partida até a meta";
  const direcao = okrDirection({
    measurementType: okr.measurementType,
    initialValue: okr.initialValue,
    targetValue: okr.targetValue,
  });

  return (
    <>
      {/* ── Card ─────────────────────────────────────── */}
      <Card interactive padding="20px 24px">
        {/* Row 1: Objective + actions */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <p
              className="text-base font-semibold leading-snug"
              style={{ color: "var(--text-primary)" }}
            >
              {okr.objective}
            </p>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
              {okr.frente && (
                <span
                  className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                  style={{ background: "var(--bg-app)", color: "var(--text-muted)" }}
                >
                  {okr.frente.name}
                </span>
              )}
              {okr.members.length > 0 && (
                <div className="flex items-center gap-1">
                  <User size={11} style={{ color: "var(--text-muted)" }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {okr.members.map((m) => m.name).join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
          {okr.podeGerir !== false && (
            <div className="flex items-center gap-1 shrink-0">
              <IconButton boxSize={32} onClick={openEdit} title="Editar" aria-label="Editar OKR">
                <Pencil size={14} />
              </IconButton>
              <IconButton
                boxSize={32}
                onClick={() => setConfirmingDelete(true)}
                title="Excluir"
                aria-label="Excluir OKR"
                className="icon-btn--danger"
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          )}
        </div>

        {deleteError && (
          <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}>
            {deleteError}
          </p>
        )}

        {/* Row 2: Progresso contra o relógio do quarter */}
        <div className="flex items-center gap-x-3 gap-y-1 mb-2 flex-wrap">
          <ProgressBar
            value={okr.progressPercent}
            variant="dynamic"
            className="flex-1 min-w-[140px]"
            marker={elapsedPercent}
            markerTitle={`${elapsedPercent.toFixed(0)}% do quarter decorrido`}
          />
          {/* Percentual */}
          <span
            className={`text-sm font-bold shrink-0 font-mono tabular-nums ${
              okr.progressPercent <= 33 ? "text-[var(--status-late-text)]" :
              okr.progressPercent <= 66 ? "text-[var(--progress-mid-text)]" : "text-forest"
            }`}
            style={{ minWidth: 46, textAlign: "right" }}
          >
            {Math.max(0, okr.progressPercent).toFixed(1)}%
          </span>
          {/* Valor atual e meta. O par sozinho confundia em KR de redução —
              "11 / 5" com 53,8% de progresso — porque o progresso conta do
              ponto de partida até a meta, e o ponto de partida não aparecia.
              Os rótulos nomeiam cada número; o tooltip traz o de partida. */}
          <span
            className="text-xs shrink-0 font-mono tabular-nums"
            style={{ color: "var(--text-secondary)" }}
            data-tooltip={tituloDosValores}
          >
            <span style={{ opacity: 0.55 }}>atual</span>{" "}
            {formatOKRValue(okr.currentValue, okr.unit)}
            {" · "}
            <span style={{ opacity: 0.55 }}>meta</span>{" "}
            {formatOKRValue(okr.targetValue, okr.unit)}
          </span>
        </div>

        {/* Row 2b: leitura de acompanhamento — ritmo, tendência e projeção */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <PaceChip status={pace} gap={gap} />
          {parado && <StaleChip dias={diasSemAtualizar} />}

          {velocidade !== null && (
            <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
              {velocidade >= 0 ? "+" : ""}
              {formatOKRValue(velocidade, okr.unit)}/sem
            </span>
          )}

          {projecao !== null && (
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
              data-tooltip="Projeção mantendo a velocidade das últimas atualizações até o fim do quarter"
            >
              no ritmo atual:{" "}
              <span
                className="font-mono tabular-nums font-medium"
                style={{
                  color: projectionMeetsTarget(projecao, okr.targetValue, direcao)
                    ? "var(--color-forest)"
                    : "var(--peach-strong)",
                }}
              >
                {formatOKRValue(projecao, okr.unit)}
              </span>{" "}
              de {formatOKRValue(okr.targetValue, okr.unit)}
            </span>
          )}

          {/* Média mensal: os três meses, que a média esconde */}
          {isMensal && (
            <MonthlyBreakdown
              values={[okr.monthValue1, okr.monthValue2, okr.monthValue3]}
              target={okr.targetValue}
              direction={direcao}
              format={(v) => formatOKRValue(v, okr.unit)}
            />
          )}
        </div>

        {/* Row 3: Metadata + action buttons */}
        <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap">
          {/* Last updated */}
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {/* Parado sai do cinza: 2 dias e 40 dias não podem ler igual. */}
            <Clock
              size={12}
              style={{ color: parado ? "var(--butter-strong)" : "var(--text-muted)" }}
            />
            <span
              className="text-xs"
              style={{
                color: parado ? "var(--butter-strong)" : "var(--text-muted)",
                fontWeight: parado ? 500 : undefined,
              }}
            >
              {timeAgo(okr.lastUpdatedAt, agora)}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {okr.podeAtualizar !== false && (
              <button
                onClick={() => { setShowProgress((v) => !v); setShowHistory(false); setShowLinked(false); }}
                className="u-transition inline-flex items-center gap-1.5 text-xs font-medium"
                style={{
                  padding: "5px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: showProgress ? "var(--accent)" : "var(--accent-subtle)",
                  color: showProgress ? "#1A1A1A" : "var(--brand-primary)",
                  cursor: "pointer",
                }}
              >
                <TrendingUp size={12} />
                {showProgress ? "Cancelar" : "Atualizar"}
              </button>
            )}
            {hasLinked && (
              <button
                onClick={() => { setShowLinked((v) => !v); setShowProgress(false); setShowHistory(false); }}
                className="u-transition inline-flex items-center gap-1.5 text-xs font-medium"
                style={{
                  padding: "5px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  background: showLinked ? "var(--bg-app)" : "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <LayoutList size={12} />
                {okr._count.iniciativas + okr._count.experimentos} vinculados
                {vinculadosConcluidos > 0 && (
                  <span style={{ color: "var(--text-muted)" }}>
                    · {vinculadosConcluidos} concl.
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => { setShowHistory((v) => !v); setShowProgress(false); setShowLinked(false); }}
              className="u-transition inline-flex items-center gap-1.5 text-xs font-medium"
              style={{
                padding: "5px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Histórico
            </button>
          </div>
        </div>

        {/* Expand: Progress Update */}
        <ExpandPanel show={showProgress}>
          <ProgressUpdate
            okr={{
              id: okr.id,
              initialValue: okr.initialValue,
              currentValue: okr.currentValue,
              targetValue: okr.targetValue,
              unit: okr.unit,
              measurementType: okr.measurementType,
              monthValue1: okr.monthValue1,
              monthValue2: okr.monthValue2,
              monthValue3: okr.monthValue3,
              quarterStart: okr.quarter.startDate,
              quarterEnd: okr.quarter.endDate,
            }}
            nowMs={nowMs}
            onSuccess={() => setShowProgress(false)}
            onCancel={() => setShowProgress(false)}
          />
        </ExpandPanel>

        {/* Expand: History */}
        <ExpandPanel show={showHistory}>
          <OKRHistory
            okrId={okr.id}
            unit={okr.unit}
            monthly={
              isMensal
                ? {
                    target: okr.targetValue,
                    direction: direcao,
                    quarterStart: okr.quarter.startDate,
                    quarterEnd: okr.quarter.endDate,
                  }
                : undefined
            }
          />
        </ExpandPanel>

        {/* Expand: Linked iniciativas & experimentos */}
        <ExpandPanel show={showLinked}>
          <OKRLinkedItems okrId={okr.id} />
        </ExpandPanel>
      </Card>

      {/* ── Edit modal ────────────────────────────────── */}
      <Modal open={isEditing} onClose={() => setIsEditing(false)} labelledBy="okr-edit-title">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="okr-edit-title" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Editar OKR
          </h2>
          <IconButton boxSize={32} onClick={() => setIsEditing(false)} aria-label="Fechar">
            <X size={18} />
          </IconButton>
        </div>

        <form onSubmit={handleUpdate} className="space-y-5">
          <Field label="Objetivo">
            <Textarea
              autoFocus
              rows={3}
              style={{ resize: "none" }}
              value={editObjective}
              onChange={(e) => setEditObjective(e.target.value)}
              required
            />
          </Field>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Responsável
            </label>
            <MemberPicker members={members} value={editMemberIds} onChange={setEditMemberIds} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Unidade de Medida">
              <Dropdown
                value={editUnit}
                options={UNIT_OPTIONS}
                onChange={(v) => setEditUnit(v as OKRUnit)}
                fullWidth
              />
            </Field>
            <Field label="Tipo de Meta">
              <Dropdown
                value={editMeasurementType}
                options={MEASUREMENT_OPTIONS}
                onChange={(v) => setEditMeasurementType(v as OKRMeasurementType)}
                fullWidth
              />
            </Field>
          </div>

          {editMeasurementType === "MEDIA_MENSAL" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              O valor do OKR é a média dos meses do quarter. Preencha os meses pelo botão
              <strong> Atualizar</strong>. Trocar o tipo pode zerar o progresso até preencher.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label={isMonthly ? "Ponto de partida (opcional)" : "Valor Inicial"}>
              <Input
                type="number"
                step="any"
                value={editInitialValue}
                onChange={(e) => setEditInitialValue(e.target.value)}
                required={!isMonthly}
              />
            </Field>
            <Field label="Meta">
              <Input
                type="number"
                step="any"
                value={editTargetValue}
                onChange={(e) => setEditTargetValue(e.target.value)}
                required
              />
            </Field>
          </div>

          {editError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}>
              {editError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={editLoading}>
              {editLoading ? "Salvando..." : "Salvar OKR"}
            </Button>
          </div>
        </form>
      </Modal>

      {confirmingDelete && (
        <ConfirmDialog
          title="Excluir OKR"
          message={mensagemExcluirKR(okr._count)}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
