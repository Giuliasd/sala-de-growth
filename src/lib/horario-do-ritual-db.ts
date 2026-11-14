import { unstable_cache } from "next/cache";
import { prisma, withDbRetry } from "@/lib/prisma";
import type { VigenciaDoRitual } from "@/lib/date-utils";

/**
 * As vigências dos horários do ritual (model `HorarioDoRitual`), da mais antiga
 * para a mais recente. As regras estão em `lib/date-utils.ts` — `janelaDoRitual`
 * e `semanaDoRitualAtual` recebem esta lista.
 *
 * Lida em toda edição de checkpoint e em toda abertura da Weekly, e muda quase
 * nunca: fica em cache, invalidado pela tag ao salvar em Configurações.
 *
 * Nada aqui é server action: não é para ser chamado do cliente.
 */
export const TAG_HORARIO_DO_RITUAL = "horario-do-ritual";

const _lerVigencias = unstable_cache(
  () =>
    withDbRetry(() =>
      prisma.horarioDoRitual.findMany({
        orderBy: { vigenteDesde: "asc" },
        select: {
          vigenteDesde: true,
          fechamentoDia: true,
          fechamentoMinuto: true,
          planejamentoDia: true,
          planejamentoMinuto: true,
        },
      })
    ),
  [TAG_HORARIO_DO_RITUAL],
  { revalidate: 3600, tags: [TAG_HORARIO_DO_RITUAL] }
);

export async function lerVigenciasDoRitual(): Promise<VigenciaDoRitual[]> {
  // O cache devolve JSON: a data volta como string.
  const linhas = await _lerVigencias();
  return linhas.map((l) => ({ ...l, vigenteDesde: new Date(l.vigenteDesde) }));
}
