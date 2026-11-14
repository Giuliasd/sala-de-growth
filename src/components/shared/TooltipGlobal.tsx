"use client";

import { useEffect, useRef, useState } from "react";
import { CursorTooltip, TooltipLine } from "@/components/shared/CursorTooltip";

/**
 * Tooltip de uma linha para QUALQUER elemento, sem hook no componente:
 *
 *   <span data-tooltip="Nome completo do item">Nome cort…</span>
 *
 * É o substituto do `title` nativo (que abre a caixa do sistema, fora do tema e
 * com atraso). Um único ouvinte no documento (montado no layout) acompanha o
 * mouse e o foco por teclado e desenha o `CursorTooltip` padrão.
 *
 * Diferente do `title`, `data-tooltip` não dá nome acessível: em botão ou link
 * só com ícone, ponha também `aria-label`. Para conteúdo rico (título + linhas)
 * use `useCursorTooltip`; botão-ícone já é coberto pelo `IconButton`.
 */
export const ATRIBUTO_TOOLTIP = "data-tooltip";

const SELETOR = `[${ATRIBUTO_TOOLTIP}]`;

function alvoDe(t: EventTarget | null): Element | null {
  return t instanceof Element ? t.closest(SELETOR) : null;
}

export function TooltipGlobal() {
  const [tip, setTip] = useState<{ texto: string; x: number; y: number } | null>(null);
  const atual = useRef<Element | null>(null);

  useEffect(() => {
    function fechar() {
      atual.current = null;
      setTip(null);
    }
    function aoPassar(e: MouseEvent) {
      const el = alvoDe(e.target);
      if (el === atual.current) return;
      atual.current = el;
      const texto = el?.getAttribute(ATRIBUTO_TOOLTIP)?.trim();
      setTip(el && texto ? { texto, x: e.clientX, y: e.clientY } : null);
    }
    function aoSairDaJanela(e: MouseEvent) {
      if (e.relatedTarget === null) fechar();
    }
    function aoFocar(e: FocusEvent) {
      // Só foco por teclado: o clique também foca, e o hover já cobre esse caso.
      if (!(e.target instanceof Element) || !e.target.matches(":focus-visible")) return;
      const el = alvoDe(e.target);
      const texto = el?.getAttribute(ATRIBUTO_TOOLTIP)?.trim();
      if (!el || !texto) return;
      atual.current = el;
      const r = el.getBoundingClientRect();
      setTip({ texto, x: r.left + r.width / 2, y: r.bottom + 8 });
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }

    document.addEventListener("mouseover", aoPassar, { passive: true });
    document.addEventListener("mouseout", aoSairDaJanela, { passive: true });
    // Clicar fecha: um botão que troca de rótulo ao ser clicado não fica
    // mostrando o texto antigo.
    document.addEventListener("mousedown", fechar);
    document.addEventListener("focusin", aoFocar);
    document.addEventListener("focusout", fechar);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", fechar, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mouseover", aoPassar);
      document.removeEventListener("mouseout", aoSairDaJanela);
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("focusin", aoFocar);
      document.removeEventListener("focusout", fechar);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", fechar, { capture: true });
    };
  }, []);

  if (!tip) return null;
  return (
    <CursorTooltip x={tip.x} y={tip.y}>
      <TooltipLine>{tip.texto}</TooltipLine>
    </CursorTooltip>
  );
}
