"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock, ExternalLink, Pencil, X } from "lucide-react";
import { editavelPorTeclado } from "@/components/shared/InlineEdit";
import { useEstadoDaProp } from "@/hooks/useEstadoDaProp";

/**
 * Peças comuns do cabeçalho de detalhe (iniciativa e experimento).
 *
 * O desenho canônico é o de `/iniciativas/[id]`: título em linha própria,
 * badges e ações na linha seguinte, e uma **faixa** única de metadados no lugar
 * dos cards de Período/OKR/Documentação — os cards gastavam altura de sobra
 * para pouco conteúdo. Estas peças moram aqui para as duas telas dizerem a
 * mesma coisa do mesmo jeito, em vez de cada uma manter a sua cópia.
 */

// ── Título do detalhe ────────────────────────────────────────────────────────
// Mesmo tamanho do <h1> das listas (PageHeader: text-2xl font-bold). O detalhe
// usava text-4xl e destoava de todas as outras páginas do produto.
export const DETAIL_TITLE_CLASS = "text-2xl font-bold text-ink leading-tight";
export const DETAIL_TITLE_INPUT_CLASS =
  "text-2xl font-bold text-ink leading-tight border border-line rounded-lg px-2 py-1 bg-paper focus:outline-none focus:border-forest w-full";

// ── Barra de metadados: estilos e estados vazios ─────────────────────────────

/**
 * Um padrão só para "não preenchido" na barra: texto curto em itálico, como o
 * "Nenhum link disponível" da documentação. Antes o traço "—" das datas dizia a
 * mesma coisa de outra forma, o que fazia a barra parecer ter dois idiomas.
 */
export const EMPTY_FIELD_CLASS = "text-sm italic text-ink-soft";
export const FILLED_DATE_CLASS = "text-ink font-mono font-medium text-sm";
export const DATE_INPUT_CLASS =
  "text-sm border border-line rounded px-2 py-0.5 bg-paper text-ink focus:outline-none focus:border-forest font-mono";

function formatDate(date: Date | string | null | undefined): string {
  // A iniciativa entrega Date e o experimento entrega string ISO — a faixa é a
  // mesma nas duas telas, então ela aceita os dois.
  const d = typeof date === "string" ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Como a data aparece na barra: valor em mono, ou o texto de vazio em itálico. */
export function dateDisplayProps(
  date: Date | string | null | undefined,
  emptyLabel: string
): { displayValue: string; displayClassName: string } {
  return date
    ? { displayValue: formatDate(date), displayClassName: FILLED_DATE_CLASS }
    : { displayValue: emptyLabel, displayClassName: EMPTY_FIELD_CLASS };
}

/** Separador sutil entre campos da barra de metadados. */
export function MetaDivider() {
  return (
    <span aria-hidden="true" className="text-ink-soft select-none">
      ·
    </span>
  );
}

// ── Faixa de metadados ───────────────────────────────────────────────────────

interface DetailMetaBarProps {
  /** Campos inline da primeira linha, separados por `MetaDivider`. */
  children: React.ReactNode;
  /** Rótulo da criação: "Criada em" (iniciativa) ou "Criado em" (experimento). */
  createdLabel: string;
  createdAt: Date | string;
  updatedLabel: string;
  updatedAt: Date | string;
  /** Aviso opcional no rodapé da faixa (ex.: OKR desvinculado ao trocar quarter). */
  alert?: React.ReactNode;
}

export function DetailMetaBar({
  children,
  createdLabel,
  createdAt,
  updatedLabel,
  updatedAt,
  alert,
}: DetailMetaBarProps) {
  return (
    <div
      className="flex flex-col gap-2"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 16px",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">{children}</div>

      {/* Auditoria — mesma barra, segunda linha própria: é metadado de
          histórico, não informação operacional. Fonte menor que a linha de
          cima e um filete separando as duas categorias. */}
      <div
        className="flex items-center gap-3 flex-wrap text-xs pt-2"
        style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <span className="flex items-center gap-1.5">
          <Clock size={12} className="shrink-0" />
          {createdLabel} {formatDate(createdAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={12} className="shrink-0" />
          {updatedLabel} {formatDate(updatedAt)}
        </span>
      </div>

      {alert}
    </div>
  );
}

// ── InlineDocLink — vira link quando preenchido ──────────────────────────────

export function InlineDocLink({
  value,
  onSave,
  isPending,
}: {
  value: string;
  onSave: (v: string) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useEstadoDaProp(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (draft !== value) {
      onSave(draft);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://..."
          disabled={isPending}
          className="text-sm border border-line rounded px-2 py-0.5 bg-paper text-ink focus:outline-none focus:border-forest min-w-0 flex-1"
          style={{ borderColor: "var(--border-default)", borderRadius: "var(--radius-sm)" }}
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          aria-label="Salvar" data-tooltip="Salvar"
          style={{
            width: 22,
            height: 22,
            background: "var(--brand-primary)",
            borderRadius: "var(--radius-sm)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Check size={12} color="white" strokeWidth={3} />
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          aria-label="Cancelar" data-tooltip="Cancelar"
          style={{
            width: 22,
            height: 22,
            background: "transparent",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <X size={12} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <div className="group flex items-start gap-2">
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-bold text-forest hover:text-forest transition-colors truncate"
          onClick={(e) => e.stopPropagation()}
        >
          Acessar documento
          <ExternalLink size={14} />
        </a>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-50 group-focus-within:opacity-70 focus-visible:opacity-100 transition-opacity shrink-0 mt-0.5"
          aria-label="Editar link"
          data-tooltip="Editar link"
        >
          <Pencil size={11} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-1.5 cursor-pointer"
      {...editavelPorTeclado(() => setEditing(true), "Editar: Nenhum link disponível")}
    >
      <span className="text-sm text-ink-soft italic">Nenhum link disponível</span>
      <Pencil
        size={11}
        className="opacity-0 group-hover:opacity-50 group-focus-visible:opacity-70 transition-opacity shrink-0"
        style={{ color: "var(--text-muted)" }}
      />
    </div>
  );
}

/**
 * Rótulo de seção dentro do detalhe (Descrição, Objetivo, ICE Breakdown).
 * Mesma tipografia dos cabeçalhos de coluna das tabelas: 11px, 600, muted,
 * caixa alta. Os cards do experimento usavam 12–14px em negrito, o que os
 * fazia competir com o título da página.
 */
export function DetailSectionLabel({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {Icon && <Icon size={13} className="shrink-0" />}
      {children}
    </div>
  );
}
