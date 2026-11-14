"use client";

import { useSearchParams } from "next/navigation";
import {
  CheckpointSection as SharedCheckpointSection,
  type CheckpointNode,
  type CheckpointTagLite,
} from "@/components/shared/CheckpointSection";
import {
  createCheckpointTag,
  reorderCheckpointTags,
  deleteCheckpointTag,
  updateCheckpointTag,
} from "@/actions/checkpoint-tags";
import {
  atrelarExperimentoCheckpointsAoMarco,
  bulkDeleteExperimentoCheckpoints,
  bulkDuplicateExperimentoCheckpoints,
  bulkMoveExperimentoCheckpoints,
  bulkUpdateExperimentoCheckpoints,
  createExperimentoCheckpoint,
  deleteExperimentoCheckpoint,
  renameExperimentoCheckpoint,
  toggleExperimentoCheckpointCompletion,
  updateExperimentoCheckpoint,
  updateExperimentoCheckpointParent,
} from "@/actions/experimento-checkpoints";

interface CheckpointSectionProps {
  experimentoId: string;
  checkpoints: CheckpointNode[];
  members: { id: string; name: string }[];
  /** Tags configuradas neste experimento para os checkpoints. */
  tags: CheckpointTagLite[];
  isEditable?: boolean;
  launchDate?: Date | string | null;
  /** Repassado ao header do card compartilhado (controles de layout da página). */
  headerActions?: React.ReactNode;
}

// Adapter fino: injeta o experimentoId nas actions e delega ao componente compartilhado.
export function CheckpointSection({
  experimentoId,
  checkpoints,
  members,
  tags,
  isEditable = true,
  launchDate,
  headerActions,
}: CheckpointSectionProps) {
  // `?checkpoint=<id>`: o calendário de datas-chave abre o item já no
  // checkpoint clicado (ver DetailModal).
  const focoInicial = useSearchParams().get("checkpoint");
  return (
    <SharedCheckpointSection
      checkpoints={checkpoints}
      members={members}
      tags={tags}
      isEditable={isEditable}
      launchDate={launchDate}
      focoInicial={focoInicial}
      headerActions={headerActions}
      emptyDescription="Divida esse experimento em etapas!"
      tagActions={{
        create: (data) => createCheckpointTag({ owner: { kind: "experimento", id: experimentoId }, ...data }),
        update: (data) => updateCheckpointTag(data),
        remove: (id) => deleteCheckpointTag(id),
        reorder: (ids) => reorderCheckpointTags({ owner: { kind: "experimento", id: experimentoId }, ids }),
      }}
      actions={{
        create: (data) => createExperimentoCheckpoint({ experimentoId, ...data }),
        update: (data) => updateExperimentoCheckpoint(data),
        rename: (data) => renameExperimentoCheckpoint(data),
        remove: (id) => deleteExperimentoCheckpoint(id),
        toggle: (id) => toggleExperimentoCheckpointCompletion(id),
        updateParent: (data) => updateExperimentoCheckpointParent(data),
        bulkUpdate: (data) => bulkUpdateExperimentoCheckpoints(data),
        bulkRemove: (ids) => bulkDeleteExperimentoCheckpoints(ids),
        bulkDuplicate: (ids) => bulkDuplicateExperimentoCheckpoints(ids),
        bulkMove: (data) => bulkMoveExperimentoCheckpoints(data),
        atrelarAoMarco: (data) => atrelarExperimentoCheckpointsAoMarco(data),
      }}
    />
  );
}
