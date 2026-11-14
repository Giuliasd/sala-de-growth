"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2 } from "lucide-react";
import { convertExperimentoToIniciativa } from "@/actions/experimentos";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

export function ConvertToIniciativaButton({ experimentoId }: { experimentoId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleConvert() {
    setConfirming(false);
    setIsPending(true);
    setError(null);

    const res = await convertExperimentoToIniciativa(experimentoId);
    
    if (res.success) {
      router.push(`/iniciativas/${res.data}`);
    } else {
      setError(res.error);
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="md" onClick={() => setConfirming(true)} disabled={isPending}>
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
        Converter em Iniciativa
      </Button>
      {error && <p className="text-xs" style={{ color: "var(--status-error-text)" }}>{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Converter em iniciativa"
          message="Tem certeza que deseja converter este experimento em uma iniciativa? O experimento será arquivado."
          confirmLabel="Converter"
          variant="primary"
          onConfirm={handleConvert}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
