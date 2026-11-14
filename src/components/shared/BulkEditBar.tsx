"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, ChevronDown, X, Trash2, Copy, CornerDownRight, Flag } from "lucide-react";
import { TagSelect } from "./TagSelect";
import { CATEGORIA_CONFIG, getCategoriaConfig } from "./CheckpointCategoria";
import { CHECKPOINT_CATEGORIAS, type CheckpointCategoria } from "@/lib/checkpoint-categoria";
import { useLabelTooltip } from "./CursorTooltip";
import { Button } from "./Button";

export type BulkEditPatch = {
  status?: string;
  quarterId?: string;
  okrId?: string | null;
  /** Lista completa a aplicar. Ausente = não altera; `[]` = tirar todos. */
  memberIds?: string[];
};

// Sentinela interna. `NONE` = opção "sem OKR"/"sem responsável" (vira null no
// patch final). Não pode ser "" porque o TagSelect usa `value=""` como
// placeholder e só dispara `onChange` quando o valor escolhido difere do atual.
//
// Não existe mais uma sentinela de "não alterar": esse estado é a AUSÊNCIA do
// campo no staging, e quem o devolve é o ✕ da pill.
const NONE = "__none__";

// Estado local das mudanças ainda não aplicadas. OKR/responsável guardam o id
// escolhido OU `NONE`; só viram `null` ao montar o patch em "Aplicar".
type Staged = {
  status?: string;
  quarterId?: string;
  okr?: string;
  /** Responsáveis são N:N: ausente = não altera, `[]` = tirar todos. */
  memberIds?: string[];
};

/**
 * Caixa de seleção no tema do produto — usada nas linhas e no cabeçalho das
 * tabelas de iniciativas/experimentos para selecionar itens em massa. Espelha o
 * quadradinho do `MultiSelect` (16-18px, borda/`--brand-primary` quando ativo).
 */
export function SelectCheckbox({
  checked,
  indeterminate,
  onToggle,
  title,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  /**
   * Recebe o evento para quem precisa de modificadores (a árvore de checkpoints
   * usa Shift+clique pra marcar a subárvore). Handlers sem argumento continuam
   * válidos.
   */
  onToggle: (event: React.MouseEvent) => void;
  title?: string;
  ariaLabel?: string;
}) {
  const on = checked || indeterminate;
  // Tooltip do design system no lugar do `title` nativo.
  const rotulo = useLabelTooltip();
  return (
    <>
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      {...rotulo.alvo(title)}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e);
      }}
      className="flex items-center justify-center shrink-0"
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `1.5px solid ${on ? "var(--brand-primary)" : "var(--border-default)"}`,
        background: on ? "var(--brand-primary)" : "transparent",
        color: "white",
        cursor: "pointer",
      }}
    >
      {indeterminate ? (
        <Minus size={12} strokeWidth={3} />
      ) : checked ? (
        <Check size={12} strokeWidth={3} />
      ) : null}
    </button>
    {rotulo.tooltip}
    </>
  );
}

// Pill-gatilho dos pickers. Quando um valor foi escolhido (`active`), destaca com
// os tokens de acento para deixar claro que há uma mudança pendente.
/**
 * Pill de um campo da barra. Com valor escolhido, ela ganha um ✕ que desfaz a
 * escolha e devolve o campo a "não altera".
 *
 * O ✕ existe porque a opção "Não alterar" saiu dos menus: ela era a única
 * forma de desfazer, e o TagSelect ignora clique na opção já selecionada
 * (`if (v === value) return`), então repetir a escolha não desliga. Sem o ✕, o
 * único jeito de voltar atrás seria limpar a seleção inteira.
 */
