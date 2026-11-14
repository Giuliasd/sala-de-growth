"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { convertIniciativaToExperimento } from "@/actions/iniciativas";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

export function ConvertToExperimentoButton({ iniciativaId }: { iniciativaId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleConvert() {
    setConfirming(false);
    setIsPending(true);
    setError(null);

    const res = await convertIniciativaToExperimento(iniciativaId);
    
    if (res.success) {
      router.push(`/experimentos/${res.data}`);
    } else {
      setError(res.error);
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="md" onClick={() => setConfirming(true)} disabled={isPending}>
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
        Converter em Experimento
      </Button>
      {error && <p className="text-xs" style={{ color: "var(--status-error-text)" }}>{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Converter em experimento"
          message="Tem certeza que deseja converter esta iniciativa em um experimento? A iniciativa será arquivada."
          confirmLabel="Converter"
          variant="primary"
          onConfirm={handleConvert}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
