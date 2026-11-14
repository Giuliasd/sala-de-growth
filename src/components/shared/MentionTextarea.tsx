"use client";

import { useId, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Textarea } from "@/components/shared/Field";
import { Avatar } from "@/components/shared/Avatar";
import { aplicarMencao, detectarMencaoEmCurso, sugerirMembros } from "@/lib/mencao-autocomplete";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (valor: string) => void;
  /** Quem pode ser mencionado (só gente ativa). */
  membros: { id: string; name: string }[];
};

/**
 * Textarea de comentário com autocomplete de "@": ao digitar "@", lista as
 * pessoas do time; Enter/Tab (ou clique) insere o nome completo. Setas movem,
 * Esc fecha. Quem é mencionado recebe uma notificação ao enviar — o servidor lê
 * o texto, então digitar "@Nome Completo" à mão funciona do mesmo jeito.
 */
export function MentionTextarea({ value, onValueChange, membros, onKeyDown, onBlur, ...resto }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listaId = useId();
  const [cursor, setCursor] = useState(0);
  const [foco, setFoco] = useState(false);
  const [indice, setIndice] = useState(0);
  // "@" cuja lista o usuário fechou com Esc: não reabre até ele digitar outro.
  const [dispensado, setDispensado] = useState<number | null>(null);

  const mencao = foco ? detectarMencaoEmCurso(value, cursor) : null;
  const opcoes = mencao && mencao.inicio !== dispensado ? sugerirMembros(mencao.consulta, membros) : [];
  const aberto = opcoes.length > 0;
  const ativo = Math.min(indice, Math.max(opcoes.length - 1, 0));

  function escolher(nome: string) {
    if (!mencao) return;
    const r = aplicarMencao(value, mencao, cursor, nome);
    onValueChange(r.texto);
    setCursor(r.cursor);
    setIndice(0);
    // O valor novo só chega ao DOM no próximo render: o cursor vai depois dele.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(r.cursor, r.cursor);
      }
    });
  }

  return (
    <div className="relative">
      <Textarea
        {...resto}
        ref={ref}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={aberto ? listaId : undefined}
        aria-activedescendant={aberto ? `${listaId}-${ativo}` : undefined}
        onChange={(e) => {
          onValueChange(e.target.value);
          setCursor(e.target.selectionStart);
          setIndice(0);
        }}
        // O cursor anda sem o texto mudar (setas, clique): a lista acompanha.
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onFocus={() => setFoco(true)}
        onBlur={(e) => {
          setFoco(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (aberto) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndice((ativo + 1) % opcoes.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndice((ativo - 1 + opcoes.length) % opcoes.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              escolher(opcoes[ativo].name);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDispensado(mencao?.inicio ?? null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />

      {aberto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Pessoas do time"
          className="absolute left-0 z-20 mt-1 w-64 max-w-full overflow-hidden"
          style={{
            top: "100%",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.12))",
          }}
        >
          {opcoes.map((m, i) => (
            <li
              key={m.id}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === ativo}
              // mousedown, não click: o click chegaria depois do blur do campo,
              // que fecha a lista antes de a escolha acontecer.
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(m.name);
              }}
              onMouseEnter={() => setIndice(i)}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer"
              style={{
                background: i === ativo ? "var(--accent-subtle)" : "transparent",
                color: "var(--text-primary)",
              }}
            >
              <Avatar name={m.name} size={20} />
              <span className="truncate">{m.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
