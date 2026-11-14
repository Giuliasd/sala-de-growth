import { AusenciaType } from "@/generated/prisma/enums";

/**
 * Trava de férias: janela em que ninguém do time pode tirar FÉRIAS (ex.: Black
 * Friday). Só férias é bloqueada — licença médica, day off etc. não são escolha
 * da pessoa e continuam registráveis.
 */
export type TravaPeriodo = { name: string; startDate: Date; endDate: Date };

/** A primeira trava que cruza o período, ou null se o tipo não é bloqueável. */
export function travaQueBloqueia(
  travas: TravaPeriodo[],
  tipo: AusenciaType,
  inicio: Date,
  fim: Date
): TravaPeriodo | null {
  if (tipo !== AusenciaType.FERIAS) return null;
  return travas.find((t) => t.startDate <= fim && t.endDate >= inicio) ?? null;
}

function dia(d: Date): string {
  // Datas são guardadas à meia-noite UTC: formata em UTC para não voltar um dia.
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function mensagemDeTrava(t: TravaPeriodo): string {
  return `Não é possível registrar férias neste período: ele cruza a trava "${t.name}" (${dia(t.startDate)} a ${dia(t.endDate)}).`;
}
