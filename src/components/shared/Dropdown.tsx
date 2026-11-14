"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { TagSelect, type TagSelectOption } from "./TagSelect";

export type DropdownOption = TagSelectOption;

/**
 * O dropdown padrão do produto: um botão de superfície com rótulo e chevron,
 * abrindo o menu estilizado do `TagSelect` (portal, tema, teclado).
 *
 * **Todo dropdown da Sala de Growth usa este componente** — seletor de quarter,
 * filtro de responsável, filtros de lista. Nunca um `<select>` nativo: o menu
 * dele é desenhado pelo sistema operacional (fundo branco, azul do Windows) e
 * quebra o tema em qualquer tela.
 *
 * Para o pill que é o próprio gatilho (status, prioridade, resultado), use
 * `TagSelect` direto — é o mesmo menu, com outro gatilho.
 */
export function Dropdown({
  value,
  options,
  onChange,
  /** Texto curto à esquerda do valor, dentro do botão (ex.: "Responsável"). */
  label,
  /** Ícone à esquerda do rótulo. */
  icon,
  placeholder = "Selecione",
  disabled,
  title,
  menuWidth,
  fullWidth,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  label?: string;
  icon?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  menuWidth?: number;
  fullWidth?: boolean;
}) {
  const selecionada = options.find((o) => o.value === value);

  return (
    <TagSelect
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      title={title}
      fullWidth={fullWidth}
      menuWidth={menuWidth ?? (fullWidth ? undefined : 220)}
    >
      <span
        className="inline-flex items-center gap-2 text-sm px-4 py-2 font-medium u-transition"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          color: "var(--text-primary)",
          opacity: disabled ? 0.6 : 1,
          width: fullWidth ? "100%" : undefined,
        }}
      >
        {icon && <span className="shrink-0 inline-flex">{icon}</span>}
        {label && (
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{label}</span>
        )}
        <span className="truncate">
          {selecionada ? (
            selecionada.label
          ) : (
            <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0"
          style={{ color: "var(--text-muted)", marginLeft: fullWidth ? "auto" : 0 }}
        />
      </span>
    </TagSelect>
  );
}
