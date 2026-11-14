"use client";

import { useState } from "react";
import { AlertCircle, GripVertical, Plus, Tag, Trash2, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { familyBg, familyBorder, familyStrong, type StatusFamily } from "@/lib/statusConfig";
import {
  CHECKPOINT_TAG_COLORS,
  CHECKPOINT_TAG_COLOR_LABEL,
  isCheckpointTagColor,
  nextCheckpointTagColor,
  type CheckpointTagColor,
} from "@/lib/checkpoint-tag-colors";
import { Modal } from "@/components/shared/Modal";
import { IconButton } from "@/components/shared/IconButton";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Field";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  useCursorTooltip,
  CursorTooltip,
  TooltipLine,
  TooltipTitle,
} from "@/components/shared/CursorTooltip";
import { acaoSegura } from "@/lib/acao-segura";

/**
 * Tags de checkpoint. Diferente da categoria (catálogo fixo, global), cada
 * iniciativa/experimento configura as PRÓPRIAS tags — "Design", "Dev", "QA"
 * numa; "Criativo", "Mídia" noutra. Por isso a lista de tags chega por prop do
 * item, e não de uma constante.
 */
export type CheckpointTagLite = { id: string; name: string; color: string };

type Resp<T = unknown> = { success: true; data: T } | { success: false; error: string };

export interface CheckpointTagActions {
  create: (data: { name: string; color: string }) => Promise<Resp<{ id: string; name: string; color: string }>>;
  update: (data: { id: string; name?: string; color?: string }) => Promise<Resp>;
  remove: (id: string) => Promise<Resp>;
  /** Grava a ordem nova (lista final de ids). Sem ela, a lista não arrasta. */
  reorder?: (ids: string[]) => Promise<Resp>;
}

function family(color: string): StatusFamily {
  return isCheckpointTagColor(color) ? color : "neutral";
}

/** Cores da tag (fundo, texto, borda) — para quem desenha a própria pill. */
export function checkpointTagColors(color: string) {
  const f = family(color);
  return { bg: familyBg(f), text: familyStrong(f), border: familyBorder(f) };
}

/**
 * Largura máxima do chip de tag. Nome maior trunca com reticências (o nome
 * inteiro aparece no tooltip do "+N" e no gerenciador). Exportada para a conta
 * da largura da coluna na lista não divergir do chip.
 */
export const TAG_CHIP_MAX_W = 96;

/**
 * Caixa do chip — a MESMA do chip de responsável (MemberChips): text-xs,
 * px-1.5 py-0.5, raio cheio, sem borda. Na linha do checkpoint os dois ficam
 * lado a lado; com caixas diferentes (a tag era 10px, negrito e com borda)
 * pareciam componentes de produtos diferentes. Só a cor muda: a da tag.
 */
const CHIP_CLASS = "text-xs px-1.5 py-0.5 shrink-0";

/** Pill compacta da tag, a da linha da lista. */
export function CheckpointTagChip({ tag, className }: { tag: CheckpointTagLite; className?: string }) {
  const f = family(tag.color);
  return (
    <span
      className={`${CHIP_CLASS} ${className ?? ""}`}
      style={{
        borderRadius: "var(--radius-full)",
        background: familyBg(f),
        color: familyStrong(f),
        whiteSpace: "nowrap",
        maxWidth: TAG_CHIP_MAX_W,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {tag.name}
    </span>
  );
}

/**
 * Até `max` chips e um "+N" para o resto, com os nomes no tooltip — o mesmo
 * padrão do MemberChips, para a linha não crescer com a quantidade de tags.
 */
export function CheckpointTagChips({ tags, max = 2 }: { tags: CheckpointTagLite[]; max?: number }) {
  const { tip, bind } = useCursorTooltip<CheckpointTagLite[]>();
  if (tags.length === 0) return null;
  const visiveis = tags.slice(0, max);
  const resto = tags.slice(max);
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {visiveis.map((t) => (
        <CheckpointTagChip key={t.id} tag={t} />
      ))}
      {resto.length > 0 && (
        // "+N" também é chip, como o do MemberChips — neutro, porque junta
        // tags de cores diferentes.
        <span
          className={CHIP_CLASS}
          style={{
            borderRadius: "var(--radius-full)",
            background: familyBg("neutral"),
            color: familyStrong("neutral"),
            whiteSpace: "nowrap",
            cursor: "default",
          }}
          {...bind(tags)}
        >
          +{resto.length}
        </span>
      )}
      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>Tags</TooltipTitle>
          {tip.data.map((t) => (
            <TooltipLine key={t.id}>{t.name}</TooltipLine>
          ))}
        </CursorTooltip>
      )}
    </span>
  );
}

/**
 * Seleção de tags no formulário do checkpoint — mesma gramática do
 * MemberPicker e do CategoriaPicker: uma pill por opção, clique liga/desliga.
 * A pill ativa ganha a cor da própria tag.
 *
 * Com `onCreate`, o fim da lista vira um campo "Nova tag": dá para criar a tag
 * sem sair do formulário, e ela já nasce marcada.
 */
