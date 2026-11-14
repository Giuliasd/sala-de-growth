"use client";

import { useState, useEffect, useRef } from "react";
import { Pencil, Check, X } from "lucide-react";
import { TagSelect } from "@/components/shared/TagSelect";
import { registrarEdicao } from "@/lib/undo";
import { TrechosComLinks } from "@/components/shared/TextoComLinks";
import { useEstadoDaProp } from "@/hooks/useEstadoDaProp";

/**
 * Props para uma área clicável que abre a edição ser operável por teclado.
 * Eram `<div onClick>` sem papel, foco nem Enter/Espaço: nome, descrição,
 * datas e comentários do detalhe só eram editáveis com mouse — e o lápis só
 * aparecia no hover, então quem usa teclado ou toque nem descobria que dava
 * para editar.
 */
export function editavelPorTeclado(ativar: () => void, rotulo?: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": rotulo,
    onClick: ativar,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Só quando o foco está na própria área (não num link/botão dentro dela).
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ativar();
      }
    },
  };
}

// ── InlineTextField ────────────────────────────────────────────────────────────

export interface InlineTextFieldProps {
  value: string;
  /** Shown in display mode; falls back to `value` when omitted */
  displayValue?: string;
  onSave: (value: string) => void;
  isPending: boolean;
  inputClassName?: string;
  displayClassName?: string;
  inputType?: "text" | "url" | "date";
  placeholder?: string;
  emptyLabel?: string;
  /** Nome do campo no toast do Ctrl+Z (ex.: "nome", "descrição"). */
  undoLabel?: string;
}

