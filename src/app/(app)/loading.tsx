// Suspense fallback do grupo (app).
// Sem este boundary, navegar entre páginas (Server Components dinâmicos)
// congela a tela até o servidor terminar de renderizar. Com ele, o clique
// transiciona instantaneamente e mostramos um esqueleto enquanto os dados
// do quarter/banco carregam.

import { Block } from "@/components/shared/Skeleton";
import { TopProgressBar } from "@/components/shared/TopProgressBar";

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando">
      <TopProgressBar />
      {/* Header */}
      <div className="space-y-3">
        <Block style={{ height: 28, width: 220 }} />
        <Block style={{ height: 16, width: 320 }} />
      </div>

      {/* Linha de cards/contadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} style={{ height: 96 }} />
        ))}
      </div>

      {/* Bloco maior de conteúdo */}
      <Block style={{ height: 220 }} />
      <Block style={{ height: 180 }} />
    </div>
  );
}