export function CheckpointTagPicker({
  tags,
  value,
  onChange,
  onCreate,
}: {
  tags: CheckpointTagLite[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreate?: (name: string) => Promise<{ id: string } | string>;
}) {
  const [novo, setNovo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  async function criar() {
    const nome = novo?.trim();
    if (!nome || !onCreate) return;
    setSalvando(true);
    setErro(null);
    const r = await acaoSegura(onCreate(nome));
    setSalvando(false);
    // onCreate devolve a mensagem de erro (string) ou a tag criada.
    const res = typeof r === "object" && "success" in r ? r.error : r;
    if (typeof res === "string") {
      setErro(res);
      return;
    }
    onChange([...value, res.id]);
    setNovo(null);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => {
          const ativa = value.includes(t.id);
          const f = family(t.color);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              aria-pressed={ativa}
              className="px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                borderRadius: "var(--radius-full)",
                border: `1px solid ${ativa ? familyBorder(f) : "var(--border-default)"}`,
                background: ativa ? familyBg(f) : "var(--bg-app)",
                color: ativa ? familyStrong(f) : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {t.name}
            </button>
          );
        })}
        {onCreate &&
          (novo === null ? (
            <button
              type="button"
              onClick={() => setNovo("")}
              className="px-2 py-1 text-xs font-medium inline-flex items-center gap-1 transition-colors text-ink-soft hover:text-forest"
              style={{
                borderRadius: "var(--radius-full)",
                border: "1px dashed var(--border-default)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <Plus size={11} /> Nova tag
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={novo}
                maxLength={40}
                disabled={salvando}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => {
                  // Enter aqui NÃO pode enviar o formulário do checkpoint.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void criar();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setNovo(null);
                    setErro(null);
                  }
                }}
                onBlur={() => {
                  if (!novo?.trim()) {
                    setNovo(null);
                    setErro(null);
                  }
                }}
                placeholder="Nome e Enter"
                className="px-2 py-1 text-xs bg-paper text-ink focus:outline-none"
                style={{
                  width: 130,
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--color-forest)",
                }}
              />
            </span>
          ))}
        {tags.length === 0 && !onCreate && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nenhuma tag configurada.
          </span>
        )}
      </div>
      {erro && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--status-error-text)" }}>
          <AlertCircle size={12} /> {erro}
        </div>
      )}
    </div>
  );
}

