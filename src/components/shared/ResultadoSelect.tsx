"use client";

import { useState } from "react";
import { CircleDashed } from "lucide-react";
import { Badge } from "@/components/shared/Badge";
import { TagSelect } from "@/components/shared/TagSelect";
import { RESULTADO_CONFIG } from "@/components/shared/ResultadoBadge";
import { updateExperimentoResultado } from "@/actions/experimentos";
import { ResultadoFinal } from "@/generated/prisma/enums";
import { toast } from "@/components/shared/Toast";

// Estado "sem resultado" — pill neutro que aparece mesmo vazio, para deixar
// explícito que o desfecho ainda não foi definido (e servir de gatilho de edição).
const EMPTY_CONFIG = {
  label: "A definir",
  bg: "var(--color-cream)",
  color: "var(--text-muted)",
  borderColor: "var(--color-line)",
  icon: CircleDashed,
};

// "" limpa o resultado (volta pra "a definir").
const OPTIONS = [
  { value: "", label: EMPTY_CONFIG.label },
  { value: "SUCESSO", label: "Sucesso" },
  { value: "PARCIAL", label: "Parcial" },
  { value: "FALHA", label: "Falha" },
];

/**
 * Pill de resultado do experimento, editável clicando na tag (via TagSelect).
 * Aparece mesmo quando vazio ("A definir"). Quando `disabled`, vira só leitura.
 */
export function ResultadoSelect({
  experimentoId,
  resultado,
  disabled,
}: {
  experimentoId: string;
  resultado: string | null;
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState(resultado ?? "");
  const [isLoading, setIsLoading] = useState(false);

  // Sincroniza com a prop quando ela muda (revalidação do servidor), sem effect.
  const [prevResultado, setPrevResultado] = useState(resultado);
  if (resultado !== prevResultado) {
    setPrevResultado(resultado);
    setCurrent(resultado ?? "");
  }

  const cfg = (current && RESULTADO_CONFIG[current]) || EMPTY_CONFIG;

  const badge = (
    <Badge
      bg={cfg.bg}
      color={cfg.color}
      borderColor={cfg.borderColor}
      icon={cfg.icon}
      className={disabled ? "" : "u-transition cursor-pointer hover:brightness-95"}
    >
      {cfg.label}
    </Badge>
  );

  if (disabled) return badge;

  async function handleChange(value: string) {
    const prev = current;
    setCurrent(value);
    setIsLoading(true);
    // Atualização otimista: reflete na hora; reverte se a action falhar.
    const res = await updateExperimentoResultado(
      experimentoId,
      (value || null) as ResultadoFinal | null,
    );
    setIsLoading(false);
    if (!res.success) {
      setCurrent(prev);
      toast(res.error, "error");
    } else {
      toast("Resultado atualizado.");
    }
  }

  return (
    <span className={`inline-flex ${isLoading ? "opacity-50" : ""}`}>
      <TagSelect
        value={current}
        options={OPTIONS}
        undoLabel="resultado"
        onChange={handleChange}
        disabled={isLoading}
        title="Alterar resultado"
      >
        {badge}
      </TagSelect>
    </span>
  );
}
