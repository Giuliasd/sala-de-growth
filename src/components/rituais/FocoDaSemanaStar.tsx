"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { toast } from "@/components/shared/Toast";
import { registrarEdicao } from "@/lib/undo";
import { toggleWeeklyFocus, type FocoKind } from "@/actions/weekly-focus";

/**
 * Estrela que marca o item como prioridade da semana daquela pessoa.
 *
 * Mesma anatomia da lixeira do checkpoint: IconButton pequeno, discreto, que
 * aparece no hover do card. A diferença é que marcada ela é ESTADO, não ação —
 * então fica sempre visível e preenchida, senão o foco da semana desapareceria
 * justamente quando o time está lendo a Weekly em conjunto.
 */
export function FocoDaSemanaStar({
  weekOf,
  memberId,
  itemId,
  kind,
  marcado,
}: {
  /** Segunda-feira da semana exibida, "yyyy-mm-dd". */
  weekOf: string;
  /** De quem é a linha — o foco é por pessoa, não do item. */
  memberId: string;
  itemId: string;
  kind: FocoKind;
  marcado: boolean;
}) {
  const [salvando, startTransition] = useTransition();
  // Otimista: a estrela responde ao clique sem esperar o servidor. Se a action
  // falhar, o valor volta e o erro vai para o toast.
  const [otimista, setOtimista] = useState<boolean | null>(null);
  // O otimista vale até o servidor responder: quando a prop muda, ela volta a
  // mandar. Sem isso ele ficava preso e escondia mudanças posteriores (Ctrl+Z,
  // edição em outra tela) até recarregar a página.
  const [servidorAnterior, setServidorAnterior] = useState(marcado);
  if (servidorAnterior !== marcado) {
    setServidorAnterior(marcado);
    setOtimista(null);
  }
  const aceso = otimista ?? marcado;

  async function alternar() {
    const res = await toggleWeeklyFocus({ weekOf, memberId, itemId, kind });
    if (!res.success) {
      setOtimista(null);
      toast(res.error, "error");
      throw new Error(res.error);
    }
  }

  function onClick() {
    if (salvando) return;
    const proximo = !aceso;
    setOtimista(proximo);
    // Desfazer é o mesmo clique de novo (o toggle é sua própria inversa).
    registrarEdicao(proximo ? "prioridade da semana" : "prioridade removida", () => alternar());
    startTransition(async () => {
      try {
        await alternar();
      } catch {
        // Erro já foi para o toast.
      }
    });
  }

  return (
    <IconButton
      boxSize={20}
      onClick={onClick}
      title={aceso ? "Tirar da prioridade da semana" : "Marcar como prioridade da semana"}
      aria-label={aceso ? "Tirar da prioridade da semana" : "Marcar como prioridade da semana"}
      aria-pressed={aceso}
      // Aparece no hover do card do item e também no da linha de ação.
      className={`shrink-0 ${aceso ? "" : "opacity-0 group-hover/item:opacity-100 group-hover/acao:opacity-100 focus-visible:opacity-100"} ${
        salvando ? "opacity-60" : ""
      }`}
      style={{ color: aceso ? "var(--butter-strong)" : "var(--text-muted)" }}
    >
      <Star size={13} strokeWidth={2} fill={aceso ? "currentColor" : "none"} />
    </IconButton>
  );
}
