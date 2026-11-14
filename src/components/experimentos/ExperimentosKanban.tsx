"use client";

import { useState } from "react";
import { Zap, ArrowRight, Inbox, Archive, Info } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { toast } from "@/components/shared/Toast";
import type { ExperimentoItem } from "./ExperimentoCard";
import { ICE_ACTION_LABELS } from "./ExperimentoCard";
import { AjustarScoresModal } from "./AjustarScoresModal";
import { calculateICEScore, getICEAction } from "@/lib/ice";
import { IceAction } from "@/generated/prisma/enums";
import dynamic from "next/dynamic";

// Formulário só abre sob demanda (modal): fica fora do bundle inicial da tela.
const ExperimentoForm = dynamic(
  () => import("@/components/experimentos/ExperimentoForm").then((m) => ({ default: m.ExperimentoForm })),
  { ssr: false }
);

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };
type OKRItem = { id: string; objective: string };

interface ExperimentosKanbanProps {
  experimentos: ExperimentoItem[];
  acaoIceFilter: string[];
  onSetListView: () => void;
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  okrs: OKRItem[];
  /** Visitante só lê: nada de arrastar card nem abrir o ajuste de scores. */
  canEdit?: boolean;
}

export function ExperimentosKanban({
  experimentos,
  acaoIceFilter,
  onSetListView,
  quarters,
  frentes,
  members,
  okrs,
  canEdit = true,
}: ExperimentosKanbanProps) {
  const [modalState, setModalState] = useState<{
    experimento: ExperimentoItem;
    acaoDestino: IceAction;
  } | null>(null);

  const [editTarget, setEditTarget] = useState<ExperimentoItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Cópia local para o movimento otimista: ao confirmar os scores no modal, o
  // card muda de coluna na hora, sem esperar o revalidate do servidor.
  const [items, setItems] = useState(experimentos);
  const [prevExperimentos, setPrevExperimentos] = useState(experimentos);
  if (prevExperimentos !== experimentos) {
    setPrevExperimentos(experimentos);
    setItems(experimentos);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const columnsConfig = [
    {
      iceAction: IceAction.EXECUTAR_AGORA,
      title: "Executar Agora",
      icon: Zap,
      accentColor: "peach" as const,
      emptyMessage: "Nada urgente agora",
    },
    {
      iceAction: IceAction.EM_SEGUIDA,
      title: "Em Seguida",
      icon: ArrowRight,
      accentColor: "butter" as const,
      emptyMessage: "Fila vazia por aqui",
    },
    {
      iceAction: IceAction.BACKLOG,
      title: "Backlog",
      icon: Inbox,
      accentColor: "sky" as const,
      emptyMessage: "Sem ideias no banco",
    },
    {
      iceAction: IceAction.ARQUIVAR,
      title: "Arquivar",
      icon: Archive,
      accentColor: "line" as const,
      emptyMessage: "Nada pra arquivar",
    },
  ];

  const columnsToRender =
    acaoIceFilter.length > 0
      ? columnsConfig.filter((c) => acaoIceFilter.includes(c.iceAction))
      : columnsConfig;

  // Grouping and sorting
  const groupedExperimentos = columnsToRender.reduce((acc, col) => {
    acc[col.iceAction] = items
      .filter((exp) => exp.iceAction === col.iceAction)
      .sort((a, b) => {
        if (a.iceScore !== b.iceScore) return b.iceScore - a.iceScore;
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      });
    return acc;
  }, {} as Record<string, ExperimentoItem[]>);

  const activeExperimento = activeId ? items.find((e) => e.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !canEdit) return;

    const experimentoId = active.id as string;
    const acaoDestino = over.id as IceAction;

    const experimento = items.find((e) => e.id === experimentoId);
    if (!experimento || experimento.iceAction === acaoDestino) return;

    // A coluna é derivada do ICE, não gravada: mudar de coluna significa
    // revisar os scores — daí o modal em vez de um update direto.
    setModalState({ experimento, acaoDestino });
  }

  /**
   * Scores salvos: reflete na hora o novo ICE e a coluna que ele implica. O
   * servidor revalida em seguida e substitui esta cópia local.
   */
  function handleScoresSaved(
    id: string,
    scores: { impactScore: number; confidenceScore: number; effortScore: number }
  ) {
    const iceScore = calculateICEScore(
      scores.impactScore,
      scores.confidenceScore,
      scores.effortScore
    );
    const iceAction = getICEAction(iceScore);
    setItems((cur) =>
      cur.map((e) => (e.id === id ? { ...e, ...scores, iceScore, iceAction } : e))
    );
    setModalState(null);
    toast(`Experimento movido para ${ICE_ACTION_LABELS[iceAction] ?? iceAction}.`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Aviso de tela estreita — uma linha, com a saída ao lado */}
      <div
        className="md:hidden flex items-center gap-2 flex-wrap px-3 py-2 rounded-md border text-xs"
        style={{
          background: "var(--butter-soft)",
          borderColor: "var(--butter)",
          // butter-soft é claro nos dois temas — o texto precisa ser escuro fixo
          // (token -strong), senão no dark o text-primary vira quase branco e some.
          color: "var(--butter-strong)",
        }}
      >
        <Info size={14} className="shrink-0" style={{ color: "var(--butter-strong)" }} />
        <span>O board rola de lado nesta largura.</span>
        <button
          type="button"
          onClick={onSetListView}
          className="font-semibold underline underline-offset-2"
          style={{ color: "var(--butter-strong)", background: "none", border: "none", cursor: "pointer" }}
        >
          ver em lista
        </button>
      </div>

      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Experimentos organizados pela ação sugerida pelo ICE.
        {canEdit ? " Arraste um card para outra coluna — os scores são revisados na hora." : ""}
      </p>

      <DndContext
        id="kanban-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart: () => `Arrastando experimento`,
            onDragOver: ({ over }) => over ? `Sobre a coluna ${over.id}` : 'Fora de uma coluna',
            onDragEnd: ({ over }) => over ? `Solto sobre ${over.id}. Modal de ajuste aberto.` : 'Arraste cancelado',
            onDragCancel: () => 'Arraste cancelado',
          }
        }}
      >
        {/* Board horizontal: colunas de largura fixa lado a lado. Em grade elas
            quebravam em 2×2 e o quadro deixava de ler como quadro. */}
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 items-start" style={{ width: "max-content", minWidth: "100%" }}>
            {columnsToRender.map((col) => (
              <KanbanColumn
                key={col.iceAction}
                iceAction={col.iceAction}
                title={col.title}
                emptyMessage={col.emptyMessage}
                experimentos={groupedExperimentos[col.iceAction] || []}
                onEdit={(exp) => setEditTarget(exp)}
                canEdit={canEdit}
              />
            ))}
          </div>
        </div>

        {/* Cópia sob o cursor: sem ela o card só ficava translúcido no lugar e
            não dava para ver onde ele ia cair. */}
        <DragOverlay dropAnimation={null}>
          {activeExperimento ? (
            <KanbanCard experimento={activeExperimento} canEdit={canEdit} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {modalState && (
        <AjustarScoresModal
          open={true}
          experimento={modalState.experimento}
          acaoDestino={modalState.acaoDestino}
          onClose={() => setModalState(null)}
          onSuccess={(scores) => handleScoresSaved(modalState.experimento.id, scores)}
        />
      )}

      {editTarget && (
        <ExperimentoForm
          mode="edit"
          experimento={editTarget}
          quarters={quarters}
          frentes={frentes}
          members={members}
          initialOkrs={okrs}
          selectedQuarterId={editTarget.quarterId}
          onSuccess={() => {
            setEditTarget(null);
          }}
          onCancel={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
