"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { registrarEdicao } from "@/lib/undo";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";

/**
 * Campo inline de RESPONSÁVEIS no detalhe de iniciativa/experimento.
 *
 * O `InlineSelectField` não serve: ele escolhe um valor e fecha, e
 * responsabilidade aqui é N:N. Este mostra avatar + nome de cada pessoa e, no
 * clique, abre um popover com o MemberPicker; cada marcar/desmarcar salva na
 * hora, como os demais campos do detalhe (não há botão "salvar").
 */
export function InlineMemberField({
  value,
  members,
  onSave,
  isPending,
  emptyLabel = "— sem responsáveis —",
}: {
  /** Ids atualmente responsáveis. */
  value: string[];
  /** Membros selecionáveis (a página já filtra inativos/visitantes). */
  members: { id: string; name: string }[];
  onSave: (next: string[]) => void;
  isPending: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Tooltip do design system no lugar do `title` nativo; some com o menu aberto.
  const rotulo = useLabelTooltip();
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

  const selected = members.filter((m) => value.includes(m.id));

  return (
    <div ref={ref} className="relative inline-flex items-center">
      {!open && rotulo.tooltip}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        {...rotulo.alvo(open ? undefined : "Editar responsáveis")}
        className="group inline-flex items-center gap-2 flex-wrap text-left"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {selected.length === 0 ? (
          <>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "var(--radius-full)",
                background: "var(--border-default)",
                flexShrink: 0,
              }}
            />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {emptyLabel}
            </span>
          </>
        ) : (
          selected.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5">
              <Avatar name={m.name} size={24} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {m.name}
              </span>
            </span>
          ))
        )}
        <Pencil
          size={12}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
          style={{ color: "var(--text-muted)" }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 p-3"
          style={{
            minWidth: 260,
            maxWidth: 340,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Responsáveis
          </p>
          <MemberPicker
            members={members}
            value={value}
            onChange={(next) => {
              // Desfazer devolve a lista anterior inteira: responsabilidade é
              // N:N e o form sempre manda a lista final (ver AGENTS).
              const anterior = value;
              registrarEdicao("responsáveis", () => onSave(anterior));
              onSave(next);
            }}
          />
        </div>
      )}
    </div>
  );
}
