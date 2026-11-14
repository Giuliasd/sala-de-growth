"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "@/components/shared/Toast";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Target,
  Layers,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Info,
  Zap,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ICEBadge } from "@/components/shared/ICEBadge";
import { Avatar } from "@/components/shared/Avatar";
import { InlineMemberField } from "@/components/shared/InlineMemberField";
import { Card } from "@/components/shared/Card";
import { IconButton } from "@/components/shared/IconButton";
import { Alert } from "@/components/shared/Alert";
import {
  InlineTextField,
  InlineTextArea,
  InlineSelectField,
  InlineSelectBadge,
} from "@/components/shared/InlineEdit";
import { TagSelect } from "@/components/shared/TagSelect";
import {
  DATE_INPUT_CLASS,
  DETAIL_TITLE_CLASS,
  DETAIL_TITLE_INPUT_CLASS,
  DetailMetaBar,
  DetailSectionLabel,
  EMPTY_FIELD_CLASS,
  InlineDocLink,
  MetaDivider,
  dateDisplayProps,
} from "@/components/shared/DetailMeta";
import { CheckpointSection } from "@/components/experimentos/CheckpointSection";
import { CommentSection } from "@/components/experimentos/CommentSection";
import { HistoricoDoItem } from "@/components/shared/HistoricoDoItem";
import { ConvertToIniciativaButton } from "@/components/experimentos/ConvertToIniciativaButton";
import { DeleteDetailButton } from "@/components/shared/DeleteDetailButton";
import { updateExperimento, deleteExperimento } from "@/actions/experimentos";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  experimento: {
    id: string;
    name: string;
    description: string;
    objective: string;
    status: string;
    resultado: string | null;
    quarterId: string;
    frenteId: string;
    startDate: string | null;
    endDate: string | null;
    launchDate: string | null;
    analysisDate: string | null;
    okrId: string | null;
    docLink: string | null;
    impactScore: number;
    confidenceScore: number;
    effortScore: number;
    iceScore: number;
    iceAction: string;
    quarter: { quarter: number; year: number };
    frente: { id: string; name: string };
    okr: { id: string; objective: string } | null;
    members: { id: string; name: string }[];
    /** Tags que este item configurou para os próprios checkpoints. */
    checkpointTags: { id: string; name: string; color: string }[];
    checkpoints: Array<{
      id: string;
      name: string;
      description: string | null;
      startDate: string | null;
      dueDate: string;
      isCompleted: boolean;
      completedAt: string | null;
      order: number;
      members: { id: string; name: string }[];
      tags: { id: string; name: string; color: string }[];
      children: Array<{
        id: string;
        name: string;
        description: string | null;
        startDate: string | null;
        dueDate: string;
        isCompleted: boolean;
        completedAt: string | null;
        order: number;
        members: { id: string; name: string }[];
        tags: { id: string; name: string; color: string }[];
        children: Array<{
          id: string;
          name: string;
          description: string | null;
          startDate: string | null;
          dueDate: string;
          isCompleted: boolean;
          completedAt: string | null;
          order: number;
          members: { id: string; name: string }[];
          tags: { id: string; name: string; color: string }[];
          children: never[];
        }>;
      }>;
    }>;
    comments: Array<{
      id: string;
      content: string;
      createdAt: string;
      member: { id: string; name: string };
    }>;
    createdAt: Date;
    updatedAt: Date;
  };
  quarters: { id: string; year: number; quarter: number; isActive: boolean }[];
  frentes: { id: string; name: string; isActive: boolean }[];
  members: { id: string; name: string; isActive: boolean }[];
  okrs: { id: string; objective: string }[];
  currentMemberId: string;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function toDateInput(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}


// ── Resultado badge config ────────────────────────────────────────────────────

const RESULTADO_CONFIG: Record<string, { label: string; classes: string; textColor?: string }> = {
  SUCESSO: { label: "Sucesso", classes: "bg-sage-soft border border-sage", textColor: "var(--color-forest)" },
  PARCIAL: { label: "Parcial", classes: "bg-butter-soft border border-butter", textColor: "var(--butter-strong)" },
  FALHA: { label: "Falha", classes: "bg-blush-soft border border-blush", textColor: "var(--blush-strong)" },
};