function Pill({
  label,
  active,
  onUnset,
}: {
  label: string;
  active: boolean;
  onUnset?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
      style={{
        borderRadius: "var(--radius-md)",
        border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
        background: active ? "var(--accent-subtle)" : "var(--bg-surface)",
        color: active ? "var(--brand-primary)" : "var(--text-secondary)",
        maxWidth: 200,
      }}
    >
      <span className="truncate">{label}</span>
      {active && onUnset ? (
        <button
          type="button"
          // stopPropagation: o clique não pode abrir o menu do gatilho.
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onUnset();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          data-tooltip="Não alterar este campo"
          aria-label={`Não alterar ${label}`}
          className="shrink-0 inline-flex items-center"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <X size={13} style={{ color: "var(--brand-primary)" }} />
        </button>
      ) : (
        <ChevronDown size={13} className="shrink-0" style={{ color: active ? "var(--brand-primary)" : "var(--text-muted)" }} />
      )}
    </span>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />;
}

type MultiPillLabels = {
  placeholder: string;
  none: string;
  clear: string;
  title: string;
  plural: (n: number) => string;
};

const MEMBER_PILL_LABELS: MultiPillLabels = {
  placeholder: "Responsáveis",
  none: "Ninguém",
  clear: "Ninguém (limpar)",
  title: "Definir responsáveis",
  plural: (n) => (n === 1 ? "1 responsável" : `${n} responsáveis`),
};

const TAG_PILL_LABELS: MultiPillLabels = {
  placeholder: "Tags",
  none: "Sem tags",
  clear: "Sem tags (limpar)",
  title: "Definir tags",
  plural: (n) => (n === 1 ? "1 tag" : `${n} tags`),
};

/**
 * Pill de responsáveis — multi-seleção, porque responsabilidade é N:N.
 *
 * O `TagSelect` não serve aqui: ele escolhe UM valor e fecha. Este mantém o
 * menu aberto enquanto se marca gente, e distingue três estados que o
 * single-select não expressa: `undefined` = não alterar, `[]` = tirar todos os
 * responsáveis, lista = substituir pela lista.
 */
function MemberPill({
  members,
  value,
  onChange,
  labels = MEMBER_PILL_LABELS,
}: {
  members: { id: string; name: string }[];
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  /** Textos da pill — a mesma multi-seleção serve às tags dos checkpoints. */
  labels?: MultiPillLabels;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    value === undefined
      ? labels.placeholder
      : value.length === 0
        ? labels.none
        : value.length === 1
          ? members.find((m) => m.id === value[0])?.name ?? labels.plural(1)
          : labels.plural(value.length);

  function toggle(id: string) {
    const cur = value ?? [];
    onChange(cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]);
  }

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={labels.title} data-tooltip={labels.title}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        <Pill
          label={label}
          active={value !== undefined}
          onUnset={() => onChange(undefined)}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-1 z-50 py-1 max-h-64 overflow-y-auto"
          style={{
            minWidth: 200,
            width: "max-content",
            maxWidth: 260,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Sem "Não alterar": quem desfaz é o ✕ da pill. */}
          <MenuRow label={labels.clear} onClick={() => onChange([])} />
          <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
          {members.map((m) => {
            const active = (value ?? []).includes(m.id);
            return (
              <MenuRow
                key={m.id}
                label={m.name}
                checkbox={active}
                onClick={() => toggle(m.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  label,
  checkbox,
  indent = 0,
  onClick,
}: {
  label: string;
  checkbox?: boolean;
  /** Nível na árvore (menu de "Mover para"); cada nível recua 14px. */
  indent?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--text-primary)",
        cursor: "pointer",
        paddingLeft: 12 + indent * 14,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-app)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {checkbox !== undefined && (
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            border: `1px solid ${checkbox ? "var(--brand-primary)" : "var(--border-default)"}`,
            background: checkbox ? "var(--brand-primary)" : "transparent",
            color: "white",
          }}
        >
          {checkbox && <Check size={11} strokeWidth={3} />}
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

export type CheckpointMoveTarget = { id: string; name: string; depth: number };

/**
 * "Mover para…": escolhe o novo pai dos selecionados e move NA HORA — é uma
 * ação sobre a seleção, como duplicar, e não um campo a acumular até o
 * "Aplicar".
 *
 * Menu próprio em vez do `TagSelect`: ele registra um Ctrl+Z que só reaplica o
 * valor anterior do gatilho, o que aqui não desfaria o movimento. Os destinos
 * chegam já filtrados (sem ciclo, sem passar do limite de níveis).
 */
function MovePill({
  targets,
  onMove,
  disabled,
}: {
  targets: CheckpointMoveTarget[];
  onMove: (parentId: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(parentId: string | null) {
    setOpen(false);
    onMove(parentId);
  }

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        data-tooltip="Mover selecionados para dentro de outro checkpoint"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ background: "none", border: "none", padding: 0, cursor: disabled ? "default" : "pointer" }}
      >
        <span
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
          style={{
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
          }}
        >
          <CornerDownRight size={13} className="shrink-0" style={{ color: "var(--text-muted)" }} />
          <span className="whitespace-nowrap">Mover para</span>
          <ChevronDown size={13} className="shrink-0" style={{ color: "var(--text-muted)" }} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 bottom-full mb-1 z-50 py-1 max-h-72 overflow-y-auto"
          style={{
            minWidth: 220,
            width: "max-content",
            maxWidth: 300,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <MenuRow label="Nível principal (sem pai)" onClick={() => choose(null)} />
          <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
          {targets.length === 0 ? (
            <span className="block px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Nenhum checkpoint pode receber a seleção.
            </span>
          ) : (
            targets.map((t) => (
              <MenuRow key={t.id} label={t.name} indent={t.depth} onClick={() => choose(t.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export type CheckpointMarcoTarget = { id: string; name: string };

/**
 * "Atrelar a marco…": escolhe o marco que vai receber os selecionados como
 * necessários. É campo como os outros: fica destacado na pill e só grava no
 * "Aplicar". Antes gravava na hora do clique, como o "Mover para", e o time
 * esperava o "Aplicar" — a pill mora entre os campos, não entre as ações.
 *
 * Qualquer checkpoint que não seja marco pode ser atrelado (cada um entra sozinho).
 * Com algo fora disso na seleção a pill fica desabilitada, e o tooltip diz
 * por quê — sumir com ela esconderia que a ação existe.
 */
function AtrelarMarcoPill({
  targets,
  value,
  onChange,
  onUnset,
  bloqueio,
  disabled,
}: {
  targets: CheckpointMarcoTarget[];
  /** Marco escolhido e ainda não aplicado; ausente = não atrela. */
  value?: string;
  onChange: (marcoId: string) => void;
  onUnset: () => void;
  /** Motivo de a seleção não poder ser atrelada; null = pode. */
  bloqueio: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rotulo = useLabelTooltip();
  const inativa = disabled || !!bloqueio;
  const escolhido = targets.find((t) => t.id === value);
  const active = !!escolhido && !inativa;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => !inativa && setOpen((o) => !o)}
        aria-disabled={inativa}
        aria-haspopup="menu"
        aria-expanded={open}
        {...rotulo.alvo(bloqueio ?? "Atrelar os selecionados como necessários de um marco")}
        style={{ background: "none", border: "none", padding: 0, cursor: inativa ? "not-allowed" : "pointer" }}
      >
        <span
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
          style={{
            borderRadius: "var(--radius-md)",
            border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
            background: active ? "var(--accent-subtle)" : "var(--bg-surface)",
            color: active ? "var(--brand-primary)" : "var(--text-secondary)",
            opacity: inativa ? 0.5 : 1,
            maxWidth: 240,
          }}
        >
          <Flag size={13} className="shrink-0" style={{ color: CATEGORIA_CONFIG.MARCO.text }} />
          <span className="truncate whitespace-nowrap">
            {active ? `Marco: ${escolhido.name}` : "Atrelar a marco"}
          </span>
          {active ? (
            // Mesmo ✕ das outras pills: volta a "não atrelar".
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onUnset();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onUnset();
                }
              }}
              aria-label="Não atrelar a marco"
              className="shrink-0 inline-flex items-center"
            >
              <X size={13} style={{ color: "var(--brand-primary)" }} />
            </span>
          ) : (
            <ChevronDown size={13} className="shrink-0" style={{ color: "var(--text-muted)" }} />
          )}
        </span>
      </button>
      {rotulo.tooltip}

      {open && (
        <div
          role="menu"
          className="absolute left-0 bottom-full mb-1 z-50 py-1 max-h-72 overflow-y-auto"
          style={{
            minWidth: 220,
            width: "max-content",
            maxWidth: 300,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {targets.map((t) => (
            <MenuRow
              key={t.id}
              label={t.name}
              onClick={() => {
                setOpen(false);
                onChange(t.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pill de data — mesmo tratamento visual do `Pill`, mas o gatilho é o próprio
 * input nativo de data (o `TagSelect` só serve para listas de opções).
 */
function DatePill({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  title: string;
}) {
  const active = !!value;
  const rotulo = useLabelTooltip();
  return (
    <>
    {rotulo.tooltip}
    <label
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium"
      {...rotulo.alvo(title)}
      style={{
        borderRadius: "var(--radius-md)",
        border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
        background: active ? "var(--accent-subtle)" : "var(--bg-surface)",
        cursor: "pointer",
      }}
    >
      <span
        className="whitespace-nowrap"
        style={{ color: active ? "var(--brand-primary)" : "var(--text-secondary)" }}
      >
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={title}
        className="border-none bg-transparent p-0 text-xs font-medium"
        style={{
          color: active ? "var(--brand-primary)" : "var(--text-muted)",
          outline: "none",
          cursor: "pointer",
        }}
      />
    </label>
    </>
  );
}

/**
 * Casca da barra flutuante de edição em massa: posição fixa no rodapé, chip de
 * mensagem, contagem e o rótulo "Definir:". Os campos e as ações vêm por
 * `children`, então cada domínio (iniciativas/experimentos, checkpoints) monta os
 * seus sem duplicar o desenho do popup.
 */
function BulkBarShell({
  count,
  busy,
  message,
  messageTone = "info",
  children,
}: {
  count: number;
  busy?: boolean;
  message?: string | null;
  messageTone?: "info" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed left-1/2 z-50 flex flex-col items-center gap-2"
      style={{
        bottom: 24,
        transform: "translateX(-50%)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      {message && (
        <span
          // Mensagem de permissão pode nomear vários itens: quebra em linhas e
          // fica centralizada, em vez de esticar a barra.
          className="text-xs font-medium px-3 py-1.5 text-center"
          style={{
            maxWidth: 520,
            borderRadius: "var(--radius-md)",
            background:
              messageTone === "error" ? "var(--status-error-bg)" : "var(--bg-surface)",
            color:
              messageTone === "error" ? "var(--status-error-text)" : "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {message}
        </span>
      )}
      <div
        className="flex flex-wrap items-center justify-center gap-2.5 px-4 py-3"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          opacity: busy ? 0.6 : 1,
          pointerEvents: busy ? "none" : "auto",
          transition: "opacity 120ms ease",
        }}
      >
        <span
          className="text-sm font-semibold whitespace-nowrap"
          style={{ color: "var(--text-primary)" }}
        >
          {count} selecionado{count !== 1 ? "s" : ""}
        </span>
        <Divider />
        <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
          Definir:
        </span>
        {children}
      </div>
    </div>
  );
}

/** Botão redondo de fechar/limpar seleção, à direita do "Aplicar". */
function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooltip="Cancelar seleção"
      aria-label="Cancelar seleção"
      className="flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: "var(--radius-md)",
        color: "var(--text-muted)",
        cursor: "pointer",
        border: "none",
        background: "transparent",
      }}
    >
      <X size={16} />
    </button>
  );
}

/**
 * Barra flutuante de edição em massa — aparece quando há itens selecionados.
 * Cada campo (status, quarter, OKR, responsável) acumula a escolha localmente
 * (aparecendo destacado no pill); nada é gravado até clicar em "Aplicar", que
 * envia todas as mudanças pendentes de uma vez (`onApply`).
 */
export function BulkEditBar({
  count,
  statusOptions,
  quarters,
  members,
  okrs,
  onApply,
  onClear,
  busy,
  message,
  messageTone = "info",
}: {
  count: number;
  statusOptions: { value: string; label: string }[];
  quarters: { id: string; year: number; quarter: number }[];
  members: { id: string; name: string }[];
  okrs: { id: string; objective: string }[];
  onApply: (patch: BulkEditPatch) => void;
  onClear: () => void;
  busy?: boolean;
  message?: string | null;
  messageTone?: "info" | "error";
}) {
  const [staged, setStaged] = useState<Staged>({});

  if (count === 0) return null;


  // Rótulos dos pills conforme o que está em staging (ou o nome do campo).
  const statusLabel =
    staged.status === undefined
      ? "Status"
      : statusOptions.find((o) => o.value === staged.status)?.label ?? "Status";
  const quarterSel = quarters.find((q) => q.id === staged.quarterId);
  const quarterLabel = quarterSel ? `Q${quarterSel.quarter} ${quarterSel.year}` : "Quarter";
  const okrLabel =
    staged.okr === undefined
      ? "OKR"
      : staged.okr === NONE
        ? "Nenhum OKR"
        : okrs.find((o) => o.id === staged.okr)?.objective ?? "OKR";
  const hasChanges =
    staged.status !== undefined ||
    staged.quarterId !== undefined ||
    staged.okr !== undefined ||
    staged.memberIds !== undefined;

  /** Devolve o campo a "não altera" — o que o ✕ da pill faz. */
  function unset(key: keyof typeof staged) {
    setStaged((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function pick<K extends "status" | "quarterId" | "okr">(key: K, value: string) {
    setStaged((prev) => {
      const next = { ...prev };
      next[key] = value;
      return next;
    });
  }

  function handleApply() {
    if (!hasChanges) return;
    const patch: BulkEditPatch = {};
    if (staged.status !== undefined) patch.status = staged.status;
    if (staged.quarterId !== undefined) patch.quarterId = staged.quarterId;
    if (staged.okr !== undefined) patch.okrId = staged.okr === NONE ? null : staged.okr;
    if (staged.memberIds !== undefined) patch.memberIds = staged.memberIds;
    onApply(patch);
    setStaged({});
  }

  function handleClear() {
    setStaged({});
    onClear();
  }

  return (
    <BulkBarShell count={count} busy={busy} message={message} messageTone={messageTone}>
        <TagSelect
          value={staged.status ?? ""}
          options={statusOptions}
          onChange={(v) => pick("status", v)}
          menuWidth={200}
          title="Definir status"
        >
          <Pill
            label={statusLabel}
            active={staged.status !== undefined}
            onUnset={() => unset("status")}
          />
        </TagSelect>

        <TagSelect
          value={staged.quarterId ?? ""}
          options={quarters.map((q) => ({ value: q.id, label: `Q${q.quarter} ${q.year}` }))}
          onChange={(v) => pick("quarterId", v)}
          menuWidth={180}
          title="Definir quarter"
        >
          <Pill
            label={quarterLabel}
            active={staged.quarterId !== undefined}
            onUnset={() => unset("quarterId")}
          />
        </TagSelect>

        <TagSelect
          value={staged.okr ?? ""}
          options={[
            { value: NONE, label: "Nenhum OKR" },
            ...okrs.map((o) => ({ value: o.id, label: o.objective })),
          ]}
          onChange={(v) => pick("okr", v)}
          menuWidth={280}
          title="Definir OKR"
        >
          <Pill
            label={okrLabel}
            active={staged.okr !== undefined}
            onUnset={() => unset("okr")}
          />
        </TagSelect>

        <MemberPill
          members={members}
          value={staged.memberIds}
          onChange={(next) =>
            setStaged((prev) => {
              const copy = { ...prev };
              if (next === undefined) delete copy.memberIds;
              else copy.memberIds = next;
              return copy;
            })
          }
        />

        <Divider />
        <Button variant="primary" size="sm" onClick={handleApply} disabled={!hasChanges || busy}>
          {busy ? "Aplicando…" : "Aplicar"}
        </Button>
        <ClearButton onClick={handleClear} />
    </BulkBarShell>
  );
}

// ── Checkpoints ───────────────────────────────────────────────────────────────

export type CheckpointBulkPatch = {
  /** Lista completa a aplicar. Ausente = não altera; `[]` = tirar todos. */
  memberIds?: string[];
  startDate?: string;
  dueDate?: string;
  isCompleted?: boolean;
  /** Ausente = não altera; `null` = tirar a categoria. */
  categoria?: CheckpointCategoria | null;
  /** Lista completa de tags. Ausente = não altera; `[]` = tirar todas. */
  tagIds?: string[];
  /** Atrela os selecionados como necessários deste marco. */
  marcoId?: string;
};

type StagedCheckpoint = {
  memberIds?: string[];
  /** "true" | "false" — string porque o TagSelect trabalha com valores de texto. */
  completion?: string;
  startDate?: string;
  dueDate?: string;
  /** "COMUNICACAO" | "" (nenhuma) — string, pelo mesmo motivo. */
  categoria?: string;
  tagIds?: string[];
  /** Marco que recebe os selecionados como necessários. */
  marcoId?: string;
};

/**
 * Mesma barra flutuante das tabelas de iniciativas/experimentos, com os campos
 * da árvore de checkpoints: responsáveis, conclusão e as duas datas. Também
 * acumula as escolhas e só grava no "Aplicar"; mover, duplicar e excluir ficam
 * separados — são ações imediatas sobre a seleção, não campos a acumular.
 */
export function CheckpointBulkEditBar({
  count,
  members,
  tags = [],
  onApply,
  onDuplicate,
  moveTargets,
  onMove,
  marcoTargets = [],
  bloqueioMarco = null,
  onDelete,
  onClear,
  busy,
  message,
  messageTone = "info",
}: {
  count: number;
  members: { id: string; name: string }[];
  /** Tags configuradas no item. Sem nenhuma, a pill de tags não aparece. */
  tags?: { id: string; name: string }[];
  onApply: (patch: CheckpointBulkPatch) => void;
  onDuplicate: () => void;
  /** Checkpoints que podem receber a seleção como filhos, na ordem da lista. */
  moveTargets: CheckpointMoveTarget[];
  /** `null` = mover para o nível principal. */
  onMove: (parentId: string | null) => void;
  /**
   * Marcos do item. Sem nenhum, a pill não aparece. O escolhido segue no
   * patch do "Aplicar" (`marcoId`).
   */
  marcoTargets?: CheckpointMarcoTarget[];
  /** Por que a seleção não pode ser atrelada (desabilita a pill); null = pode. */
  bloqueioMarco?: string | null;
  onDelete: () => void;
  onClear: () => void;
  busy?: boolean;
  message?: string | null;
  messageTone?: "info" | "error";
}) {
  const [staged, setStaged] = useState<StagedCheckpoint>({});

  if (count === 0) return null;


  const categoriaLabel =
    staged.categoria === undefined
      ? "Categoria"
      : (getCategoriaConfig(staged.categoria)?.label ?? "Nenhuma");

  const completionLabel =
    staged.completion === undefined
      ? "Conclusão"
      : staged.completion === "true"
        ? "Concluído"
        : "Pendente";

  // Marco escolhido que deixou de valer (a seleção mudou e virou bloqueada, ou
  // o próprio marco entrou nela) não conta como mudança nem vai no patch.
  const marcoAplicavel =
    staged.marcoId !== undefined && !bloqueioMarco && marcoTargets.some((t) => t.id === staged.marcoId)
      ? staged.marcoId
      : undefined;

  const hasChanges =
    marcoAplicavel !== undefined ||
    staged.memberIds !== undefined ||
    staged.completion !== undefined ||
    staged.categoria !== undefined ||
    staged.tagIds !== undefined ||
    !!staged.startDate ||
    !!staged.dueDate;

  /** Devolve o campo a "não altera" — o que o ✕ da pill faz. */
  function unset(key: keyof typeof staged) {
    setStaged((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function pick(key: "completion" | "categoria", value: string) {
    setStaged((prev) => {
      const next = { ...prev };
      next[key] = value;
      return next;
    });
  }

  function handleApply() {
    if (!hasChanges) return;
    const patch: CheckpointBulkPatch = {};
    if (staged.memberIds !== undefined) patch.memberIds = staged.memberIds;
    if (staged.completion !== undefined) patch.isCompleted = staged.completion === "true";
    // "" na barra significa "tirar a categoria", que na action é `null`.
    if (staged.categoria !== undefined) {
      patch.categoria = CHECKPOINT_CATEGORIAS.find((c) => c === staged.categoria) ?? null;
    }
    if (staged.tagIds !== undefined) patch.tagIds = staged.tagIds;
    if (staged.startDate) patch.startDate = staged.startDate;
    if (staged.dueDate) patch.dueDate = staged.dueDate;
    if (marcoAplicavel) patch.marcoId = marcoAplicavel;
    onApply(patch);
    setStaged({});
  }

  function handleClear() {
    setStaged({});
    onClear();
  }

  return (
    <BulkBarShell count={count} busy={busy} message={message} messageTone={messageTone}>
      <MemberPill
        members={members}
        value={staged.memberIds}
        onChange={(next) =>
          setStaged((prev) => {
            const copy = { ...prev };
            if (next === undefined) delete copy.memberIds;
            else copy.memberIds = next;
            return copy;
          })
        }
      />

      <TagSelect
        value={staged.completion ?? ""}
        options={[{ value: "true", label: "Concluído" }, { value: "false", label: "Pendente" }]}
        onChange={(v) => pick("completion", v)}
        menuWidth={180}
        title="Definir conclusão"
      >
        <Pill
          label={completionLabel}
          active={staged.completion !== undefined}
          onUnset={() => unset("completion")}
        />
      </TagSelect>

      {/* "Nenhuma" LIMPA a categoria dos selecionados; não mexer é não
          escolher (ou desfazer no ✕ da pill). */}
      <TagSelect
        value={staged.categoria ?? ""}
        options={[
          ...CHECKPOINT_CATEGORIAS.map((c) => ({ value: c, label: CATEGORIA_CONFIG[c].label })),
          { value: "", label: "Nenhuma" },
        ]}
        onChange={(v) => pick("categoria", v)}
        menuWidth={180}
        title="Definir categoria"
      >
        <Pill
          label={categoriaLabel}
          active={staged.categoria !== undefined}
          onUnset={() => unset("categoria")}
        />
      </TagSelect>

      {/* Tags substituem a lista inteira dos selecionados, como responsáveis. */}
      {tags.length > 0 && (
        <MemberPill
          members={tags}
          labels={TAG_PILL_LABELS}
          value={staged.tagIds}
          onChange={(next) =>
            setStaged((prev) => {
              const copy = { ...prev };
              if (next === undefined) delete copy.tagIds;
              else copy.tagIds = next;
              return copy;
            })
          }
        />
      )}

      <DatePill
        label="Início"
        value={staged.startDate ?? ""}
        onChange={(v) => setStaged((prev) => ({ ...prev, startDate: v }))}
        title="Definir data de início"
      />
      <DatePill
        label="Fim"
        value={staged.dueDate ?? ""}
        onChange={(v) => setStaged((prev) => ({ ...prev, dueDate: v }))}
        title="Definir data de fim"
      />

      {marcoTargets.length > 0 && (
        <AtrelarMarcoPill
          targets={marcoTargets}
          value={staged.marcoId}
          onChange={(id) => setStaged((prev) => ({ ...prev, marcoId: id }))}
          onUnset={() => unset("marcoId")}
          bloqueio={bloqueioMarco}
          disabled={busy}
        />
      )}

      <Divider />
      <MovePill targets={moveTargets} onMove={onMove} disabled={busy} />
      {/* "Aplicar" é sempre o último antes de duplicar: fecha a fila de
          campos e ações. Em grupo próprio (sem quebra) para o flex-wrap da
          barra nunca separá-lo dos botões ao lado. */}
      <div className="flex items-center gap-2.5 shrink-0">
      <Button variant="primary" size="sm" onClick={handleApply} disabled={!hasChanges || busy}>
        {busy ? "Aplicando…" : "Aplicar"}
      </Button>
      <button
        type="button"
        onClick={onDuplicate}
        disabled={busy}
        data-tooltip="Duplicar selecionados"
        aria-label="Duplicar selecionados"
        className="flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-md)",
          color: "var(--text-secondary)",
          cursor: busy ? "default" : "pointer",
          border: "none",
          background: "transparent",
        }}
      >
        <Copy size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        data-tooltip="Excluir selecionados"
        aria-label="Excluir selecionados"
        className="flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-md)",
          color: "var(--status-error-text)",
          cursor: "pointer",
          border: "none",
          background: "transparent",
        }}
      >
        <Trash2 size={16} />
      </button>
      <ClearButton onClick={handleClear} />
      </div>
    </BulkBarShell>
  );
}
