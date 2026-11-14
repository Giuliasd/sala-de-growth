"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { IconButton } from "@/components/shared/IconButton";
import { Input } from "@/components/shared/Field";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  createPlaybookSection,
  updatePlaybookSection,
  deletePlaybookSection,
  reorderPlaybookSections,
} from "@/actions/playbook";

type Section = { id: string; name: string };

export function PlaybookSectionManager({ sections }: { sections: Section[] }) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);

  // Cópia local pra reordenar de forma otimista; re-sincroniza quando o
  // servidor revalida e manda a lista nova (padrão "derived state" do React —
  // ajuste durante o render, sem effect).
  const [ordered, setOrdered] = useState(sections);
  const [prevSections, setPrevSections] = useState(sections);
  if (prevSections !== sections) {
    setPrevSections(sections);
    setOrdered(sections);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    const res = await createPlaybookSection({ name: newName.trim() });
    setAdding(false);
    if (res.success) setNewName("");
    else setError(res.error);
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setBusyId(id);
    setError(null);
    const res = await updatePlaybookSection(id, { name: editName.trim() });
    setBusyId(null);
    if (res.success) setEditingId(null);
    else setError(res.error);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setBusyId(id);
    setError(null);
    const res = await deletePlaybookSection(id);
    setBusyId(null);
    if (!res.success) setError(res.error);
  }

  // Solta o drag: aplica otimista e persiste (order = índice); reverte se falhar.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((s) => s.id === active.id);
    const newIndex = ordered.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    setError(null);
    const res = await reorderPlaybookSections(next.map((s) => s.id));
    if (!res.success) {
      setOrdered(sections);
      setError(res.error);
    }
  }

  return (
    <Card className="space-y-4" padding={20}>
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Seções</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Agrupe os links em seções exibidas na página Playbook. Arraste para reordenar.
        </p>
      </div>

      {/* Lista de seções (arrastável) */}
      <DndContext
        id="playbook-secoes-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ordered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {ordered.map((s) => (
              <SortableSectionRow
                key={s.id}
                section={s}
                isEditing={editingId === s.id}
                busy={busyId === s.id}
                editName={editName}
                onEditNameChange={setEditName}
                onStartEdit={() => { setEditingId(s.id); setEditName(s.name); }}
                onCancelEdit={() => setEditingId(null)}
                onRename={() => handleRename(s.id)}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
            {ordered.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma seção criada ainda.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Adicionar seção */}
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome da nova seção"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" size="md" disabled={adding || !newName.trim()}>
          {adding ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Adicionar</>}
        </Button>
      </form>

      {error && <p className="text-sm font-medium" style={{ color: "var(--status-error-text)" }}>{error}</p>}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir seção"
          message={`Excluir a seção "${deleteTarget.name}"? Os links dela ficarão sem seção.`}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </Card>
  );
}

function SortableSectionRow({
  section,
  isEditing,
  busy,
  editName,
  onEditNameChange,
  onStartEdit,
  onCancelEdit,
  onRename,
  onDelete,
}: {
  section: Section;
  isEditing: boolean;
  busy: boolean;
  editName: string;
  onEditNameChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  return (
    <div
      ref={setNodeRef}
      className="flex items-center justify-between gap-3 p-3 rounded-lg border"
      style={{
        background: "var(--bg-app)",
        borderColor: "var(--border-subtle)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
    >
      {/* Alça de arrasto — listeners só aqui, pra não engolir cliques nos botões */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 flex items-center justify-center"
        aria-label={`Arrastar a seção ${section.name}`}
        style={{
          width: 24,
          height: 24,
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <GripVertical size={15} />
      </button>

      {isEditing ? (
        <Input
          autoFocus
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onRename(); if (e.key === "Escape") onCancelEdit(); }}
          className="flex-1"
        />
      ) : (
        <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
          {section.name}
        </span>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {isEditing ? (
          <>
            <IconButton onClick={onRename} disabled={busy} title="Salvar" aria-label="Salvar">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            </IconButton>
            <IconButton onClick={onCancelEdit} title="Cancelar" aria-label="Cancelar">
              <X size={15} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton onClick={onStartEdit} title="Renomear" aria-label="Renomear">
              <Pencil size={15} />
            </IconButton>
            <IconButton onClick={onDelete} disabled={busy} title="Excluir" aria-label="Excluir" className="icon-btn--danger">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}
