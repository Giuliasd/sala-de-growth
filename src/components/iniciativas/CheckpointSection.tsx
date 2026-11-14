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
  atrelarCheckpointsAoMarco,
  bulkDeleteCheckpoints,
  bulkDuplicateCheckpoints,
  bulkMoveCheckpoints,
  bulkUpdateCheckpoints,
  createCheckpoint,
  deleteCheckpoint,
  renameCheckpoint,
  toggleCheckpointCompletion,
  updateCheckpoint,
  updateCheckpointParent,
} from "@/actions/initiative-checkpoints";

interface CheckpointSectionProps {
  initiativeId: string;
  checkpoints: CheckpointNode[];
  members: { id: string; name: string }[];
  /** Tags configuradas nesta iniciativa para os checkpoints. */
  tags: CheckpointTagLite[];
  isEditable?: boolean;
  launchDate?: Date | string | null;
  /** Repassado ao header do card compartilhado (controles de layout da página). */
  headerActions?: React.ReactNode;
}

// Adapter fino: injeta o initiativeId nas actions e delega ao componente compartilhado.
export function CheckpointSection({
  initiativeId,
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
      emptyDescription="Divida essa iniciativa em etapas!"
      tagActions={{
        create: (data) => createCheckpointTag({ owner: { kind: "iniciativa", id: initiativeId }, ...data }),
        update: (data) => updateCheckpointTag(data),
        remove: (id) => deleteCheckpointTag(id),
        reorder: (ids) => reorderCheckpointTags({ owner: { kind: "iniciativa", id: initiativeId }, ids }),
      }}
      actions={{
        create: (data) => createCheckpoint({ initiativeId, ...data }),
        update: (data) => updateCheckpoint(data),
        rename: (data) => renameCheckpoint(data),
        remove: (id) => deleteCheckpoint(id),
        toggle: (id) => toggleCheckpointCompletion(id),
        updateParent: (data) => updateCheckpointParent(data),
        bulkUpdate: (data) => bulkUpdateCheckpoints(data),
        bulkRemove: (ids) => bulkDeleteCheckpoints(ids),
        bulkDuplicate: (ids) => bulkDuplicateCheckpoints(ids),
        bulkMove: (data) => bulkMoveCheckpoints(data),
        atrelarAoMarco: (data) => atrelarCheckpointsAoMarco(data),
      }}
    />
  );
}
