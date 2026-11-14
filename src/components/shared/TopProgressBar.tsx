// Barra de progresso no topo da viewport. Renderizada dentro de loading.tsx,
// então fica visível exatamente enquanto uma navegação está pendente (o
// fallback monta durante a navegação e desmonta quando o conteúdo chega).
// É indeterminada (não sabemos a duração) — um traço desliza no topo.
export function TopProgressBar() {
  return <div className="top-progress" aria-hidden="true" />;
}
