"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/shared/Card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ResultadoSelect } from "@/components/shared/ResultadoSelect";
import { ActivityItemCard } from "@/components/shared/ActivityItemCard";
import { formatDayMonthNumeric } from "@/lib/date-utils";
import { toast } from "@/components/shared/Toast";
import { updateExperimentoStatus } from "@/actions/experimentos";
import { updateIniciativaStatus } from "@/actions/iniciativas";
import { ExperimentoStatus, IniciativaStatus } from "@/generated/prisma/enums";
import type { RitualExperimento, RitualIniciativa, RitualQuarter } from "@/actions/rituais";

// Etapas do fluxo de execução (Backlog e Arquivado ficam fora).
const STAGES: { status: string; emptyMessage: string }[] = [
  { status: "EM_ANDAMENTO", emptyMessage: "Nada em andamento" },
  { status: "AGUARDANDO_RESULTADOS", emptyMessage: "Nada aguardando" },
  { status: "RELATORIO_PRONTO", emptyMessage: "Nenhum relatório pronto" },
  { status: "RESULTADOS_APRESENTADOS", emptyMessage: "Nada apresentado" },
];

// A iniciativa entra na coluna equivalente à sua própria situação. As etapas do
// kanban usam as chaves de status de experimento, então mapeamos os status de
// iniciativa para a coluna correspondente (fallback: Em Andamento).
const INICIATIVA_STATUS_TO_STAGE: Record<string, string> = {
  EM_ANDAMENTO: "EM_ANDAMENTO",
  ESCREVENDO_RELATORIO: "AGUARDANDO_RESULTADOS",
  RELATORIO_FINALIZADO: "RELATORIO_PRONTO",
  CONCLUIDA: "RESULTADOS_APRESENTADOS",
};
function iniciativaStage(status: string): string {
  return INICIATIVA_STATUS_TO_STAGE[status] ?? "EM_ANDAMENTO";
}

// Reverso: ao arrastar a iniciativa para uma coluna, o status dela vira o
// equivalente àquela etapa.
const STAGE_TO_INICIATIVA_STATUS: Record<string, IniciativaStatus> = {
  EM_ANDAMENTO: IniciativaStatus.EM_ANDAMENTO,
  AGUARDANDO_RESULTADOS: IniciativaStatus.ESCREVENDO_RELATORIO,
  RELATORIO_PRONTO: IniciativaStatus.RELATORIO_FINALIZADO,
  RESULTADOS_APRESENTADOS: IniciativaStatus.CONCLUIDA,
};

// Prefixo no id de drag para diferenciar iniciativa de experimento no drop.
const INI_DRAG_PREFIX = "ini:";

