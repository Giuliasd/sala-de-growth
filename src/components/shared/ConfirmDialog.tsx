"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { useDialog } from "@/components/shared/useDialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  /** Pode devolver uma Promise: enquanto ela não resolve, o Confirmar fica travado (sem duplo clique). */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const mensagemId = useId();
  const [ocupado, setOcupado] = useState(false);
  // Foco inicial no primeiro botão (Cancelar): o padrão seguro para ação
  // destrutiva. Esc fecha só este diálogo (ver useDialog).
  useDialog(painelRef, true, onCancel);

  function confirmar() {
    if (ocupado) return;
    const r = onConfirm();
    // Só trava se a ação é assíncrona: quem fecha o diálogo de forma síncrona
    // não precisa, e quem devolve void não pode ficar preso sem poder tentar de novo.
    if (r instanceof Promise) {
      setOcupado(true);
      const liberar = () => setOcupado(false);
      r.then(liberar, liberar);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      aria-describedby={mensagemId}
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={painelRef}
        className="w-full"
        style={{
          outline: "none",
          maxWidth: 400,
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-xl)",
          padding: 28,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-full)",
              background:
                variant === "danger"
                  ? "var(--status-error-bg)"
                  : "var(--accent-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle
              size={18}
              style={{
                color:
                  variant === "danger"
                    ? "var(--status-error-text)"
                    : "var(--brand-primary)",
              }}
            />
          </div>
          <h3
            id={tituloId}
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h3>
        </div>

        <p
          id={mensagemId}
          className="text-sm mb-6"
          style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}
        >
          {message}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} size="sm" onClick={confirmar} disabled={ocupado}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