function ColorSwatches({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (c: CheckpointTagColor) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Cor da tag">
      {CHECKPOINT_TAG_COLORS.map((c) => {
        const ativa = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={ativa}
            aria-label={CHECKPOINT_TAG_COLOR_LABEL[c]}
            disabled={disabled}
            onClick={() => !ativa && onChange(c)}
            style={{
              width: 18,
              height: 18,
              borderRadius: "var(--radius-full)",
              background: familyBg(c),
              border: `${ativa ? 2 : 1}px solid ${ativa ? familyStrong(c) : familyBorder(c)}`,
              cursor: disabled ? "default" : "pointer",
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

function TagRow({
  tag,
  usos,
  actions,
  onChanged,
  onRemoved,
  arrastavel,
}: {
  tag: CheckpointTagLite;
  usos: number;
  arrastavel: boolean;
  actions: CheckpointTagActions;
  onChanged: (tag: CheckpointTagLite) => void;
  onRemoved: (id: string) => void;
}) {
  const [nome, setNome] = useState(tag.name);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: tag.id, disabled: !arrastavel });

  async function salvar(patch: { name?: string; color?: string }) {
    setPendente(true);
    setErro(null);
    const res = await actions.update({ id: tag.id, ...patch });
    setPendente(false);
    if (res.success) {
      onChanged({ ...tag, ...patch });
    } else {
      setErro(res.error);
      if (patch.name !== undefined) setNome(tag.name);
    }
  }

  async function excluir() {
    setPendente(true);
    const res = await actions.remove(tag.id);
    setPendente(false);
    setConfirmando(false);
    if (res.success) onRemoved(tag.id);
    else setErro(res.error);
  }

  return (
    <li
      ref={setNodeRef}
      className="py-2"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
        background: isDragging ? "var(--bg-surface)" : undefined,
        boxShadow: isDragging ? "var(--shadow-md)" : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        {arrastavel && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Arrastar a tag "${tag.name}" para mudar a ordem`}
            className="shrink-0 -mr-2 flex items-center justify-center rounded"
            style={{
              color: "var(--text-muted)",
              cursor: isDragging ? "grabbing" : "grab",
              touchAction: "none",
              width: 16,
              height: 24,
            }}
          >
            <GripVertical size={14} />
          </button>
        )}
        <input
          value={nome}
          maxLength={40}
          disabled={pendente}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => {
            const n = nome.trim();
            if (!n) setNome(tag.name);
            else if (n !== tag.name) void salvar({ name: n });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label="Nome da tag"
          className="flex-1 min-w-0 text-sm bg-transparent text-ink focus:outline-none px-1 py-0.5 rounded hover:bg-cream focus:bg-cream"
        />
        <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
          {usos} {usos === 1 ? "checkpoint" : "checkpoints"}
        </span>
        <ColorSwatches value={tag.color} disabled={pendente} onChange={(c) => void salvar({ color: c })} />
        <IconButton
          boxSize={24}
          onClick={() => setConfirmando(true)}
          disabled={pendente}
          title="Excluir tag"
          aria-label={`Excluir a tag "${tag.name}"`}
          className="icon-btn--danger"
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
      {erro && (
        <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: "var(--status-error-text)" }}>
          <AlertCircle size={12} /> {erro}
        </div>
      )}
      {confirmando && (
        <ConfirmDialog
          title="Excluir tag?"
          message={
            usos > 0
              ? `"${tag.name}" será removida de ${usos} ${usos === 1 ? "checkpoint" : "checkpoints"}. Os checkpoints continuam, só perdem a tag.`
              : `"${tag.name}" será excluída.`
          }
          confirmLabel={pendente ? "Excluindo..." : "Excluir"}
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={excluir}
          onCancel={() => !pendente && setConfirmando(false)}
        />
      )}
    </li>
  );
}

/**
 * Configuração das tags DESTE item: criar, renomear, trocar a cor e excluir.
 * Renomear e recolorir refletem em todos os checkpoints marcados, porque a
 * linha guarda o id da tag, não o nome.
 */
export function CheckpointTagManager({
  tags,
  usage,
  actions,
  onClose,
  onTagsChange,
}: {
  tags: CheckpointTagLite[];
  /** Quantos checkpoints usam cada tag (id → contagem). */
  usage: Map<string, number>;
  actions: CheckpointTagActions;
  onClose: () => void;
  onTagsChange: (tags: CheckpointTagLite[]) => void;
}) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [erroOrdem, setErroOrdem] = useState<string | null>(null);
  const arrastavel = !!actions.reorder && tags.length > 1;
  const sensors = useSensors(
    // 4px antes de começar: clique no grip sem mexer não vira arrasto.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A ordem desta lista é a ordem dos grupos na visão segmentada por tag.
  // Otimista: reordena na hora e desfaz se o servidor recusar.
  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !actions.reorder) return;
    const de = tags.findIndex((t) => t.id === active.id);
    const para = tags.findIndex((t) => t.id === over.id);
    if (de < 0 || para < 0) return;
    const anterior = tags;
    const nova = arrayMove(tags, de, para);
    onTagsChange(nova);
    setErroOrdem(null);
    const res = await actions.reorder(nova.map((t) => t.id));
    if (!res.success) {
      onTagsChange(anterior);
      setErroOrdem(res.error);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const n = nome.trim();
    if (!n) return;
    setCriando(true);
    setErro(null);
    const res = await actions.create({ name: n, color: nextCheckpointTagColor(tags.map((t) => t.color)) });
    setCriando(false);
    if (res.success) {
      onTagsChange([...tags, res.data]);
      setNome("");
    } else {
      setErro(res.error);
    }
  }

  return (
    <Modal open onClose={onClose} maxWidth={520} labelledBy="checkpoint-tags-title">
      <div className="flex items-center justify-between mb-2">
        <h2
          id="checkpoint-tags-title"
          className="text-xl font-bold inline-flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <Tag size={18} className="text-forest" /> Tags dos checkpoints
        </h2>
        <IconButton boxSize={32} onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        Estas tags valem só para os checkpoints deste item.
        {arrastavel && " Arraste para definir a ordem dos grupos na visão por tag."}
      </p>

      {tags.length > 0 ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={tags.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="mb-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {tags.map((t) => (
                  <TagRow
                    key={t.id}
                    tag={t}
                    usos={usage.get(t.id) ?? 0}
                    actions={actions}
                    arrastavel={arrastavel}
                    onChanged={(nova) => onTagsChange(tags.map((x) => (x.id === nova.id ? nova : x)))}
                    onRemoved={(id) => onTagsChange(tags.filter((x) => x.id !== id))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {erroOrdem && (
            <div className="flex items-center gap-1.5 text-xs -mt-2 mb-4" style={{ color: "var(--status-error-text)" }}>
              <AlertCircle size={12} /> {erroOrdem}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Nenhuma tag ainda. Crie a primeira abaixo.
        </p>
      )}

      <form onSubmit={criar} className="flex items-center gap-2">
        <Input
          value={nome}
          maxLength={40}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nova tag (ex.: Design, QA, Mídia)"
          autoFocus
        />
        <Button type="submit" variant="secondary" size="sm" disabled={criando || !nome.trim()}>
          {criando ? "Criando..." : "Adicionar"}
        </Button>
      </form>
      {erro && (
        <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: "var(--status-error-text)" }}>
          <AlertCircle size={12} /> {erro}
        </div>
      )}
    </Modal>
  );
}