export function ExperimentsByStage({
  experimentos,
  iniciativasParaApresentar,
  quarter,
  canEdit,
}: {
  experimentos: RitualExperimento[];
  iniciativasParaApresentar: RitualIniciativa[];
  quarter: RitualQuarter | null;
  canEdit: boolean;
}) {
  const [items, setItems] = useState(experimentos);
  const [inis, setInis] = useState(iniciativasParaApresentar);
  // Acompanha os dados do servidor (troca de quarter, edição no popup de
  // detalhe, mudança feita em outra tela). Sem isso só o arrasto mexia na
  // lista e o resto exigia recarregar a página.
  const [prevProps, setPrevProps] = useState({ experimentos, iniciativasParaApresentar });
  if (
    prevProps.experimentos !== experimentos ||
    prevProps.iniciativasParaApresentar !== iniciativasParaApresentar
  ) {
    setPrevProps({ experimentos, iniciativasParaApresentar });
    setItems(experimentos);
    setInis(iniciativasParaApresentar);
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overStage = String(over.id);

    // Iniciativa: o id do drag vem prefixado. A coluna alvo vira o status
    // equivalente da iniciativa.
    if (activeId.startsWith(INI_DRAG_PREFIX)) {
      const iniId = activeId.slice(INI_DRAG_PREFIX.length);
      const ini = inis.find((i) => i.id === iniId);
      const newStatus = STAGE_TO_INICIATIVA_STATUS[overStage];
      if (!ini || !newStatus || iniciativaStage(ini.status) === overStage) return;

      const prevStatus = ini.status;
      setInis((cur) => cur.map((i) => (i.id === iniId ? { ...i, status: newStatus } : i)));
      const res = await updateIniciativaStatus(iniId, newStatus);
      if (!res.success) {
        setInis((cur) => cur.map((i) => (i.id === iniId ? { ...i, status: prevStatus } : i)));
        toast(res.error, "error");
      } else {
        toast("Situação da iniciativa atualizada.");
      }
      return;
    }

    const expId = activeId;
    const exp = items.find((e) => e.id === expId);
    if (!exp || exp.status === overStage) return;

    const prevStatus = exp.status;
    // Update otimista — reflete na hora; reverte se a action falhar.
    setItems((cur) => cur.map((e) => (e.id === expId ? { ...e, status: overStage } : e)));
    const res = await updateExperimentoStatus(expId, overStage as ExperimentoStatus);
    if (!res.success) {
      setItems((cur) => cur.map((e) => (e.id === expId ? { ...e, status: prevStatus } : e)));
      toast(res.error, "error");
    } else {
      toast("Etapa do experimento atualizada.");
    }
  }

  const byStage = new Map<string, RitualExperimento[]>();
  for (const exp of items) {
    const list = byStage.get(exp.status) ?? [];
    list.push(exp);
    byStage.set(exp.status, list);
  }

  // Iniciativas marcadas "precisa apresentar" entram na coluna equivalente à
  // sua situação.
  const iniByStage = new Map<string, RitualIniciativa[]>();
  for (const ini of inis) {
    const stage = iniciativaStage(ini.status);
    const list = iniByStage.get(stage) ?? [];
    list.push(ini);
    iniByStage.set(stage, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {quarter && (
          <>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              Q{quarter.quarter} {quarter.year}
            </span>{" "}
            · {formatDayMonthNumeric(quarter.startDate)} – {formatDayMonthNumeric(quarter.endDate)} ·{" "}
          </>
        )}
        experimentos ativos organizados pela etapa em que estão.
        {canEdit ? " Arraste um card para mudar a etapa." : ""}
      </p>

      <DndContext
        id="rituais-experimentos-kanban"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((stage) => (
            <StageColumn
              key={stage.status}
              status={stage.status}
              emptyMessage={stage.emptyMessage}
              items={byStage.get(stage.status) ?? []}
              iniciativas={iniByStage.get(stage.status) ?? []}
              canEdit={canEdit}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function StageColumn({
  status,
  emptyMessage,
  items,
  iniciativas,
  canEdit,
}: {
  status: string;
  emptyMessage: string;
  items: RitualExperimento[];
  iniciativas: RitualIniciativa[];
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const total = items.length + iniciativas.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho da etapa */}
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={status} type="experimento" />
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {total}
        </span>
      </div>

      {/* Área de drop */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-2.5 rounded-xl u-transition"
        style={{
          minHeight: 120,
          padding: 4,
          background: isOver ? "var(--accent-subtle)" : "transparent",
          outline: isOver ? "1px dashed var(--accent)" : "1px solid transparent",
        }}
      >
        {total === 0 ? (
          <Card padding="16px" className="flex items-center justify-center">
            <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
              {emptyMessage}
            </p>
          </Card>
        ) : (
          <>
            {iniciativas.map((ini) => (
              <IniciativaStageCard key={ini.id} ini={ini} canEdit={canEdit} />
            ))}
            {items.map((exp) => (
              <StageCard key={exp.id} exp={exp} canEdit={canEdit} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// Card de iniciativa dentro do kanban da Review semanal. Arrastável (como os
// experimentos): mover entre colunas troca o status da iniciativa para o
// equivalente da etapa. O id do drag é prefixado para distinguir do experimento;
// um selo "Iniciativa" ao lado da frente deixa claro o tipo.
function IniciativaStageCard({ ini, canEdit }: { ini: RitualIniciativa; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${INI_DRAG_PREFIX}${ini.id}`,
    disabled: !canEdit,
  });
  // Visitantes não são exibidos como responsáveis.
  const showMembers = ini.members.filter((m) => m.role !== "VISITANTE");

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 100 : undefined,
        touchAction: canEdit ? "none" : undefined,
      }}
      className={canEdit ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}
    >
      <ActivityItemCard kind="iniciativa" name={ini.name} members={showMembers} detailId={ini.id}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5"
            style={{
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-subtle)",
              color: "var(--brand-primary)",
            }}
          >
            Iniciativa
          </span>
          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {ini.frente.name}
          </span>
        </div>
      </ActivityItemCard>
    </div>
  );
}

function StageCard({ exp, canEdit }: { exp: RitualExperimento; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: exp.id,
    disabled: !canEdit,
  });

  // Visitantes não são exibidos como responsáveis.
  const showMembers = exp.members.filter((m) => m.role !== "VISITANTE");
  // Nas etapas finais (relatório pronto / resultados apresentados) mostramos o
  // resultado — mesmo vazio ("A definir"), editável clicando na tag.
  const isTerminal = exp.status === "RELATORIO_PRONTO" || exp.status === "RESULTADOS_APRESENTADOS";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 100 : undefined,
        touchAction: canEdit ? "none" : undefined,
      }}
      className={canEdit ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}
    >
      {/* Sem pill de status: a coluna do kanban já comunica a etapa. */}
      <ActivityItemCard
        kind="experimento"
        name={exp.name}
        members={showMembers}
        detailId={exp.id}
        trailing={
          <span
            className="shrink-0 text-xs font-mono font-semibold tabular"
            style={{ color: "var(--text-muted)" }}
            data-tooltip="ICE Score"
          >
            {exp.iceScore.toFixed(1)}
          </span>
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {exp.frente.name}
          </span>
          {showMembers.length === 0 && (
            <span className="text-xs italic shrink-0" style={{ color: "var(--text-muted)" }}>
              · sem responsável
            </span>
          )}
          {isTerminal && (
            <span
              className="ml-auto shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ResultadoSelect experimentoId={exp.id} resultado={exp.resultado} disabled={!canEdit} />
            </span>
          )}
        </div>
      </ActivityItemCard>
    </div>
  );
}
