"use client";

import { RefObject, useEffect, useRef } from "react";

/**
 * Comportamento comum de diálogo modal (Modal e ConfirmDialog):
 *
 * - foco inicial dentro do painel (sem roubar o de um campo com `autoFocus`);
 * - Tab/Shift+Tab ficam presos no painel — sem isso o foco vai para a página
 *   atrás do overlay;
 * - Esc fecha SÓ o diálogo de cima. Cada diálogo tinha o próprio listener no
 *   `document`, então um ConfirmDialog aberto sobre um Modal fechava os dois
 *   com um Esc;
 * - ao fechar, o foco volta para quem abriu.
 */

// Pilha dos diálogos abertos: só o último reage a Esc e Tab.
const pilha: symbol[] = [];

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveisDe(painel: HTMLElement): HTMLElement[] {
  return Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export function useDialog(
  ref: RefObject<HTMLElement | null>,
  ativo: boolean,
  onClose: () => void
) {
  // Ref para o handler: um `onClose` novo a cada render não pode refazer o
  // efeito (e roubar o foco de novo).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const painel = ref.current;
    if (!ativo || !painel) return;

    const eu = Symbol("dialog");
    pilha.push(eu);
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!painel.contains(document.activeElement)) {
      if (!painel.hasAttribute("tabindex")) painel.setAttribute("tabindex", "-1");
      (focaveisDe(painel)[0] ?? painel).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (pilha[pilha.length - 1] !== eu) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !painel) return;
      const itens = focaveisDe(painel);
      if (itens.length === 0) {
        e.preventDefault();
        painel.focus();
        return;
      }
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === painel)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = pilha.indexOf(eu);
      if (i >= 0) pilha.splice(i, 1);
      if (anterior && document.contains(anterior)) anterior.focus();
    };
  }, [ativo, ref]);
}
