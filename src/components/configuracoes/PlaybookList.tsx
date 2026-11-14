"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deletePlaybookLink, reorderPlaybookLinks } from "@/actions/playbook";
import { PlaybookForm } from "./PlaybookForm";
import { PlaybookSectionManager } from "./PlaybookSectionManager";
import { AVAILABLE_ICONS, IconName } from "@/lib/icons";

type Section = { id: string; name: string };

export function PlaybookList({ links, sections }: { links: any[]; sections: Section[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  // Cópia local pra reordenar de forma otimista; re-sincroniza quando o
  // servidor revalida e manda a lista nova (padrão "derived state" do React —
  // ajuste durante o render, sem effect).
  const [localLinks, setLocalLinks] = useState(links);
  const [prevLinks, setPrevLinks] = useState(links);
  if (prevLinks !== links) {
    setPrevLinks(links);
    setLocalLinks(links);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    await deletePlaybookLink(deleteTarget.id);
    setDeleteTarget(null);
  }

  function handleEdit(link: any) {
    setEditTarget(link);
    setShowForm(true);
  }

  // Agrupa os links: cada seção (na ordem) + "Sem seção" no fim. O drag
  // reordena dentro do próprio grupo (mover de seção é pelo editar).
  const groups: { id: string | null; name: string; links: any[] }[] = [
    ...sections.map((s) => ({ id: s.id, name: s.name, links: localLinks.filter((l) => l.sectionId === s.id) })),
    { id: null, name: "Sem seção", links: localLinks.filter((l) => !l.sectionId) },
  ].filter((g) => g.id !== null || g.links.length > 0);

  async function handleDragEnd(groupLinks: any[], event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupLinks.findIndex((l) => l.id === active.id);
    const newIndex = groupLinks.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextGroup = arrayMove(groupLinks, oldIndex, newIndex);

    // Otimista: troca só os links deste grupo, preservando os demais.
    const groupIds = new Set(groupLinks.map((l) => l.id));
    let cursor = 0;
    setLocalLinks((prev) => prev.map((l) => (groupIds.has(l.id) ? nextGroup[cursor++] : l)));

    setReorderError(null);
    const res = await reorderPlaybookLinks(nextGroup.map((l) => l.id));
    if (!res.success) {
      setLocalLinks(links);
      setReorderError(res.error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Links do Playbook</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Gerencie os atalhos exibidos na página Playbook. Arraste para reordenar dentro da seção.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => { setEditTarget(null); setShowForm(true); }}>
          <Plus size={16} /> Adicionar Link
        </Button>
      </div>

      {/* Gerenciador de seções */}
      <PlaybookSectionManager sections={sections} />

      {/* Links agrupados por seção */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id ?? "none"} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {group.name} <span style={{ fontWeight: 400 }}>· {group.links.length}</span>
            </h3>
            <DndContext
              id={`playbook-links-dnd-${group.id ?? "none"}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(group.links, e)}
            >
              <SortableContext items={group.links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="grid gap-3">
                  {group.links.map((link) => (
                    <SortableLinkCard
                      key={link.id}
                      link={link}
                      onEdit={() => handleEdit(link)}
                      onDelete={() => setDeleteTarget({ id: link.id, title: link.title })}
                    />
                  ))}
                  {group.links.length === 0 && (
                    <div className="p-4 text-center border rounded-xl" style={{ borderColor: "var(--border-dashed)", borderStyle: "dashed" }}>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhum link nesta seção.</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ))}
        {localLinks.length === 0 && (
          <div className="p-8 text-center border rounded-xl" style={{ borderColor: "var(--border-dashed)", borderStyle: "dashed" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum link cadastrado.</p>
          </div>
        )}
      </div>

      {reorderError && (
        <p className="text-sm font-medium" style={{ color: "var(--status-error-text)" }}>{reorderError}</p>
      )}

      {showForm && (
        <PlaybookForm
          link={editTarget}
          sections={sections}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir link"
          message={`Tem certeza que deseja excluir o link "${deleteTarget.title}"?`}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function SortableLinkCard({
  link,
  onEdit,
  onDelete,
}: {
  link: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
  });
  const Icon = AVAILABLE_ICONS[link.iconName as IconName] || AVAILABLE_ICONS.Link2;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
    >
      <Card className="flex items-center justify-between gap-3" padding={16}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Alça de arrasto — listeners só aqui, pra não engolir cliques nos botões */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 flex items-center justify-center"
            aria-label={`Arrastar o link ${link.title}`}
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
          <div className="p-2 rounded-lg shrink-0" style={{ background: "var(--bg-app)" }}>
            <Icon size={20} style={{ color: "var(--text-secondary)" }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{link.title}</p>
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{link.subtitle} • {link.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <IconButton boxSize={32} onClick={onEdit} title="Editar" aria-label="Editar"><Pencil size={16} /></IconButton>
          <IconButton boxSize={32} onClick={onDelete} title="Excluir" aria-label="Excluir" className="icon-btn--danger"><Trash2 size={16} /></IconButton>
        </div>
      </Card>
    </div>
  );
}
