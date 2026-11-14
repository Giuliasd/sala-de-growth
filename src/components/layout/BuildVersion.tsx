"use client";

import { BUILD_INFO, BUILD_LABEL, UNKNOWN } from "@/lib/version";
import {
  CursorTooltip,
  TooltipHint,
  TooltipLine,
  TooltipTitle,
  useCursorTooltip,
} from "@/components/shared/CursorTooltip";

/**
 * Rodapé do Sidebar: qual build está no ar neste ambiente.
 *
 * Existe porque "está no master" não significa "está no ar" — os dois deploys
 * são manuais e cada ambiente pode estar em um commit diferente.
 * Com isto, conferir em qual versão um ambiente está virou
 * abrir o próprio app.
 *
 * Os valores são congelados em tempo de build, então descrevem o slug que está
 * respondendo — não o repositório de quem olha.
 */

/**
 * `timeZone` fixo de propósito: sem ele, o servidor (UTC no Heroku) e o browser
 * formatariam horas diferentes para a mesma string e o React acusaria mismatch
 * de hidratação. Mesmo padrão de `lib/date-utils.ts`.
 */
function formatBuiltAt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function BuildVersion() {
  const { tip, bind } = useCursorTooltip<null>();

  return (
    <>
      <div
        {...bind(null)}
        className="w-full text-[11px] tabular-nums whitespace-nowrap truncate cursor-default select-none"
        style={{
          color: "var(--text-muted)",
          paddingLeft: 12,
          paddingTop: 6,
          paddingBottom: 2,
        }}
      >
        {BUILD_LABEL}
      </div>

      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>Versão desta build</TooltipTitle>
          <TooltipLine>
            Release: {BUILD_INFO.version === UNKNOWN ? UNKNOWN : `v${BUILD_INFO.version}`}
          </TooltipLine>
          <TooltipLine>Commit: {BUILD_INFO.commit}</TooltipLine>
          {BUILD_INFO.builtAt && (
            <TooltipLine dim>Build em {formatBuiltAt(BUILD_INFO.builtAt)}</TooltipLine>
          )}
          <TooltipHint>Detalhes em /api/version</TooltipHint>
        </CursorTooltip>
      )}
    </>
  );
}
