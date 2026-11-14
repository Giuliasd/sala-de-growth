"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Base dos gráficos de OKR (`OKRHistory`, `OKRMonthlyHistory`).
 *
 * Os gráficos são SVG desenhados em pixels reais — nada de `viewBox` esticado.
 * Com `viewBox` + `width="100%"` o texto crescia junto com a tela e virava um
 * número gigante perto do resto da página (text-xs = 12px). Aqui o texto tem
 * sempre `CHART_FONT` px, em qualquer largura.
 */

/** Tamanho de fonte dos rótulos dos eixos, em px. Menor que o text-xs da página. */
export const CHART_FONT = 10;

/** Largura média de um caractere da fonte mono em `CHART_FONT` px. */
const CHAR_W = 6.1;

/** Mede a largura útil do container (acompanha o redimensionamento). */
export function useLarguraDoContainer(inicial = 560) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(inicial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setLargura(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, largura };
}

const compacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const simples = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * Rótulo curto para o eixo: "R$ 307 mil", "R$ 1,85 mi", "4,1%", "640".
 * O valor exato aparece no tooltip e na lista de atualizações.
 */
export function formatEixoY(value: number, unit: string): string {
  const num = Math.abs(value) >= 1000 ? compacto.format(value) : simples.format(value);
  if (unit === "REAL") return `R$ ${num}`;
  if (unit === "PORCENTAGEM") return `${num}%`;
  return num;
}

/** Margem esquerda que comporta o maior rótulo do eixo Y. */
export function margemEsquerda(rotulos: string[]): number {
  const maior = Math.max(0, ...rotulos.map((r) => r.length));
  return Math.max(36, Math.ceil(maior * CHAR_W) + 14);
}

/** "13 de nov." */
export function formatDiaCurto(date: Date | string | number): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
}

/** "13 de nov. às 14:35" */
export function formatDiaHora(date: Date | string | number): string {
  const d = new Date(date);
  const dia = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return `${dia} às ${hora}`;
}

/** Remove ticks cujo rótulo ficou igual (faixa curta vira o mesmo "3%" duas vezes). */
export function ticksUnicos(ticks: number[], rotulo: (v: number) => string): number[] {
  return ticks.filter((v, i, arr) => arr.findIndex((o) => rotulo(o) === rotulo(v)) === i);
}
