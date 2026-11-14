"use client";

import { createContext, useContext, useState } from "react";
import { Layers } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";

type Agrupamento = { agrupado: boolean; alternar: () => void };

const Ctx = createContext<Agrupamento | null>(null);

/**
 * Liga/desliga, por card (Weekly de Rituais e "Precisa de você" do dashboard),
 * os checkpoints agrupados por tag. O botão mora no cabeçalho do card (ao lado
 * da estrela) e a lista mais abaixo — por isso o estado fica num provider em
 * volta dos dois, e não na lista.
 *
 * Começa agrupado: é a visão padrão sempre que o item tem checkpoint com tag
 * (sem tag, quem chama nem monta o provider). Fora do provider a lista fica
 * sem grupos.
 */
export function AgrupamentoPorTag({ children }: { children: React.ReactNode }) {
  const [agrupado, setAgrupado] = useState(true);
  return (
    <Ctx.Provider value={{ agrupado, alternar: () => setAgrupado((v) => !v) }}>{children}</Ctx.Provider>
  );
}

/** `true` quando a lista de checkpoints deve sair em grupos de tag. */
export function useAgrupadoPorTag(): boolean {
  return useContext(Ctx)?.agrupado ?? false;
}

/**
 * O botão do card, com a anatomia da estrela de prioridade ao lado (IconButton
 * de 20px, ícone de 13). Some em repouso, como ela, e aparece no hover do
 * card (`group/item`) ou no foco. Desagrupado ele fica à vista: é o card fora
 * do padrão, e o caminho de volta não pode se esconder.
 */
export function AgrupamentoPorTagToggle() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <IconButton
      boxSize={20}
      onClick={ctx.alternar}
      title={ctx.agrupado ? "Ver sem grupos" : "Agrupar por tag"}
      aria-pressed={ctx.agrupado}
      className={
        ctx.agrupado ? "shrink-0 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100" : "shrink-0"
      }
    >
      <Layers size={13} />
    </IconButton>
  );
}