// ── Inline score selector ─────────────────────────────────────────────────────

function InlineScoreField({
  value,
  onSave,
  isPending,
  label,
}: {
  value: number;
  onSave: (v: number) => void;
  isPending: boolean;
  label: string;
}) {
  return (
    <div className="text-center p-4 bg-cream rounded-lg space-y-2">
      <p className="text-xs text-ink-soft uppercase font-bold">{label}</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onSave(n)}
            disabled={isPending}
            className={`w-8 h-8 rounded text-sm font-bold transition-all ${
              n === value
                ? "bg-forest text-cream"
                : "bg-paper text-ink-soft hover:bg-forest-soft hover:text-forest border border-line"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}


// ── Main component ────────────────────────────────────────────────────────────

export function ExperimentoDetailView({
  experimento,
  quarters,
  frentes,
  members,
  okrs,
  currentMemberId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  // Aviso quando a troca de quarter desvincula o OKR (era de outro quarter).
  const [okrDetached, setOkrDetached] = useState(false);
  // Preferências de layout desta sessão de leitura (não persistem no banco).
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  // Modo foco esconde a sidebar, que vive no layout — fora da árvore desta
  // página. A ponte é um atributo no body, lido por uma regra em globals.css.
  useEffect(() => {
    if (!focusMode) return;
    document.body.dataset.focusMode = "true";
    // Limpeza obrigatória: sair da página (ou desligar o modo) precisa devolver
    // a sidebar, senão o app fica sem menu.
    return () => {
      delete document.body.dataset.focusMode;
    };
  }, [focusMode]);

  const save = (data: Parameters<typeof updateExperimento>[1]) => {
    startTransition(async () => {
      // A action recusa datas implausíveis (ano fora de 2000–2100) e início
      // depois do fim. Sem mostrar o erro, o campo parecia salvo e não estava.
      const res = await updateExperimento(experimento.id, data);
      if (!res.success) toast(res.error, "error");
    });
  };

  // ── Options ───────────────────────────────────────────────────────────────
  const activeFrentes = frentes.filter((f) => f.isActive);
  const frenteOptions = activeFrentes.map((f) => ({ value: f.id, label: f.name }));
  const currentFrente = frentes.find((f) => f.id === experimento.frenteId);

  const activeMembers = members.filter((m) => m.isActive);

  const okrOptions = [
    { value: "", label: "— nenhum OKR —" },
    ...okrs.map((o) => ({ value: o.id, label: o.objective })),
  ];

  const quarterOptions = quarters.map((q) => ({
    value: q.id,
    label: `Q${q.quarter} ${q.year}`,
  }));

  const resultadoCfg = experimento.resultado ? RESULTADO_CONFIG[experimento.resultado] : null;
  const resultadoOptions = [
    { value: "", label: "— a definir —" },
    { value: "SUCESSO", label: "Sucesso" },
    { value: "PARCIAL", label: "Parcial" },
    { value: "FALHA", label: "Falha" },
  ];

  // O modo foco esconde os comentários independentemente da preferência — que
  // fica guardada e volta a valer ao sair do modo.
  const showComments = commentsOpen && !focusMode;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Navigation */}
      {/* data-voltar-lista: escondido no popup (ver MainContent). */}
      <Link
        href="/experimentos"
        data-voltar-lista
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-forest transition-colors group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Voltar para Experimentos
      </Link>

      {/* Header condensado, igual ao da iniciativa: título em linha cheia
          (pode quebrar sem descolar nada), badges e ações na linha seguinte,
          frente e responsáveis na linha fina de baixo. */}
      <div className="space-y-2">
        {/* Title — inline text edit, linha própria */}
        <div className="min-w-0">
          <InlineTextField
            value={experimento.name}
            onSave={(v) => save({ name: v })}
            isPending={isPending}
            inputClassName={DETAIL_TITLE_INPUT_CLASS}
            displayClassName={DETAIL_TITLE_CLASS}
            placeholder="Nome do experimento"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={experimento.status} type="experimento" itemId={experimento.id} />

          {/* ICE — exclusivo do experimento; o detalhamento fica no card abaixo */}
          <ICEBadge action={experimento.iceAction} iceScore={experimento.iceScore} />

          {/* Resultado — exclusivo do experimento */}
          {resultadoCfg ? (
            <InlineSelectBadge
              value={experimento.resultado ?? ""}
              options={resultadoOptions}
              badgeClassName={resultadoCfg.classes}
              badgeTextColor={resultadoCfg.textColor}
              badgeLabel={resultadoCfg.label}
              onSave={(v) => save({ resultado: v as "SUCESSO" | "PARCIAL" | "FALHA" | "" })}
              isPending={isPending}
            />
          ) : (
            <TagSelect
              value=""
              options={resultadoOptions}
              onChange={(v) => save({ resultado: v as "SUCESSO" | "PARCIAL" | "FALHA" | "" })}
              disabled={isPending}
              title="Definir resultado"
            >
              <span className="badge bg-cream text-ink-soft border border-line cursor-pointer hover:brightness-95 transition-all">
                + resultado
              </span>
            </TagSelect>
          )}

          {/* Quarter — inline select overlay */}
          <InlineSelectBadge
            value={experimento.quarterId}
            options={quarterOptions}
            badgeClassName="bg-cream border border-line"
            badgeTextColor="var(--text-secondary)"
            badgeLabel={`Q${experimento.quarter.quarter} ${experimento.quarter.year}`}
            onSave={(v) => {
              if (v === experimento.quarterId) return;
              // OKR é filtrado por quarter; ao trocar, desvincula o OKR atual.
              setOkrDetached(!!experimento.okrId);
              save({ quarterId: v, okrId: "" });
            }}
            isPending={isPending}
          />

          {/* Actions — empurradas para a direita da própria linha de badges */}
          <div className="shrink-0 flex items-center gap-2 ml-auto">
            <ConvertToIniciativaButton experimentoId={experimento.id} />
            <DeleteDetailButton
              action={() => deleteExperimento(experimento.id)}
              title="Excluir experimento"
              message="Tem certeza que deseja excluir este experimento? Esta ação não pode ser desfeita."
              redirectTo="/experimentos"
            />
          </div>
        </div>

        {/* Frente + responsáveis — linha fina, sem bloco próprio */}
        <div className="flex items-center gap-6 text-sm text-ink-soft flex-wrap">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-forest shrink-0" />
            <InlineSelectField
              value={experimento.frenteId}
              options={frenteOptions}
              onSave={(v) => save({ frenteId: v })}
              isPending={isPending}
              displayLabel={currentFrente?.name ?? "—"}
              displayClassName="text-sm text-ink-soft"
            />
          </div>
          {/* Responsáveis (N:N) */}
          <InlineMemberField
            value={experimento.members.map((m) => m.id)}
            members={activeMembers.map((m) => ({ id: m.id, name: m.name }))}
            onSave={(memberIds) => save({ memberIds })}
            isPending={isPending}
          />
        </div>
      </div>

      {/* Barra de metadados — mesma faixa da iniciativa, no lugar dos cards de
          Período / OKR / Documentação: mesma informação e a mesma edição
          inline, sem gastar três cards de altura para pouco conteúdo. */}
      <DetailMetaBar
        createdLabel="Criado em"
        createdAt={experimento.createdAt}
        updatedLabel="Atualizado em"
        updatedAt={experimento.updatedAt}
        // Dois avisos podem valer ao mesmo tempo, então a faixa recebe uma
        // pilha — e `undefined` quando não há nenhum, para não abrir espaço
        // vazio embaixo dos metadados.
        alert={
          (() => {
            const avisos = [
              okrDetached && !experimento.okrId ? (
                <Alert key="okr" variant="warning">
                  Sem OKR vinculado — o OKR anterior era de outro quarter e foi removido ao trocar o quarter. Vincule um OKR deste quarter.
                </Alert>
              ) : null,
              // Doc é onde mora o contexto que o card não cabe: hipótese,
              // recorte, o que já se sabe. Sem ele, o "Nenhum link
              // disponível" em itálico na faixa era discreto demais para
              // alguém notar que faltava cadastrar.
              !experimento.docLink?.trim() ? (
                <Alert key="doc" variant="warning">
                  Sem documento vinculado. Clique em “Nenhum link disponível”, nesta faixa, para cadastrar o doc do experimento.
                </Alert>
              ) : null,
            ].filter(Boolean);
            if (avisos.length === 0) return undefined;
            return <div className="space-y-2">{avisos}</div>;
          })()
        }
      >
        <>
          {/* Período: início → fim */}
          <span className="flex items-center gap-2 min-w-0">
            <Calendar size={14} className="text-forest shrink-0" />
            <InlineTextField
              value={toDateInput(experimento.startDate)}
              {...dateDisplayProps(experimento.startDate, "Sem data de início")}
              onSave={(v) => save({ startDate: v || null })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
            <span className="text-ink-soft">→</span>
            <InlineTextField
              value={toDateInput(experimento.endDate)}
              {...dateDisplayProps(experimento.endDate, "Sem data de fim")}
              onSave={(v) => save({ endDate: v || null })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
          </span>

          <MetaDivider />

          {/* Lançamento — sem data, o rótulo sai, para não gaguejar
              ("Lançamento · Sem data de lançamento"). */}
          <span className="flex items-center gap-2 min-w-0">
            {experimento.launchDate && <span className="text-ink-soft">Lançamento</span>}
            <InlineTextField
              value={toDateInput(experimento.launchDate)}
              {...dateDisplayProps(experimento.launchDate, "Sem data de lançamento")}
              onSave={(v) => save({ launchDate: v || null })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
          </span>

          <MetaDivider />

          {/* Análise de resultados — quando o time para para olhar o que saiu.
              Mesma edição inline do lançamento; sem data, o rótulo sai. */}
          <span className="flex items-center gap-2 min-w-0">
            {experimento.analysisDate && <span className="text-ink-soft">Análise</span>}
            <InlineTextField
              value={toDateInput(experimento.analysisDate)}
              {...dateDisplayProps(experimento.analysisDate, "Sem data de análise")}
              onSave={(v) => save({ analysisDate: v || null })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
          </span>

          <MetaDivider />

          {/* OKR
 vinculado — objetivo é frase longa; truncado com teto de
              largura para não empurrar o resto da barra para outra linha. */}
          <span className="flex items-center gap-2 min-w-0">
            <Target size={14} className="text-forest shrink-0" />
            <InlineSelectField
              value={experimento.okrId ?? ""}
              options={okrOptions}
              onSave={(v) => {
                setOkrDetached(false);
                save({ okrId: v || "" });
              }}
              isPending={isPending}
              displayLabel={experimento.okr?.objective ?? ""}
              displayTitle={experimento.okr?.objective}
              displayClassName={
                experimento.okr
                  ? "text-sm text-ink font-medium inline-block max-w-[200px] truncate align-bottom"
                  : EMPTY_FIELD_CLASS
              }
              emptyLabel="Sem OKR vinculado"
            />
          </span>

          <MetaDivider />

          {/* Documentação */}
          <span className="flex items-center gap-2 min-w-0">
            <InlineDocLink
              value={experimento.docLink ?? ""}
              onSave={(v) => save({ docLink: v || "" })}
              isPending={isPending}
            />
          </span>
        </>
      </DetailMetaBar>

      {/* Descrição e Objetivo — exclusivos do experimento, agora com o mesmo
          padding e a mesma tipografia de rótulo do resto do produto. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="12px 16px" className="space-y-2">
          <DetailSectionLabel icon={Info}>Descrição</DetailSectionLabel>
          <InlineTextArea
            value={experimento.description}
            onSave={(v) => v.trim().length >= 3 && save({ description: v.trim() })}
            isPending={isPending}
            displayClassName="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap"
            inputClassName="text-sm border border-line rounded-lg px-3 py-2 bg-paper text-ink focus:outline-none focus:border-forest resize-none w-full"
            placeholder="Descrição do experimento..."
            rows={4}
            hint="Ctrl+Enter para salvar"
          />
        </Card>
        <Card padding="12px 16px" className="space-y-2">
          <DetailSectionLabel icon={Zap}>Objetivo</DetailSectionLabel>
          <InlineTextArea
            value={experimento.objective}
            onSave={(v) => v.trim().length >= 3 && save({ objective: v.trim() })}
            isPending={isPending}
            displayClassName="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap"
            inputClassName="text-sm border border-line rounded-lg px-3 py-2 bg-paper text-ink focus:outline-none focus:border-forest resize-none w-full"
            placeholder="Objetivo do experimento..."
            rows={4}
            hint="Ctrl+Enter para salvar"
          />
        </Card>
      </div>

      {/* ICE Breakdown — exclusivo do experimento, editável inline */}
      <Card padding="12px 16px" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <DetailSectionLabel>ICE Breakdown</DetailSectionLabel>
          <span className="text-lg font-mono font-bold text-forest leading-none">
            {experimento.iceScore.toFixed(1)}
            <span className="text-xs font-normal text-ink-soft ml-1">ICE Score</span>
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InlineScoreField
            label="Impacto"
            value={experimento.impactScore}
            onSave={(v) => save({ impactScore: v })}
            isPending={isPending}
          />
          <InlineScoreField
            label="Confiança"
            value={experimento.confidenceScore}
            onSave={(v) => save({ confidenceScore: v })}
            isPending={isPending}
          />
          <InlineScoreField
            label="Esforço"
            value={experimento.effortScore}
            onSave={(v) => save({ effortScore: v })}
            isPending={isPending}
          />
        </div>
      </Card>

      {/* Main Content — comentários recolhíveis: fechados, os checkpoints
          ocupam a largura toda. `items-stretch` + `h-full` nos cards deixa as
          bordas de baixo alinhadas quando um lado tem menos conteúdo. */}
      <div
        className={`grid grid-cols-1 gap-8 items-stretch ${showComments ? "lg:grid-cols-3" : ""}`}
      >
        <div className={showComments ? "lg:col-span-2" : ""}>
          <CheckpointSection
            experimentoId={experimento.id}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            checkpoints={experimento.checkpoints}
            tags={experimento.checkpointTags}
            launchDate={experimento.launchDate}
            headerActions={
              <>
                <IconButton
                  onClick={() => setFocusMode((v) => !v)}
                  title={
                    focusMode
                      ? "Sair do modo foco"
                      : "Modo foco — esconde o menu lateral e o painel de comentários"
                  }
                  aria-label={focusMode ? "Sair do modo foco" : "Entrar no modo foco"}
                  aria-pressed={focusMode}
                >
                  {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </IconButton>
                {/* No modo foco o painel já está fora; o botão sairia sem efeito
                    visível, então não é oferecido. */}
                {!focusMode && (
                  <IconButton
                    onClick={() => setCommentsOpen((v) => !v)}
                    title={
                      commentsOpen
                        ? "Recolher o painel de comentários"
                        : "Mostrar o painel de comentários"
                    }
                    aria-label={commentsOpen ? "Recolher comentários" : "Mostrar comentários"}
                    aria-pressed={commentsOpen}
                  >
                    {commentsOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                  </IconButton>
                )}
              </>
            }
          />
        </div>

        {showComments && (
          <CommentSection
            experimentoId={experimento.id}
            comments={experimento.comments}
            currentMemberId={currentMemberId}
            membros={activeMembers.map((m) => ({ id: m.id, name: m.name }))}
          />
        )}
      </div>

      {/* Histórico: recolhido e carregado só ao abrir. */}
      <HistoricoDoItem entidade="experimento" itemId={experimento.id} />
    </div>
  );
}
