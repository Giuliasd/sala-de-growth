import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Lista de quarters em cache (tag "quarters", 5 min). Toda action que cria,
 * edita, ativa ou exclui quarter chama `updateTag("quarters")`, então a lista
 * nunca fica velha depois de uma mudança.
 *
 * Mora em lib (e não em actions/quarters) para ser usada também pelas
 * consultas que só precisam das DATAS de um quarter — ver `findQuarterCached`.
 */
export const getQuartersCached = unstable_cache(
  () =>
    prisma.quarter.findMany({
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
  ["quarters"],
  { revalidate: 300, tags: ["quarters"] }
);

/**
 * Um quarter pelo id, lido da lista em cache — sem ir ao banco. Antes as
 * listagens de iniciativas/experimentos, as ausências do roadmap e o relatório
 * faziam um `quarter.findUnique` só para saber as datas, ANTES da consulta
 * principal: um round-trip a mais em série (dois no /roadmap).
 *
 * As datas são reconvertidas: em cache hit o JSON devolve Date como string.
 * Se o id não estiver na lista (não deveria acontecer, mas a lista é cache),
 * cai no banco.
 */
export async function findQuarterCached(id: string) {
  const fromCache = (await getQuartersCached()).find((q) => q.id === id);
  const q = fromCache ?? (await prisma.quarter.findUnique({ where: { id } }));
  if (!q) return null;
  return {
    ...q,
    startDate: new Date(q.startDate),
    endDate: new Date(q.endDate),
    createdAt: new Date(q.createdAt),
    updatedAt: new Date(q.updatedAt),
  };
}
