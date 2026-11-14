"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  /** Texto exibido quando nada está selecionado (ex.: "Todas as frentes"). */
  label: string;
  options: MultiSelectOption[];
  /** Valores selecionados. */
  selected: string[];
  onChange: (next: string[]) => void;
  /**
   * Escolha única: clicar troca a seleção e fecha o menu, e o gatilho mostra o
   * rótulo escolhido em vez da contagem. É o caso dos filtros que o produto
   * guarda como um valor só na URL (tipo e frente do roadmap) — o desenho é o
   * mesmo dos vizinhos, só o comportamento muda.
   */
  single?: boolean;
}

/**
 * Dropdown de seleção múltipla com checkboxes — substitui os <select> de filtro
 * permitindo escolher mais de uma opção por campo. O gatilho mostra o label e,
 * quando há seleção, a contagem (ex.: "Frentes (2)").
 */
export function MultiSelect({ label, options, selected, onChange, single }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // Esc fecha e devolve o foco ao gatilho (senão o teclado ficava perdido).
      if (e.key === "Escape") {
        setOpen(false);
        gatilhoRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    if (single) {
      onChange(selected.includes(value) ? [] : [value]);
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  const hasSelection = selected.length > 0;
  const triggerLabel = !hasSelection
    ? label
    : single
    ? options.find((o) => o.value === selected[0])?.label ?? label
    : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="appearance-none inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs focus:outline-none transition-colors"
        style={{
          background: hasSelection ? "var(--accent-subtle)" : "var(--bg-app)",
          border: `1px solid ${hasSelection ? "var(--brand-primary)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-sm)",
          color: hasSelection ? "var(--brand-primary)" : "var(--text-secondary)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {triggerLabel}
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <div
          id={menuId}
          // Opções são botões de alternar (aria-pressed): Tab passa por elas e
          // Enter/Espaço marca ou desmarca, sem precisar de teclas especiais.
          role="group"
          aria-label={label}
          className="absolute left-0 top-full mt-1 z-50 py-1 max-h-64 overflow-y-auto"
          style={{
            minWidth: "100%",
            width: "max-content",
            maxWidth: 260,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {options.map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-app)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <span
                  aria-hidden
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
                    background: active ? "var(--brand-primary)" : "transparent",
                    color: "white",
                  }}
                >
                  {active && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
