"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "@/components/shared/Toast";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Target,
  ExternalLink,
  Layers,
  Clock,
  Pencil,
  Check,
  X,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge, PriorityType } from "@/components/shared/PriorityBadge";
import { Avatar } from "@/components/shared/Avatar";
import { InlineMemberField } from "@/components/shared/InlineMemberField";
import { IconButton } from "@/components/shared/IconButton";
import { Alert } from "@/components/shared/Alert";
import {
  InlineTextField,
  InlineSelectField,
  InlineSelectBadge,
} from "@/components/shared/InlineEdit";
import { SelectCheckbox } from "@/components/shared/BulkEditBar";
import {
  DATE_INPUT_CLASS,
  DetailMetaBar,
  DETAIL_TITLE_CLASS,
  DETAIL_TITLE_INPUT_CLASS,
  EMPTY_FIELD_CLASS,
  InlineDocLink,
  MetaDivider,
  dateDisplayProps,
} from "@/components/shared/DetailMeta";
import { CheckpointSection } from "@/components/iniciativas/CheckpointSection";
import { CommentSection } from "@/components/iniciativas/CommentSection";
import { HistoricoDoItem } from "@/components/shared/HistoricoDoItem";
import { ConvertToExperimentoButton } from "@/components/iniciativas/ConvertToExperimentoButton";
import { DeleteDetailButton } from "@/components/shared/DeleteDetailButton";
import { updateIniciativa, deleteIniciativa } from "@/actions/iniciativas";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  iniciativa: {
    id: string;
    name: string;
    status: string;
    priority: string;
    resultado: string | null;
    quarterId: string;
    frenteId: string;
    startDate: Date | null;
    endDate: Date | null;
    launchDate: Date | null;
    analysisDate: Date | null;
    okrId: string | null;
    docLink: string | null;
    precisaApresentarResultados: boolean;
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
      updatedAt: string;
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

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDate(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toDateInput(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function formatFullDate(date: Date): string {
  if (!date || isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Priority badge config ─────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; className: string; textColor?: string }> = {
  URGENTE: { label: "Urgente", className: "bg-peach-soft border border-peach", textColor: "var(--peach-strong)" },
  ALTA: { label: "Alta", className: "bg-butter-soft border border-butter", textColor: "var(--butter-strong)" },
  MEDIA: { label: "Média", className: "bg-sky-soft border border-sky", textColor: "var(--sky-strong)" },
  BAIXA: { label: "Baixa", className: "bg-cream text-ink-soft border border-line" },
};

// ── Main component ────────────────────────────────────────────────────────────

export function IniciativaDetailView({
  iniciativa,
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

  const save = (data: Parameters<typeof updateIniciativa>[1]) => {
    startTransition(async () => {
      // A action recusa datas implausíveis (ano fora de 2000–2100) e início
      // depois do fim. Sem mostrar o erro, o campo parecia salvo e não estava.
      const res = await updateIniciativa(iniciativa.id, data);
      if (!res.success) toast(res.error, "error");
    });
  };

  // ── Status badge (uses existing StatusBadge interactive mode) ──────────────

  // ── Priority badge values ───────────────────────────────────────────────────
  const priorityCfg = PRIORITY_CONFIG[iniciativa.priority] ?? PRIORITY_CONFIG.MEDIA;
  const priorityOptions = [
    { value: "URGENTE", label: "Urgente" },
    { value: "ALTA", label: "Alta" },
    { value: "MEDIA", label: "Média" },
    { value: "BAIXA", label: "Baixa" },
  ];

  // ── Frente options ─────────────────────────────────────────────────────────
  const activeFrentes = frentes.filter((f) => f.isActive);
  const frenteOptions = activeFrentes.map((f) => ({ value: f.id, label: f.name }));
  const currentFrente = frentes.find((f) => f.id === iniciativa.frenteId);

  // ── Member options ─────────────────────────────────────────────────────────
  const activeMembers = members.filter((m) => m.isActive);

  // ── Quarter options ──────────────────────────────────────────────────────────
  const quarterOptions = quarters.map((q) => ({
    value: q.id,
    label: `Q${q.quarter} ${q.year}`,
  }));

  // ── OKR options ────────────────────────────────────────────────────────────
  const okrOptions = [
    { value: "", label: "— nenhum OKR —" },
    ...okrs.map((o) => ({ value: o.id, label: o.objective })),
  ];

  // O modo foco esconde os comentários independentemente da preferência — que
  // fica guardada e volta a valer ao sair do modo.
  const showComments = commentsOpen && !focusMode;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Navigation — linha própria, fina */}
      {/* data-voltar-lista: escondido no popup (MainContent), que já tem o
          "Voltar" dele — dois "voltar" empilhados apontando para lugares
          diferentes. */}
      <Link
        href="/iniciativas"
        data-voltar-lista
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-forest transition-colors group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Voltar para Iniciativas
      </Link>

      {/* Header condensado: título em linha cheia (pode quebrar em 2+ linhas
          sem descolar nada), badges e ações na linha seguinte, frente e
          responsáveis na linha fina de baixo. Dividir o título dos badges é o
          que corrige o desalinhamento com título longo — antes os badges
          ancoravam na primeira linha do título. */}
      <div className="space-y-2">
        {/* Title — inline text edit, linha própria */}
        <div className="min-w-0">
          <InlineTextField
            value={iniciativa.name}
            onSave={(v) => save({ name: v })}
            isPending={isPending}
            inputClassName={DETAIL_TITLE_INPUT_CLASS}
            displayClassName={DETAIL_TITLE_CLASS}
            inputType="text"
            placeholder="Nome da iniciativa"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Status — uses existing StatusBadge interactive select overlay */}
          <StatusBadge
            status={iniciativa.status}
            type="iniciativa"
            itemId={iniciativa.id}
          />

          {/* Priority — inline select overlay */}
          <InlineSelectBadge
            value={iniciativa.priority as PriorityType}
            options={priorityOptions}
            badgeClassName={priorityCfg.className}
            badgeTextColor={priorityCfg.textColor}
            badgeLabel={priorityCfg.label}
            onSave={(v) =>
              save({ priority: v as "URGENTE" | "ALTA" | "MEDIA" | "BAIXA" })
            }
            isPending={isPending}
          />

          {/* Quarter — inline select overlay */}
          <InlineSelectBadge
            value={iniciativa.quarterId}
            options={quarterOptions}
            badgeClassName="bg-cream border border-line"
            badgeTextColor="var(--text-secondary)"
            badgeLabel={`Q${iniciativa.quarter.quarter} ${iniciativa.quarter.year}`}
            onSave={(v) => {
              if (v === iniciativa.quarterId) return;
              // OKR é filtrado por quarter; ao trocar, desvincula o OKR atual.
              setOkrDetached(!!iniciativa.okrId);
              save({ quarterId: v, okrId: "" });
            }}
            isPending={isPending}
          />

          {/* Actions — empurradas para a direita da própria linha de badges */}
          <div className="shrink-0 flex items-center gap-2 ml-auto">
            <ConvertToExperimentoButton iniciativaId={iniciativa.id} />
            <DeleteDetailButton
              action={() => deleteIniciativa(iniciativa.id)}
              title="Excluir iniciativa"
              message="Tem certeza que deseja excluir esta iniciativa? Esta ação não pode ser desfeita."
              redirectTo="/iniciativas"
            />
          </div>
        </div>

        {/* Frente + responsáveis — linha fina, sem bloco próprio */}
        <div className="flex items-center gap-6 text-sm text-ink-soft flex-wrap">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-forest shrink-0" />
            <InlineSelectField
              value={iniciativa.frenteId}
              options={frenteOptions}
              onSave={(v) => save({ frenteId: v })}
              isPending={isPending}
              displayLabel={currentFrente?.name ?? "—"}
              displayClassName="text-sm text-ink-soft"
            />
          </div>

          {/* Responsáveis (N:N) */}
          <InlineMemberField
            value={iniciativa.members.map((m) => m.id)}
            members={activeMembers.map((m) => ({ id: m.id, name: m.name }))}
            onSave={(memberIds) => save({ memberIds })}
            isPending={isPending}
          />
        </div>
      </div>

      {/* Barra de metadados — substitui os três cards (Período / OKR /
          Documentação). Mesma informação e a mesma edição inline, em uma faixa
          só: os cards gastavam altura de sobra para pouco conteúdo. Quebra em
          várias linhas em tela estreita, sem scroll horizontal. */}
      <DetailMetaBar
        createdLabel="Criada em"
        createdAt={iniciativa.createdAt}
        updatedLabel="Atualizada em"
        updatedAt={iniciativa.updatedAt}
        // Dois avisos podem valer ao mesmo tempo, então a faixa recebe uma
        // pilha — e `undefined` quando não há nenhum, para não abrir espaço
        // vazio embaixo dos metadados.
        alert={
          (() => {
            const avisos = [
              okrDetached && !iniciativa.okrId ? (
                <Alert key="okr" variant="warning">
                  Sem OKR vinculado — o OKR anterior era de outro quarter e foi removido ao trocar o quarter. Vincule um OKR deste quarter.
                </Alert>
              ) : null,
              // Doc é onde mora o contexto que o card não cabe: hipótese,
              // recorte, o que já se sabe. Sem ele, o "Nenhum link
              // disponível" em itálico na faixa era discreto demais para
              // alguém notar que faltava cadastrar.
              !iniciativa.docLink?.trim() ? (
                <Alert key="doc" variant="warning">
                  Sem documento vinculado. Clique em “Nenhum link disponível”, nesta faixa, para cadastrar o doc da iniciativa.
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
              value={toDateInput(iniciativa.startDate)}
              {...dateDisplayProps(iniciativa.startDate, "Sem data de início")}
              onSave={(v) => save({ startDate: v || "" })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
            <span className="text-ink-soft">→</span>
            <InlineTextField
              value={toDateInput(iniciativa.endDate)}
              {...dateDisplayProps(iniciativa.endDate, "Sem data de fim")}
              onSave={(v) => save({ endDate: v || "" })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
          </span>

          <MetaDivider />

          {/* Lançamento — rótulo em texto, para não inventar ícone novo. Sem
              data, o rótulo sai: "Lançamento · Sem data de lançamento" gagueja
              e é justamente o que empurrava "Apresentar na review" para uma
              linha sozinha. */}
          <span className="flex items-center gap-2 min-w-0">
            {iniciativa.launchDate && <span className="text-ink-soft">Lançamento</span>}
            <InlineTextField
              value={toDateInput(iniciativa.launchDate)}
              {...dateDisplayProps(iniciativa.launchDate, "Sem data de lançamento")}
              onSave={(v) => save({ launchDate: v || "" })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
          </span>

          <MetaDivider />

          {/* Análise de resultados — quando o time para para olhar o que saiu.
              Mesma edição inline do lançamento; sem data, o rótulo sai. */}
          <span className="flex items-center gap-2 min-w-0">
            {iniciativa.analysisDate && <span className="text-ink-soft">Análise</span>}
            <InlineTextField
              value={toDateInput(iniciativa.analysisDate)}
              {...dateDisplayProps(iniciativa.analysisDate, "Sem data de análise")}
              onSave={(v) => save({ analysisDate: v || "" })}
              isPending={isPending}
              inputType="date"
              inputClassName={DATE_INPUT_CLASS}
            />
          </span>

          <MetaDivider />

          {/* OKR
 vinculado — objetivo é frase longa ("Reduzir o CAC blended de
              R$ 95 para R$ 60"); truncado com teto de largura para não empurrar
              o resto da barra para uma linha quebrada. O texto inteiro fica no
              title. */}
          <span className="flex items-center gap-2 min-w-0">
            <Target size={14} className="text-forest shrink-0" />
            <InlineSelectField
              value={iniciativa.okrId ?? ""}
              options={okrOptions}
              onSave={(v) => {
                setOkrDetached(false);
                save({ okrId: v || "" });
              }}
              isPending={isPending}
              displayLabel={iniciativa.okr?.objective ?? ""}
              displayTitle={iniciativa.okr?.objective}
              displayClassName={
                iniciativa.okr
                  ? // inline-block é requisito do truncate: em span inline o
                    // overflow não recorta.
                    "text-sm text-ink font-medium inline-block max-w-[200px] truncate align-bottom"
                  : EMPTY_FIELD_CLASS
              }
              emptyLabel="Sem OKR vinculado"
            />
          </span>

          <MetaDivider />

          {/* Documentação */}
          <span className="flex items-center gap-2 min-w-0">
            <InlineDocLink
              value={iniciativa.docLink ?? ""}
              onSave={(v) => save({ docLink: v || "" })}
              isPending={isPending}
            />
          </span>

          <MetaDivider />

          {/* Apresentar resultados na review semanal */}
          <span className="flex items-center gap-2">
            <SelectCheckbox
              checked={iniciativa.precisaApresentarResultados}
              onToggle={() =>
                !isPending &&
                save({ precisaApresentarResultados: !iniciativa.precisaApresentarResultados })
              }
              ariaLabel="Apresentar resultados na review semanal"
              title="Quando marcado, a iniciativa aparece na Review semanal (Rituais)"
            />
            <span
              className="cursor-pointer select-none"
              style={{ color: "var(--text-secondary)" }}
              onClick={() =>
                !isPending &&
                save({ precisaApresentarResultados: !iniciativa.precisaApresentarResultados })
              }
            >
              Apresentar na review
            </span>
          </span>

        </>
      </DetailMetaBar>
      {/* Main Content Sections — comentários recolhíveis: fechados, os
          checkpoints ocupam a largura toda. `items-stretch` + `h-full` nos
          cards deixa as bordas de baixo alinhadas quando um lado tem menos
          conteúdo que o outro. */}
      <div
        className={`grid grid-cols-1 gap-8 items-stretch ${showComments ? "lg:grid-cols-3" : ""}`}
      >
        <div className={showComments ? "lg:col-span-2" : ""}>
          <CheckpointSection
            initiativeId={iniciativa.id}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            checkpoints={iniciativa.checkpoints}
            tags={iniciativa.checkpointTags}
            launchDate={iniciativa.launchDate}
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
            initiativeId={iniciativa.id}
            comments={iniciativa.comments}
            currentMemberId={currentMemberId}
            membros={activeMembers.map((m) => ({ id: m.id, name: m.name }))}
          />
        )}
      </div>

      {/* Histórico: recolhido e carregado só ao abrir. */}
      <HistoricoDoItem entidade="iniciativa" itemId={iniciativa.id} />

    </div>
  );
}

