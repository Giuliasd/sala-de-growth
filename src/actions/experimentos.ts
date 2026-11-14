"use server";

import { casaComBusca, normalizarBusca } from "@/lib/busca";
import { fotoAntes, registrarEvento, registrarMudancas } from "@/lib/historico-db";
import { antesDeMexerNoItem } from "@/lib/registro-semanal-db";
import { notificarConversao, notificarResponsaveis, notificarResponsaveisEmLote, responsaveisAtuais } from "@/lib/notificacoes-db";
import { prisma } from "@/lib/prisma";
import { conferirData, conferirOrdemDatas, dataOpcionalSchema } from "@/lib/date-validation";
import { findQuarterCached } from "@/lib/quarters-cache";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentMember, hasOwnershipAccess, requireEditPermission, requireOwnershipPermission, type OwnershipMember } from "@/lib/session";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { ExperimentoStatus, IceAction, ResultadoFinal, MemberRole } from "@/generated/prisma/enums";
import { calculateICEScore, getICEAction } from "@/lib/ice";
import { safeHttpUrl } from "@/lib/url";
import { copiarCheckpointsNaConversao, TIMEOUT_DA_CONVERSAO_MS } from "@/lib/checkpoint-conversion";

const scoreField = z.number().min(1).max(5);
const resultadoField = z
  .nativeEnum(ResultadoFinal)
  .nullable()
  .optional()
  .or(z.literal(""));

const docLinkField = safeHttpUrl.or(z.literal("")).nullable().optional();

const createExperimentoSchema = z.object({
  quarterId: z.string().uuid("Quarter inválido."),
  frenteId: z.string().uuid("Frente inválida."),
  okrId: z.string().uuid("OKR inválido.").nullable().optional().or(z.literal("")),
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres.").max(200, "O nome é muito longo."),
  description: z.string().min(3, "A descrição deve ter pelo menos 3 caracteres.").max(5000, "A descrição é muito longa."),
  objective: z.string().min(3, "O objetivo deve ter pelo menos 3 caracteres.").max(2000, "O objetivo é muito longo."),
  status: z.nativeEnum(ExperimentoStatus).default(ExperimentoStatus.BACKLOG),
  impactScore: scoreField,
  confidenceScore: scoreField,
  effortScore: scoreField,
  docLink: docLinkField,
  startDate: dataOpcionalSchema,
  endDate: dataOpcionalSchema,
  launchDate: dataOpcionalSchema,
  analysisDate: dataOpcionalSchema,
  resultado: resultadoField,
}).refine(
  (d) => !d.startDate || !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
  { message: "A data de fim deve ser igual ou posterior à data de início.", path: ["endDate"] }
);

const updateExperimentoSchema = z.object({
  quarterId: z.string().uuid("Quarter inválido.").optional(),
  frenteId: z.string().uuid("Frente inválida.").optional(),
  okrId: z.string().uuid("OKR inválido.").nullable().optional().or(z.literal("")),
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres.").max(200, "O nome é muito longo.").optional(),
  description: z.string().min(3, "A descrição deve ter pelo menos 3 caracteres.").max(5000, "A descrição é muito longa.").optional(),
  objective: z.string().min(3, "O objetivo deve ter pelo menos 3 caracteres.").max(2000, "O objetivo é muito longo.").optional(),
  status: z.nativeEnum(ExperimentoStatus).optional(),
  impactScore: scoreField.optional(),
  confidenceScore: scoreField.optional(),
  effortScore: scoreField.optional(),
  docLink: docLinkField,
  startDate: dataOpcionalSchema,
  endDate: dataOpcionalSchema,
  launchDate: dataOpcionalSchema,
  analysisDate: dataOpcionalSchema,
  resultado: resultadoField,
}).refine(
  (d) => !d.startDate || !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
  { message: "A data de fim deve ser igual ou posterior à data de início.", path: ["endDate"] }
);

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// Erros de permissão/existência lançados pelos gates devem chegar ao usuário
// com a mensagem original, não como "erro inesperado".
function knownError(error: unknown): string | null {
  if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrado"))) {
    return error.message;
  }
  return null;
}

