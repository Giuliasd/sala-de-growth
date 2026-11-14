"use server";

import { prisma } from "@/lib/prisma";
import { getQuarters } from "@/actions/quarters";
import { ExperimentoStatus } from "@/generated/prisma/enums";

// "Etapas ativas" de um experimento — o fluxo de execução, do início à
// apresentação dos resultados. Backlog e Arquivado ficam de fora.
const ACTIVE_STAGES = [
  ExperimentoStatus.EM_ANDAMENTO,
  ExperimentoStatus.AGUARDANDO_RESULTADOS,
  ExperimentoStatus.RELATORIO_PRONTO,
  ExperimentoStatus.RESULTADOS_APRESENTADOS,
] as const;

export type RitualExperimento = {
  id: string;
  name: string;
  status: string;
  iceScore: number;
  resultado: string | null;
  frente: { name: string };
  members: { id: string; name: string; role: string }[];
};

export type RitualIniciativa = {
  id: string;
  name: string;
  status: string;
  frente: { name: string };
  members: { id: string; name: string; role: string }[];
};

export type RitualQuarter = {
  id: string;
  year: number;
  quarter: number;
  startDate: Date;
  endDate: Date;
};

export type ActiveExperimentsResult = {
  quarter: RitualQuarter | null;
  experimentos: RitualExperimento[];
  // Iniciativas marcadas como "precisa apresentar resultados" no quarter atual.
  iniciativasParaApresentar: RitualIniciativa[];
};

/**
 * Experimentos ativos de um quarter, para a visão "Review semanal" da página de
 * Rituais. Retorna também o quarter exibido (para o indicador de tempo da aba).
 * O agrupamento por etapa é feito no componente.
 *
 * Sem `quarterId`, cai no "quarter atual" = o ativo; se não houver, o que
 * engloba hoje; senão, o mais recente. Resolvido em memória sobre getQuarters()
 * (cacheado, e já valida a sessão) — mesma regra das outras páginas, sem
 * queries extras.
 */
export async function getActiveExperiments(quarterId?: string): Promise<ActiveExperimentsResult> {
  const quarters = await getQuarters();

  const now = new Date();
  const quarter =
    (quarterId ? quarters.find((q) => q.id === quarterId) : undefined) ??
    quarters.find((q) => q.isActive) ??
    quarters.find((q) => now >= new Date(q.startDate) && now <= new Date(q.endDate)) ??
    quarters[0] ??
    null;

  if (!quarter) return { quarter: null, experimentos: [], iniciativasParaApresentar: [] };

  const [experimentos, iniciativasParaApresentar] = await Promise.all([
    prisma.experimento.findMany({
      where: {
        deletedAt: null,
        quarterId: quarter.id,
        status: { in: [...ACTIVE_STAGES] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        iceScore: true,
        resultado: true,
        frente: { select: { name: true } },
        members: { select: { id: true, name: true, role: true }, orderBy: { name: "asc" } },
      },
      orderBy: [{ iceScore: "desc" }, { name: "asc" }],
    }),
    prisma.iniciativa.findMany({
      where: {
        deletedAt: null,
        quarterId: quarter.id,
        precisaApresentarResultados: true,
      },
      select: {
        id: true,
        name: true,
        status: true,
        frente: { select: { name: true } },
        members: { select: { id: true, name: true, role: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    quarter: {
      id: quarter.id,
      year: quarter.year,
      quarter: quarter.quarter,
      startDate: quarter.startDate,
      endDate: quarter.endDate,
    },
    experimentos,
    iniciativasParaApresentar,
  };
}
