"use client";

import { useEffect } from "react";
import { desfazerUltima, temUndo } from "@/lib/undo";
import { toast } from "@/components/shared/Toast";

/** O alvo do evento é um campo onde o Ctrl+Z do navegador tem trabalho a fazer? */
function estaDigitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Ctrl+Z (Cmd+Z no Mac) desfaz a última edição salva no app.
 *
 * Dentro de campo de texto o atalho é deixado para o navegador: ali Ctrl+Z é o
 * desfazer da digitação, e roubá-lo seria uma troca ruim — reverter uma edição
 * salva no lugar de apagar as três letras que a pessoa acabou de digitar.
 *
 * Ctrl+Shift+Z (refazer) não é tratado: não existe pilha de redo, e engolir o
 * atalho faria parecer que existe.
 */
export function UndoHotkey() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "z") return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (estaDigitando(e.target)) return;
      if (!temUndo()) return; // sem nada na pilha, o atalho não é nosso

      e.preventDefault();
      desfazerUltima()
        .then((rotulo) => {
          if (rotulo) toast(`Desfeito: ${rotulo}`);
        })
        .catch(() => toast("Não foi possível desfazer.", "error"));
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
