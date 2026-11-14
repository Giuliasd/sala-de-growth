"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { registrarEdicao } from "@/lib/undo";
import { useLabelTooltip } from "./CursorTooltip";
import { useHidratado } from "@/hooks/useHidratado";

export type TagSelectOption = {
  value: string;
  label: string;
  icon?: React.ReactNode;
};

/**
 * Dropdown de edição de tag no tema do produto — substitui o `<select>` nativo
 * (que abre o menu sem estilo do sistema operacional) usado para editar tags de
 * status/prioridade nos cards e tabelas.
 *
 * O `children` é o gatilho (o próprio pill/badge). Ao clicar, abre um menu
 * estilizado. O menu vai num portal com posição fixa ancorada no gatilho, então
 * não é cortado por `overflow` de cards/tabelas nem por containing blocks.
 *
 * Fecha com clique fora, Esc, ou scroll/resize. Setas ↑/↓ navegam, Enter
 * seleciona.
 */
export function TagSelect({
  value,
  options,
  onChange,
  disabled,
  title,
  children,
  undoLabel,
  menuWidth,
  fullWidth,
}: {
  value: string;
  options: TagSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  /**
   * Nome do campo no toast do Ctrl+Z ("status", "prioridade"). Sem isso o
   * desfazer ainda funciona, só fica com rótulo genérico.
   */
  undoLabel?: string;
  /** Largura do menu. Sem valor: acompanha o gatilho quando fullWidth, senão 176. */
  menuWidth?: number;
  /** Gatilho ocupa a largura toda (campo de formulário, não pill). */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // O menu é portal em document.body: só existe no navegador.
  const mounted = useHidratado();
  const listaId = useId();
  const idDaOpcao = (i: number) => `${listaId}-${i}`;
  // `title` vira o tooltip do design system, não o nativo do navegador.
  const rotulo = useLabelTooltip();

  function computePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 36 + 8, 320);
    const spaceBelow = window.innerHeight - r.bottom;
    // Abre pra cima se não couber embaixo.
    const top = spaceBelow < estimatedHeight + 8 && r.top > estimatedHeight
      ? r.top - estimatedHeight - 4
      : r.bottom + 4;
    // Num gatilho de largura total (campo de formulário) o menu acompanha a
    // largura do campo; num pill, mantém a largura fixa do menu de tags.
    const largura = menuWidth ?? (fullWidth ? r.width : 176);
    // Alinha à esquerda, mas não deixa vazar da viewport.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    setCoords({ top, left, width: largura });
  }

  function openMenu() {
    if (disabled) return;
    computePosition();
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  // Reposiciona ao abrir (antes de pintar, evita "pulo").
  useLayoutEffect(() => {
    if (open) computePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % options.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + options.length) % options.length); }
      else if (e.key === "Enter") { e.preventDefault(); select(options[activeIdx]?.value); }
    }
    function onScroll(e: Event) {
      // Ignora o scroll interno do próprio menu (lista longa) — só o scroll da
      // página deve fechar, já que o menu é `position: fixed` e não acompanha.
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onResize() { setOpen(false); }
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options, activeIdx]);

  // Ao abrir, o foco vai para a lista (é nela que o leitor de tela acompanha a
  // opção ativa). Sem preventScroll a página pularia até o menu fixo.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => menuRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // As setas movem a opção ativa: a lista rola para ela ficar visível.
  useEffect(() => {
    if (open) document.getElementById(idDaOpcao(activeIdx))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx]);

  function select(v?: string) {
    // Barra só `undefined` (ex.: Enter sem opção ativa). String vazia é válida —
    // é o valor de opções "limpar"/"a definir".
    if (v === undefined) return;
    setOpen(false);
    // O foco estava na lista, que some: volta para o gatilho.
    triggerRef.current?.focus({ preventScroll: true });
    if (v === value) return;
    // Desfazer é reaplicar o mesmo onChange com o valor de antes. Registramos
    // ao disparar, não ao confirmar: o componente não fica sabendo se a action
    // deu certo. Se a edição falhou, o Ctrl+Z reaplica o valor que já estava —
    // inofensivo.
    const anterior = value;
    const rotuloAnterior = options.find((o) => o.value === anterior)?.label;
    registrarEdicao(
      undoLabel && rotuloAnterior
        ? `${undoLabel} para ${rotuloAnterior}`
        : undoLabel ?? "alteração",
      () => onChange(anterior)
    );
    onChange(v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        {...rotulo.alvo(open ? undefined : title)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listaId : undefined}
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        className={`${fullWidth ? "flex w-full" : "inline-flex"} items-center border-none bg-transparent p-0`}
        style={{ cursor: disabled ? "default" : "pointer" }}
      >
        {children}
      </button>
      {!open && rotulo.tooltip}

      {open && coords && mounted &&
        createPortal(
          <div
            ref={menuRef}
            id={listaId}
            role="listbox"
            aria-label={title ?? undoLabel ?? "Opções"}
            // O foco entra na lista ao abrir; as setas movem a opção ativa, que o
            // leitor de tela anuncia por aria-activedescendant.
            tabIndex={-1}
            aria-activedescendant={idDaOpcao(activeIdx)}
            className="py-1 u-transition"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              zIndex: 9999,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {options.map((opt, idx) => {
              const selected = opt.value === value;
              const active = idx === activeIdx;
              return (
                <button
                  key={opt.value}
                  id={idDaOpcao(idx)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  // Navegação é pelas setas (o foco fica no gatilho): Tab não para em cada opção.
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={(e) => { e.stopPropagation(); select(opt.value); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-none u-transition"
                  style={{
                    background: active ? "var(--accent-subtle)" : "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {opt.icon && <span className="shrink-0 inline-flex">{opt.icon}</span>}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {selected && <Check size={14} style={{ color: "var(--brand-primary)" }} className="shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
