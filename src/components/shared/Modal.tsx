"use client";

import { ReactNode, useRef } from "react";
import { useDialog } from "@/components/shared/useDialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Largura máxima do painel (px). Padrão: 560. */
  maxWidth?: number;
  /** id do elemento que rotula o modal (acessibilidade). */
  labelledBy?: string;
}

// Modal base: overlay + painel com abertura animada (CSS), fecha por ESC e
// clique no fundo. As animações respeitam "reduzir movimento" (reset global).
// Foco, Tab preso no painel e Esc só no diálogo de cima: ver useDialog.
export function Modal({ open, onClose, children, maxWidth = 560, labelledBy }: ModalProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  useDialog(painelRef, open, onClose);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={painelRef} className="modal-panel" style={{ maxWidth, outline: "none" }}>
        {children}
      </div>
    </div>
  );
}