// Garante que o membro atual pode editar o experimento (é UM dos responsáveis,
// item sem responsável, ou liderança). Lança se o experimento não existir.
async function requireExperimentoOwnership(id: string, member?: OwnershipMember) {
  const experimento = await prisma.experimento.findUnique({
    where: { id, deletedAt: null },
    select: { members: { select: { id: true } } },
  });
  if (!experimento) throw new Error("Experimento não encontrado.");
  return requireOwnershipPermission(experimento.members.map((m) => m.id), member);
}

type ExperimentoFilters = {
  quarterId?: string;
  frenteIds?: string[];
  memberIds?: string[];
  statuses?: string[];
  iceActions?: string[];
  /** Busca no nome, no objetivo e na descrição (a hipótese mora ali). */
  q?: string;
};

/**
 * Busca sem acento em nome, objetivo e descrição — ver idsDeIniciativasPorTexto.
 */
async function idsDeExperimentosPorTexto(termo: string): Promise<string[]> {
  const todos = await prisma.experimento.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, objective: true, description: true },
  });
  return todos.filter((e) => casaComBusca(termo, e.name, e.objective, e.description)).map((e) => e.id);
}

/**
 * Filtro das listagens de experimentos. Compartilhado pela tabela e pelo
 * roadmap, que trazem campos diferentes mas precisam mostrar os MESMOS itens.
 */
async function experimentosWhere(filters: ExperimentoFilters): Promise<Prisma.ExperimentoWhereInput> {
  // Datas do quarter selecionado — usadas para trazer também os concluídos de
  // outros quarters cuja data de fim cai dentro deste quarter.
  // Lidas da lista de quarters em cache: sem round-trip antes da consulta.
  const quarterRange = filters.quarterId ? await findQuarterCached(filters.quarterId) : null;
  // O texto vem da URL: normaliza antes de virar filtro.
  const termo = normalizarBusca(filters.q);

  return {
    deletedAt: null,
    ...(filters.quarterId && {
      OR: [
        { quarterId: filters.quarterId },
        {
          quarterId: { not: filters.quarterId },
          status: { in: ["BACKLOG", "EM_ANDAMENTO"] },
        },
        // Concluídos (relatório pronto / resultados apresentados) de outros
        // quarters entregues dentro da janela deste quarter.
        ...(quarterRange
          ? [
              {
                quarterId: { not: filters.quarterId },
                status: {
                  in: [
                    ExperimentoStatus.RELATORIO_PRONTO,
                    ExperimentoStatus.RESULTADOS_APRESENTADOS,
                  ],
                },
                endDate: { gte: quarterRange.startDate, lte: quarterRange.endDate },
              },
            ]
          : []),
      ],
    }),
    ...(filters.frenteIds?.length && { frenteId: { in: filters.frenteIds } }),
    // Responsável é N:N: o experimento entra se QUALQUER um dos filtrados for
    // responsável por ele.
    ...(filters.memberIds?.length && {
      members: { some: { id: { in: filters.memberIds } } },
    }),
    ...(filters.statuses?.length && { status: { in: filters.statuses as ExperimentoStatus[] } }),
    ...(filters.iceActions?.length && { iceAction: { in: filters.iceActions as IceAction[] } }),
    // Busca em nome, objetivo e descrição, sem acento: vira filtro por id (não
    // usa OR, então não disputa a chave com o filtro de quarter).
    ...(termo && { id: { in: await idsDeExperimentosPorTexto(termo) } }),
  };
}

