"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tooltip canônico do produto — o padrão visual nasceu no roadmap de
 * Ausências: caixa escura (tokens --bg-tooltip/--border-tooltip, legível nos
 * dois temas) que segue o cursor.
 *
 * Uso:
 *   const { tip, bind, clear } = useCursorTooltip<MinhaInfo>();
 *   <div {...bind(info)}>alvo</div>
 *   {tip && (
 *     <CursorTooltip x={tip.x} y={tip.y}>
 *       <TooltipTitle>{tip.data.nome}</TooltipTitle>
 *       <TooltipLine>{periodo}</TooltipLine>
 *       <TooltipLine dim italic>{nota}</TooltipLine>
 *       <TooltipHint>Clique para editar</TooltipHint>
 *     </CursorTooltip>
 *   )}
 *
 * Não use o `title` nativo do navegador nem recrie caixas locais — a página
 * /design-system (dev) documenta a anatomia.
 */

export function useCursorTooltip<T>() {
  const [tip, setTip] = useState<{ data: T; x: number; y: number } | null>(null);

  // Estado só muda ao ABRIR, TROCAR de alvo e FECHAR. Seguir o cursor é
  // trabalho do próprio `CursorTooltip`, que move o elemento direto no DOM.
  //
  // Antes o `onMouseMove` fazia setState a cada pixel: como o hook mora no
  // componente da página, a tela INTEIRA re-renderizava enquanto o mouse
  // passava por cima de um alvo. No roadmap (dezenas de barras arrastáveis,
  // faixas de ausência cobrindo o fundo) isso travava o navegador.
  // Estável entre renders: quem memoiza o alvo (as barras do roadmap) pode
  // receber o próprio `bind` como prop sem perder o memo a cada render da página.
  const bind = useCallback(
    (data: T) => ({
      onMouseEnter: (e: React.MouseEvent) => setTip({ data, x: e.clientX, y: e.clientY }),
      onMouseLeave: () => setTip(null),
    }),
    []
  );

  /**
   * Abre o tooltip sem mouse — usado no foco por teclado, onde não há
   * coordenada de cursor: quem chama passa o ponto (normalmente o canto do
   * elemento, via getBoundingClientRect).
   */
  const show = (data: T, x: number, y: number) => setTip({ data, x, y });

  return { tip, bind, show, clear: () => setTip(null) };
}

/** A caixa em si (sem posicionamento) — exportada para docs/usos estáticos. */
export function TooltipSurface({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`text-xs shadow-xl max-w-xs ${className}`}
      style={{
        background: "var(--bg-tooltip)",
        border: "1px solid var(--border-tooltip)",
        color: "white",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CursorTooltip({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  // `x`/`y` posicionam na abertura (e no foco por teclado, onde não há
  // mouse). Daí em diante o tooltip acompanha o cursor sozinho, mexendo só no
  // próprio estilo — nenhum componente re-renderiza por movimento do mouse.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function seguir(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      el.style.left = `${e.clientX + 12}px`;
      el.style.top = `${e.clientY - 8}px`;
    }
    window.addEventListener("mousemove", seguir, { passive: true });
    return () => window.removeEventListener("mousemove", seguir);
  }, []);

  return (
    <div ref={ref} className="fixed z-50 pointer-events-none" style={{ left: x + 12, top: y - 8 }}>
      <TooltipSurface>{children}</TooltipSurface>
    </div>
  );
}

export function TooltipTitle({ children }: { children: React.ReactNode }) {
  return <p className="font-semibold mb-1">{children}</p>;
}

export function TooltipLine({
  children,
  dim = false,
  italic = false,
}: {
  children: React.ReactNode;
  dim?: boolean;
  italic?: boolean;
}) {
  return (
    <p
      style={{
        color: dim ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.75)",
        fontStyle: italic ? "italic" : undefined,
        marginTop: dim ? 4 : undefined,
      }}
    >
      {children}
    </p>
  );
}

export function TooltipHint({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{children}</p>;
}

/**
 * Tooltip de uma linha só — o substituto do `title` nativo para rótulos de
 * botão ("Mostrar descrição", "Fechar (Esc)"). Um hook por componente serve
 * a vários alvos:
 *
 *   const rotulo = useLabelTooltip();
 *   <button {...rotulo.alvo("Fechar (Esc)")}>✕</button>
 *   {rotulo.tooltip}
 *
 * Fecha no mousedown: um botão que troca de rótulo ao ser clicado não fica
 * mostrando o texto antigo.
 */
export function useLabelTooltip() {
  const { tip, bind, clear } = useCursorTooltip<string>();
  return {
    alvo: (label: string | undefined) =>
      label
        ? { onMouseEnter: bind(label).onMouseEnter, onMouseLeave: clear, onMouseDown: clear }
        : {},
    tooltip: tip ? (
      <CursorTooltip x={tip.x} y={tip.y}>
        <TooltipLine>{tip.data}</TooltipLine>
      </CursorTooltip>
    ) : null,
  };
}