export function InlineTextField({
  value,
  displayValue,
  onSave,
  isPending,
  inputClassName,
  displayClassName,
  inputType = "text",
  undoLabel,
  placeholder,
  emptyLabel = "—",
}: InlineTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useEstadoDaProp(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (draft === value) return;
    // Desfazer = salvar de novo com o texto de antes (ver lib/undo).
    const anterior = value;
    registrarEdicao(undoLabel ?? "edição de texto", () => onSave(anterior));
    onSave(draft);
  };
  const handleCancel = () => { setDraft(value); setEditing(false); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isPending}
          className={
            inputClassName ||
            "text-sm border border-line rounded px-2 py-0.5 bg-paper text-ink focus:outline-none focus:border-forest min-w-0 flex-1"
          }
          style={{ borderColor: "var(--border-default)", borderRadius: "var(--radius-sm)" }}
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          aria-label="Salvar" data-tooltip="Salvar"
          style={{
            width: 22, height: 22, background: "var(--brand-primary)",
            borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Check size={12} color="white" strokeWidth={3} />
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          aria-label="Cancelar" data-tooltip="Cancelar"
          style={{
            width: 22, height: 22, background: "transparent",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <X size={12} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    );
  }

  const shown = displayValue !== undefined ? displayValue : value;
  return (
    <div
      className="group flex items-center gap-1.5 cursor-pointer"
      {...editavelPorTeclado(() => setEditing(true), `Editar: ${shown || emptyLabel}`)}
    >
      <span className={displayClassName || "text-sm text-ink"}>{shown || emptyLabel}</span>
      <Pencil
        size={11}
        className="opacity-0 group-hover:opacity-50 group-focus-visible:opacity-70 transition-opacity shrink-0"
        style={{ color: "var(--text-muted)" }}
      />
    </div>
  );
}

// ── InlineTextArea ─────────────────────────────────────────────────────────────

export interface InlineTextAreaProps {
  value: string;
  onSave: (value: string) => void;
  isPending: boolean;
  displayClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  emptyLabel?: string;
  emptyClassName?: string;
  rows?: number;
  /** Keyboard hint shown inside the edit mode. Pass "" to hide. */
  hint?: string;
  /** Nome do campo no toast do Ctrl+Z (ex.: "comentário", "descrição"). */
  undoLabel?: string;
  /** Mostra os links do texto como hiperlink (clicar no link abre; não entra em edição). */
  linkify?: boolean;
}

export function InlineTextArea({
  value,
  onSave,
  isPending,
  displayClassName,
  inputClassName,
  placeholder,
  emptyLabel = "—",
  emptyClassName,
  rows = 3,
  hint,
  undoLabel,
  linkify = false,
}: InlineTextAreaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useEstadoDaProp(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (draft === value) return;
    // Desfazer = salvar de novo com o texto de antes (ver lib/undo).
    const anterior = value;
    registrarEdicao(undoLabel ?? "edição de texto", () => onSave(anterior));
    onSave(draft);
  };
  const handleCancel = () => { setDraft(value); setEditing(false); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    const hintText = hint !== undefined ? hint : "Ctrl+Enter para salvar";
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isPending}
          rows={rows}
          className={
            inputClassName ||
            "text-sm border border-line rounded-lg px-3 py-2 bg-paper text-ink focus:outline-none focus:border-forest resize-none w-full"
          }
          style={{ borderColor: "var(--border-default)", borderRadius: "var(--radius-sm)" }}
        />
        <div className="flex items-center gap-1.5 justify-end">
          {hintText && (
            <span className="text-[10px] text-ink-soft mr-auto">{hintText}</span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            aria-label="Salvar" data-tooltip="Salvar"
            style={{
              width: 22, height: 22, background: "var(--brand-primary)",
              borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Check size={12} color="white" strokeWidth={3} />
          </button>
          <button
            onClick={handleCancel}
            disabled={isPending}
            aria-label="Cancelar" data-tooltip="Cancelar"
            style={{
              width: 22, height: 22, background: "transparent",
              borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={12} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
      </div>
    );
  }

  if (!value) {
    if (!emptyLabel) return null;
    return (
      <div
        className={`group flex items-center gap-1 cursor-pointer ${isPending ? "opacity-50" : ""}`}
        {...editavelPorTeclado(() => !isPending && setEditing(true), `Editar: ${emptyLabel}`)}
      >
        <span className={emptyClassName || "text-sm text-ink-soft italic"}>{emptyLabel}</span>
        <Pencil
          size={11}
          className="opacity-0 group-hover:opacity-50 group-focus-visible:opacity-70 transition-opacity shrink-0"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-start gap-1.5 cursor-pointer ${isPending ? "opacity-50" : ""}`}
      {...editavelPorTeclado(() => !isPending && setEditing(true))}
    >
      {/* min-w-0 + wrap-anywhere: item de flex, o <p> não encolhe abaixo da
          maior palavra — uma URL longa num comentário esticava a coluna e
          vazava do card. `break-words` sozinho não resolve: quebra a linha,
          mas não reduz a largura mínima que o flex reserva. */}
      <p className={`${displayClassName || "text-sm text-ink"} min-w-0 whitespace-pre-wrap wrap-anywhere leading-relaxed`}>
        {linkify ? <TrechosComLinks texto={value} /> : value}
      </p>
      <Pencil
        size={11}
        className="opacity-0 group-hover:opacity-50 group-focus-visible:opacity-70 transition-opacity shrink-0 mt-0.5"
        style={{ color: "var(--text-muted)" }}
      />
    </div>
  );
}

// ── InlineSelectField ──────────────────────────────────────────────────────────

export interface InlineSelectFieldProps {
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => void;
  isPending: boolean;
  displayLabel: string;
  displayClassName?: string;
  emptyLabel?: string;
  /**
   * Texto completo do valor, para quando o display é truncado. Vira o tooltip
   * do gatilho no lugar de "Alterar valor" — dois tooltips no mesmo hover
   * (gatilho e texto) abririam empilhados.
   */
  displayTitle?: string;
}

export function InlineSelectField({
  value,
  options,
  onSave,
  isPending,
  displayLabel,
  displayClassName,
  emptyLabel = "—",
  displayTitle,
}: InlineSelectFieldProps) {
  return (
    <TagSelect
      value={value}
      options={options}
      onChange={onSave}
      disabled={isPending}
      title={displayTitle ?? "Alterar valor"}
    >
      <span
        className={`group inline-flex items-center gap-1.5 ${isPending ? "opacity-50" : ""}`}
      >
        <span className={displayClassName || "text-sm text-ink"}>
          {displayLabel || emptyLabel}
        </span>
        <Pencil
          size={11}
          className="opacity-0 group-hover:opacity-50 group-focus-visible:opacity-70 transition-opacity shrink-0"
          style={{ color: "var(--text-muted)" }}
        />
      </span>
    </TagSelect>
  );
}

// ── InlineSelectBadge ──────────────────────────────────────────────────────────

export interface InlineSelectBadgeProps<T extends string> {
  value: T;
  options: { value: string; label: string }[];
  badgeClassName: string;
  badgeTextColor?: string;
  badgeLabel: string;
  badgeIcon?: React.ReactNode;
  onSave: (value: string) => void;
  isPending: boolean;
}

export function InlineSelectBadge<T extends string>({
  value,
  options,
  badgeClassName,
  badgeTextColor,
  badgeLabel,
  badgeIcon,
  onSave,
  isPending,
}: InlineSelectBadgeProps<T>) {
  return (
    <span className={`inline-flex ${isPending ? "opacity-50" : ""}`}>
      <TagSelect
        value={value}
        options={options}
        onChange={onSave}
        disabled={isPending}
        title="Alterar valor"
      >
        {/* Caixa = `.badge`, a mesma pill do StatusBadge: no cabeçalho do
            detalhe status, prioridade e quarter ficam lado a lado, e cada um
            tinha forma própria. Quem chama passa só cor (fundo/borda/texto). */}
        <span
          className={`badge cursor-pointer hover:brightness-95 transition-all ${badgeClassName}`}
          style={{ color: badgeTextColor }}
        >
          {badgeIcon}
          {badgeLabel}
        </span>
      </TagSelect>
    </span>
  );
}
