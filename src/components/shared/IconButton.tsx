"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { CursorTooltip, TooltipLine, useCursorTooltip } from "@/components/shared/CursorTooltip";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tamanho da caixa quadrada (px). Padrão: 28. */
  boxSize?: number;
}

// Botão-ícone quadrado, ghost, com hover consistente (CSS em .icon-btn).
//
// `title` NÃO vira o tooltip nativo do navegador (fora do tema, com atraso do
// SO): vira o CursorTooltip do design system, no hover e no foco por teclado.
// O texto é lido na hora de desenhar, então um botão que troca de rótulo ao
// ser clicado ("Segmentar" → "Voltar") mostra o rótulo novo sem reabrir.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      boxSize = 28,
      className = "",
      style,
      children,
      title,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const { tip, bind, show, clear } = useCursorTooltip<true>();
    const mouse = bind(true);
    return (
      <>
        <button
          ref={ref}
          className={`icon-btn ${className}`.trim()}
          style={{ width: boxSize, height: boxSize, ...style }}
          // Sem o title nativo, o nome acessível vem daqui quando o chamador
          // não passou aria-label.
          aria-label={props["aria-label"] ?? title}
          onMouseEnter={(e) => {
            if (title) mouse.onMouseEnter(e);
            onMouseEnter?.(e);
          }}
          onMouseLeave={(e) => {
            clear();
            onMouseLeave?.(e);
          }}
          onFocus={(e) => {
            // Só no foco por teclado: clique também foca, e o tooltip de hover
            // já está aberto nesse caso.
            if (title && e.currentTarget.matches(":focus-visible")) {
              const r = e.currentTarget.getBoundingClientRect();
              show(true, r.left + r.width / 2, r.bottom + 8);
            }
            onFocus?.(e);
          }}
          onBlur={(e) => {
            clear();
            onBlur?.(e);
          }}
          {...props}
        >
          {children}
        </button>
        {tip && title && (
          <CursorTooltip x={tip.x} y={tip.y}>
            <TooltipLine>{title}</TooltipLine>
          </CursorTooltip>
        )}
      </>
    );
  }
);

IconButton.displayName = "IconButton";
