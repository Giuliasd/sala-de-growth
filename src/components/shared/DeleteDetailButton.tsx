"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

type DeleteResult = { success: true } | { success: false; error: string };

/**
 * Botão "Excluir" para as telas de detalhe de iniciativa/experimento.
 *
 * Ao confirmar, chama a server action `action` (soft delete). No sucesso:
 * - dentro do popup `DetailModal` (`?modal=1`, iframe): avisa a janela-pai
 *   (`postMessage`) para fechar o popup e revalidar a página de baixo;
 * - na página cheia: navega de volta para a lista (`redirectTo`).
 */
export function DeleteDetailButton({
  action,
  title,
  message,
  redirectTo,
}: {
  action: () => Promise<DeleteResult>;
  title: string;
  message: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isModal = searchParams.get("modal") === "1";
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setConfirming(false);
    setIsPending(true);
    setError(null);

    const res = await action();

    if (!res.success) {
      setError(res.error);
      setIsPending(false);
      return;
    }

    if (isModal && typeof window !== "undefined" && window.parent !== window) {
      // Dentro do iframe do DetailModal: pede pra janela-pai fechar e revalidar.
      window.parent.postMessage("detail-modal:deleted", window.location.origin);
    } else {
      router.push(redirectTo);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="danger"
        size="md"
        onClick={() => setConfirming(true)}
        disabled={isPending}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        Excluir
      </Button>
      {error && (
        <p className="text-xs" style={{ color: "var(--status-error-text)" }}>
          {error}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title={title}
          message={message}
          confirmLabel="Excluir"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