export async function getExperimentos(filters: ExperimentoFilters) {
  // Server action exportada: sem este gate, qualquer POST com o id da action
  // lia os dados — a proteção ficava só no middleware (que só confere se há
  // cookie, não se o membro está ativo). Nas páginas não custa nada: o
  // getCurrentMember é memoizado por render.
  await getCurrentMember();
  return await prisma.experimento.findMany({
    where: await experimentosWhere(filters),
    include: {
      frente: { select: { id: true, name: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      okr: { select: { id: true, objective: true } },
      quarter: { select: { id: true, year: true, quarter: true } },
      _count: { select: { checkpoints: true, comments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Experimentos do roadmap: os mesmos itens da tabela, só com o que a barra, o
 * painel de detalhe e o "Editar rapidamente" usam. Ver `getRoadmapIniciativas`.
 */
export async function getRoadmapExperimentos(filters: ExperimentoFilters) {
  // Gate de sessão — ver o comentário em getExperimentos.
  await getCurrentMember();
  return await prisma.experimento.findMany({
    where: await experimentosWhere(filters),
    select: {
      id: true, name: true, description: true, objective: true, status: true,
      frenteId: true, okrId: true, quarterId: true, docLink: true,
      impactScore: true, confidenceScore: true, effortScore: true, iceScore: true, iceAction: true,
      startDate: true, endDate: true, launchDate: true, analysisDate: true, resultado: true,
      frente: { select: { id: true, name: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      okr: { select: { id: true, objective: true } },
      quarter: { select: { id: true, year: true, quarter: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExperimentoById(id: string) {
  // Gate de sessão — ver o comentário em getExperimentos.
  await getCurrentMember();
  return await prisma.experimento.findUnique({
    where: { id, deletedAt: null },
    include: {
      frente: { select: { id: true, name: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      okr: { select: { id: true, objective: true } },
      quarter: { select: { id: true, year: true, quarter: true } },
      // Tags que ESTE item configurou para os checkpoints (ordem de criação).
      checkpointTags: {
        select: { id: true, name: true, color: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      checkpoints: {
        where: { parentId: null },
        orderBy: { order: "asc" },
        include: {
          members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
          tags: { select: { id: true, name: true, color: true }, orderBy: [{ order: "asc" }, { name: "asc" }] },
          // Marco: ids dos checkpoints necessários (o resto vem da própria árvore).
          requisitos: { select: { id: true } },
          children: {
            orderBy: { order: "asc" },
            include: {
              members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
              tags: { select: { id: true, name: true, color: true }, orderBy: [{ order: "asc" }, { name: "asc" }] },
              requisitos: { select: { id: true } },
              children: {
                orderBy: { order: "asc" },
                include: {
                  members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
                  tags: { select: { id: true, name: true, color: true }, orderBy: [{ order: "asc" }, { name: "asc" }] },
                  requisitos: { select: { id: true } },
                },
              },
            },
          },
        },
      },
      comments: {
        include: {
          member: {
            select: { id: true, name: true },
          },
        },
        // Mais antigo em cima, mais novo embaixo — como uma conversa, e igual
        // ao detalhe da iniciativa.
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createExperimento(
  data: z.infer<typeof createExperimentoSchema>
): Promise<ActionResponse> {
  try {
    const autor = await requireEditPermission();
    const v = createExperimentoSchema.parse(data);
    const iceScore = calculateICEScore(v.impactScore, v.confidenceScore, v.effortScore);
    const iceAction = getICEAction(iceScore);

    const experimento = await prisma.experimento.create({
      data: {
        quarterId: v.quarterId,
        frenteId: v.frenteId,
        okrId: v.okrId || null,
        members: { connect: (v.memberIds ?? []).map((id) => ({ id })) },
        name: v.name,
        description: v.description,
        objective: v.objective,
        status: v.status,
        impactScore: v.impactScore,
        confidenceScore: v.confidenceScore,
        effortScore: v.effortScore,
        iceScore,
        iceAction,
        docLink: v.docLink || null,
        startDate: v.startDate ? new Date(v.startDate) : null,
        endDate: v.endDate ? new Date(v.endDate) : null,
        launchDate: v.launchDate ? new Date(v.launchDate) : null,
        analysisDate: v.analysisDate ? new Date(v.analysisDate) : null,
        resultado: v.resultado || null,
      },
    });

    revalidatePath("/experimentos"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    await registrarEvento("experimento", experimento.id, autor.id, { campo: "criado", de: null, para: null });
    await notificarResponsaveis({ fonte: "experimento", id: experimento.id, autorId: autor.id, antes: [], depois: v.memberIds ?? [] });
    updateTag("onboarding");
    return { success: true, data: experimento };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar o experimento." };
  }
}

export async function updateExperimento(
  id: string,
  data: z.infer<typeof updateExperimentoSchema>
): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    const v = updateExperimentoSchema.parse(data);
    const respAntes = v.memberIds !== undefined ? await responsaveisAtuais("experimento", id) : null;

    // Edição de só uma das datas: confere contra a outra, já salva.
    if (("startDate" in v) !== ("endDate" in v)) {
      const salvo = await prisma.experimento.findUnique({ where: { id }, select: { startDate: true, endDate: true } });
      const erroOrdem = salvo && conferirOrdemDatas(v, salvo);
      if (erroOrdem) return { success: false, error: erroOrdem };
    }

    // Recalculate ICE if any score changed
    let iceFields: { iceScore?: number; iceAction?: IceAction } = {};
    if (
      v.impactScore !== undefined ||
      v.confidenceScore !== undefined ||
      v.effortScore !== undefined
    ) {
      const current = await prisma.experimento.findUniqueOrThrow({ where: { id } });
      const impact = v.impactScore ?? current.impactScore;
      const confidence = v.confidenceScore ?? current.confidenceScore;
      const effort = v.effortScore ?? current.effortScore;
      const iceScore = calculateICEScore(impact, confidence, effort);
      iceFields = { iceScore, iceAction: getICEAction(iceScore) };
    }

    // Registro da semana ANTES de gravar: nome, status, frente e responsáveis do
    // item aparecem na Weekly de cada checkpoint dele (ver AGENTS.md).
    await antesDeMexerNoItem("experimento", id);
    const experimento = await prisma.experimento.update({
      where: { id },
      data: {
        ...(v.quarterId !== undefined && { quarterId: v.quarterId }),
        ...(v.name !== undefined && { name: v.name }),
        ...(v.description !== undefined && { description: v.description }),
        ...(v.objective !== undefined && { objective: v.objective }),
        ...(v.status !== undefined && { status: v.status }),
        ...(v.frenteId !== undefined && { frenteId: v.frenteId }),
        ...("okrId" in v && { okrId: v.okrId || null }),
        // `set` substitui a lista inteira: o formulário sempre manda o estado
        // final dos responsáveis.
        ...(v.memberIds !== undefined && {
          members: { set: v.memberIds.map((mid) => ({ id: mid })) },
        }),
        ...(v.impactScore !== undefined && { impactScore: v.impactScore }),
        ...(v.confidenceScore !== undefined && { confidenceScore: v.confidenceScore }),
        ...(v.effortScore !== undefined && { effortScore: v.effortScore }),
        ...iceFields,
        ...(v.docLink !== undefined && { docLink: v.docLink || null }),
        ...(v.startDate !== undefined && { startDate: v.startDate ? new Date(v.startDate) : null }),
        ...(v.endDate !== undefined && { endDate: v.endDate ? new Date(v.endDate) : null }),
        ...(v.launchDate !== undefined && { launchDate: v.launchDate ? new Date(v.launchDate) : null }),
        ...(v.analysisDate !== undefined && { analysisDate: v.analysisDate ? new Date(v.analysisDate) : null }),
        ...("resultado" in v && { resultado: v.resultado || null }),
      },
    });

    await registrarMudancas("experimento", id, ator.id, antes);
    if (v.memberIds !== undefined) {
      await notificarResponsaveis({ fonte: "experimento", id, autorId: ator.id, antes: respAntes, depois: v.memberIds });
    }
    revalidatePath("/experimentos"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: experimento };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar o experimento." };
  }
}

export async function updateExperimentoStatus(
  id: string,
  status: ExperimentoStatus
): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    await antesDeMexerNoItem("experimento", id);
    const experimento = await prisma.experimento.update({
      where: { id },
      data: { status },
    });
    await registrarMudancas("experimento", id, ator.id, antes);
    revalidatePath("/experimentos");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: experimento };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao atualizar o status." };
  }
}

export async function updateExperimentoResultado(
  id: string,
  resultado: ResultadoFinal | null
): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    const experimento = await prisma.experimento.update({
      where: { id },
      data: { resultado: resultado ?? null },
    });
    await registrarMudancas("experimento", id, ator.id, antes);
    revalidatePath("/experimentos");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: experimento };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao atualizar o resultado." };
  }
}

const bulkUpdateExperimentosSchema = z.object({
  status: z.nativeEnum(ExperimentoStatus).optional(),
  quarterId: z.string().uuid("Quarter inválido.").optional(),
  okrId: z.string().uuid("OKR inválido.").nullable().optional().or(z.literal("")),
  // Lista completa de responsáveis a aplicar. Array vazio = "tire todos".
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
});

// Edição em massa de status/OKR/quarter/responsáveis. Permissão por item:
// liderança edita tudo; colaborador só itens sob sua responsabilidade (ou sem
// responsável). Itens fora do alcance são ignorados e reportados em `skipped`.
// Não altera scores/ICE — por isso os campos escalares cabem num `updateMany`
// (não precisa recalcular por linha).
export async function bulkUpdateExperimentos(
  ids: string[],
  patch: { status?: string; quarterId?: string; okrId?: string | null; memberIds?: string[] }
): Promise<ActionResponse<{ updated: number; skipped: number }>> {
  try {
    const member = await requireEditPermission();
    const v = bulkUpdateExperimentosSchema.parse(patch);

    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return { success: false, error: "Nenhum experimento selecionado." };
    }

    const data = {
      ...(v.status !== undefined && { status: v.status }),
      ...(v.quarterId !== undefined && { quarterId: v.quarterId }),
      ...("okrId" in v && { okrId: v.okrId || null }),
    };
    if (Object.keys(data).length === 0 && v.memberIds === undefined) {
      return { success: false, error: "Nenhuma alteração informada." };
    }

    // Sempre confere existência e exclusão lógica — antes só o ramo do colaborador
    // fazia isso, e a liderança editava item excluído (ou estourava com id inválido,
    // derrubando a transação inteira com "Erro inesperado").
    const items = await prisma.experimento.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, members: { select: { id: true } } },
    });
    const targetIds = (
      member.role === MemberRole.LIDERANCA
        ? items
        : items.filter((e) => hasOwnershipAccess(member, e.members.map((m) => m.id)))
    ).map((e) => e.id);
    if (targetIds.length === 0) {
      return {
        success: false,
        error:
          items.length === 0
            ? "Nenhum experimento encontrado."
            : "Permissão negada. Você só pode editar itens sob sua responsabilidade.",
      };
    }
    // Responsável inexistente/inativo faria o `set` lançar P2025 no meio da transação.
    if (v.memberIds?.length) {
      const ids = [...new Set(v.memberIds)];
      const validos = await prisma.teamMember.count({ where: { id: { in: ids }, isActive: true } });
      if (validos !== ids.length) {
        return { success: false, error: "Responsável inválido." };
      }
    }

    // Notificações: quem eram os responsáveis de cada item ANTES de gravar.
    const respAntesDe = v.memberIds !== undefined
      ? await Promise.all(targetIds.map(async (alvo) => [alvo, await responsaveisAtuais("experimento", alvo)] as const))
      : [];
    // Histórico: foto de cada item ANTES de gravar (a edição em massa muda vários).
    const fotos = await Promise.all(
      targetIds.map(async (alvo) => [alvo, await fotoAntes("experimento", alvo)] as const)
    );

    // Responsáveis são N:N, e `updateMany` não escreve relação. — mesma divisão
    // usada em bulkUpdateIniciativas: escalares num UPDATE só, responsáveis num
    // update por item, tudo na mesma transação.
    // Registro da semana: status e responsáveis aparecem na Weekly. Um item por
    // vez — cada chamada pode fechar a semana vencida, e em paralelo elas
    // disputariam o mesmo fechamento.
    if (v.status !== undefined || v.memberIds !== undefined) {
      for (const alvo of targetIds) await antesDeMexerNoItem("experimento", alvo);
    }
    await prisma.$transaction([
      ...(Object.keys(data).length > 0
        ? [prisma.experimento.updateMany({ where: { id: { in: targetIds } }, data })]
        : []),
      ...(v.memberIds !== undefined
        ? targetIds.map((id) =>
            prisma.experimento.update({
              where: { id },
              data: { members: { set: v.memberIds!.map((mid) => ({ id: mid })) } },
            })
          )
        : []),
    ]);
    await Promise.all(fotos.map(([alvo, antes]) => registrarMudancas("experimento", alvo, member.id, antes)));
    // Uma pessoa, um aviso: quem entra em vários itens recebe "em N itens".
    if (v.memberIds !== undefined) {
      await notificarResponsaveisEmLote({
        fonte: "experimento",
        autorId: member.id,
        itens: respAntesDe.map(([id, antes]) => ({ id, antes })),
        depois: v.memberIds,
      });
    }

    revalidatePath("/experimentos");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return {
      success: true,
      data: { updated: targetIds.length, skipped: uniqueIds.length - targetIds.length },
    };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError || (error as Error)?.name === "ZodError") {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar os experimentos." };
  }
}

export async function deleteExperimento(id: string): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    await antesDeMexerNoItem("experimento", id);
    await prisma.experimento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await registrarEvento("experimento", id, ator.id, { campo: "excluido", de: null, para: null });

    revalidatePath("/experimentos"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao excluir o experimento." };
  }
}

export async function convertExperimentoToIniciativa(id: string): Promise<ActionResponse<string>> {
  try {
    const member = await requireEditPermission();
    const experimento = await prisma.experimento.findUnique({
      where: { id, deletedAt: null },
      include: {
        members: { select: { id: true } },
        comments: { select: { content: true, memberId: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!experimento) {
      return { success: false, error: "Experimento não encontrado." };
    }
    await requireOwnershipPermission(experimento.members.map((m) => m.id), member);

    let novoStatus: "BACKLOG" | "EM_ANDAMENTO" | "CONCLUIDA" | "PAUSADA" | "CANCELADA" = "BACKLOG";
    if (experimento.status === "EM_ANDAMENTO" || experimento.status === "AGUARDANDO_RESULTADOS") novoStatus = "EM_ANDAMENTO";
    else if (experimento.status === "RELATORIO_PRONTO" || experimento.status === "RESULTADOS_APRESENTADOS") novoStatus = "CONCLUIDA";
    else if (experimento.status === "PAUSADO") novoStatus = "PAUSADA";
    else if (experimento.status === "ARQUIVADO") novoStatus = "CANCELADA";

    // Transação: sem ela, falha no soft delete deixaria o item duplicado
    // (iniciativa criada + experimento ainda ativo). Os checkpoints entram na
    // mesma transação — sem eles, o trabalho registrado sumia na conversão.
    await antesDeMexerNoItem("experimento", id);
    const iniciativa = await prisma.$transaction(async (tx) => {
      // Reivindica o experimento ANTES de criar (ver convertIniciativaToExperimento).
      const reivindicado = await tx.experimento.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (reivindicado.count === 0) throw new Error("Experimento não encontrado.");

      const created = await tx.iniciativa.create({
        data: {
          quarterId: experimento.quarterId,
          frenteId: experimento.frenteId,
          okrId: experimento.okrId,
          // A conversão leva a equipe inteira junto, não só a primeira pessoa.
          members: { connect: experimento.members.map((m) => ({ id: m.id })) },
          name: experimento.name,
          status: novoStatus,
          priority: "MEDIA",
          docLink: experimento.docLink,
          startDate: experimento.startDate,
          endDate: experimento.endDate,
          // Marcos e resultado existem nos dois lados: não se perdem na conversão.
          launchDate: experimento.launchDate,
          analysisDate: experimento.analysisDate,
          resultado: experimento.resultado,
        },
      });

      await copiarCheckpointsNaConversao(tx, { de: "experimento", origemId: id, destinoId: created.id });

      // A conversa acompanha o item (os comentários sumiam da tela na conversão).
      if (experimento.comments.length > 0) {
        await tx.initiativeComment.createMany({
          data: experimento.comments.map((c) => ({
            initiativeId: created.id,
            memberId: c.memberId,
            content: c.content,
            createdAt: c.createdAt,
          })),
        });
      }

      return created;
    }, { timeout: TIMEOUT_DA_CONVERSAO_MS });

    await registrarEvento("experimento", id, member.id, { campo: "convertido", de: null, para: "iniciativa" });
    await registrarEvento("iniciativa", iniciativa.id, member.id, { campo: "criado", de: null, para: null, detalhe: "convertida de experimento" });
    await notificarConversao({ para: "iniciativa", novoId: iniciativa.id, autorId: member.id });

    revalidatePath("/iniciativas");
    revalidatePath("/experimentos");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: iniciativa.id };
  } catch (error) {
    console.error("convertExperimentoToIniciativa error:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao converter o experimento." };
  }
}

export async function updateExperimentoScores(
  id: string,
  input: { impactScore: number; confidenceScore: number; effortScore: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    const schema = z.object({
      impactScore: scoreField,
      confidenceScore: scoreField,
      effortScore: scoreField,
    });
    const v = schema.parse(input);

    const iceScore = calculateICEScore(v.impactScore, v.confidenceScore, v.effortScore);
    const iceAction = getICEAction(iceScore);

    await prisma.experimento.update({
      where: { id },
      data: {
        impactScore: v.impactScore,
        confidenceScore: v.confidenceScore,
        effortScore: v.effortScore,
        iceScore,
        iceAction,
      },
    });

    await registrarMudancas("experimento", id, ator.id, antes);
    revalidatePath("/experimentos");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar os scores." };
  }
}

export async function updateExperimentoDates(
  id: string,
  startDate: string | null,
  endDate: string | null
): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    const erroData = conferirData(startDate) ?? conferirData(endDate);
    if (erroData) return { success: false, error: erroData };
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return { success: false, error: "A data de fim deve ser igual ou posterior à data de início." };
    }

    const experimento = await prisma.experimento.update({
      where: { id },
      data: {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    await registrarMudancas("experimento", id, ator.id, antes);
    revalidatePath("/experimentos"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: experimento };
  } catch (error) {
    console.error("updateExperimentoDates error:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao atualizar as datas." };
  }
}

export async function updateExperimentoLaunchDate(
  id: string,
  launchDate: string | null
): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    const erroData = conferirData(launchDate);
    if (erroData) return { success: false, error: erroData };
    await prisma.experimento.update({
      where: { id },
      data: { launchDate: launchDate ? new Date(launchDate) : null },
    });
    await registrarMudancas("experimento", id, ator.id, antes);
    revalidatePath("/experimentos"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado." };
  }
}

export async function updateExperimentoAnalysisDate(
  id: string,
  analysisDate: string | null
): Promise<ActionResponse> {
  try {
    const ator = await requireExperimentoOwnership(id);
    const antes = await fotoAntes("experimento", id);
    const erroData = conferirData(analysisDate);
    if (erroData) return { success: false, error: erroData };
    await prisma.experimento.update({
      where: { id },
      data: { analysisDate: analysisDate ? new Date(analysisDate) : null },
    });
    await registrarMudancas("experimento", id, ator.id, antes);
    revalidatePath("/experimentos"); revalidatePath("/dashboard"); revalidatePath("/rituais"); revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado." };
  }
}
