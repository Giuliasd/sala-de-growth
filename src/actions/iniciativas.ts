"use server";

import { casaComBusca, normalizarBusca } from "@/lib/busca";
import { fotoAntes, registrarEvento, registrarMudancas } from "@/lib/historico-db";
import { antesDeMexerNoItem } from "@/lib/registro-semanal-db";
import { notificarConversao, notificarResponsaveis, notificarResponsaveisEmLote, responsaveisAtuais } from "@/lib/notificacoes-db";
import { prisma } from "@/lib/prisma";
import { conferirData, conferirOrdemDatas, dataOpcionalSchema, dataSchema } from "@/lib/date-validation";
import { findQuarterCached } from "@/lib/quarters-cache";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentMember, hasOwnershipAccess, requireEditPermission, requireOwnershipPermission, type OwnershipMember } from "@/lib/session";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { IniciativaStatus, Priority, ResultadoFinal, MemberRole } from "@/generated/prisma/enums";
import { INICIATIVA_CONCLUIDA_STATUSES } from "@/lib/statusConfig";
import { safeHttpUrl } from "@/lib/url";
import { copiarCheckpointsNaConversao, TIMEOUT_DA_CONVERSAO_MS } from "@/lib/checkpoint-conversion";

// Trava de ano plausível — ver lib/date-validation.
const optionalDate = dataOpcionalSchema;

const resultadoField = z
  .nativeEnum(ResultadoFinal)
  .nullable()
  .optional()
  .or(z.literal(""));

const docLinkField = safeHttpUrl.or(z.literal("")).nullable().optional();

const createIniciativaSchema = z
  .object({
    quarterId: z.string().uuid("Quarter inválido."),
    frenteId: z.string().uuid("Frente inválida."),
    memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
    name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres.").max(200, "O nome é muito longo."),
    status: z.nativeEnum(IniciativaStatus).default(IniciativaStatus.BACKLOG),
    priority: z.nativeEnum(Priority).default(Priority.MEDIA),
    startDate: optionalDate,
    endDate: optionalDate,
    launchDate: optionalDate,
    analysisDate: optionalDate,
    resultado: resultadoField,
    okrId: z.string().uuid("OKR inválido.").nullable().optional().or(z.literal("")),
    docLink: docLinkField,
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) {
        return new Date(d.endDate as string) >= new Date(d.startDate as string);
      }
      return true;
    },
    { message: "A data de fim deve ser igual ou posterior à data de início.", path: ["endDate"] }
  );

const updateIniciativaSchema = z
  .object({
    quarterId: z.string().uuid("Quarter inválido.").optional(),
    name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres.").max(200, "O nome é muito longo.").optional(),
    status: z.nativeEnum(IniciativaStatus).optional(),
    priority: z.nativeEnum(Priority).optional(),
    frenteId: z.string().uuid("Frente inválida.").optional(),
    memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    launchDate: optionalDate,
    analysisDate: optionalDate,
    resultado: resultadoField,
    okrId: z.string().uuid("OKR inválido.").nullable().optional().or(z.literal("")),
    docLink: docLinkField,
    precisaApresentarResultados: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) {
        return new Date(d.endDate as string) >= new Date(d.startDate as string);
      }
      return true;
    },
    { message: "A data de fim deve ser igual ou posterior à data de início.", path: ["endDate"] }
  );

const updateDatesSchema = z
  .object({
    startDate: dataSchema,
    endDate: dataSchema,
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: "A data de fim deve ser igual ou posterior à data de início.",
    path: ["endDate"],
  });

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// Erros de permissão/existência lançados pelos gates devem chegar ao usuário
// com a mensagem original, não como "erro inesperado".
function knownError(error: unknown): string | null {
  if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrada"))) {
    return error.message;
  }
  return null;
}

// Garante que o membro atual pode editar a iniciativa (é UM dos responsáveis,
// item sem responsável, ou liderança). Lança se a iniciativa não existir.
async function requireIniciativaOwnership(id: string, member?: OwnershipMember) {
  const iniciativa = await prisma.iniciativa.findUnique({
    where: { id, deletedAt: null },
    select: { members: { select: { id: true } } },
  });
  if (!iniciativa) throw new Error("Iniciativa não encontrada.");
  return requireOwnershipPermission(iniciativa.members.map((m) => m.id), member);
}

type IniciativaFilters = {
  quarterId?: string;
  frenteIds?: string[];
  memberIds?: string[];
  statuses?: string[];
  priorities?: string[];
  /** Busca por nome (contém, sem diferenciar maiúsculas). */
  q?: string;
};

/**
 * Filtro das listagens de iniciativas. Compartilhado pela tabela e pelo
 * roadmap, que trazem campos diferentes mas precisam mostrar os MESMOS itens.
 */
/**
 * Busca sem acento: o banco compara acento ("jose" não acha "José"), então a
 * comparação é feita aqui sobre os nomes (só id + nome de cada item ativo —
 * poucos KB) e vira um filtro por id.
 */
async function idsDeIniciativasPorTexto(termo: string): Promise<string[]> {
  const todas = await prisma.iniciativa.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  return todas.filter((i) => casaComBusca(termo, i.name)).map((i) => i.id);
}

async function iniciativasWhere(filters: IniciativaFilters): Promise<Prisma.IniciativaWhereInput> {
  // Datas do quarter selecionado — usadas para trazer também as concluídas de
  // outros quarters cuja data de fim cai dentro deste quarter.
  // Lidas da lista de quarters em cache: sem round-trip antes da consulta.
  const quarterRange = filters.quarterId ? await findQuarterCached(filters.quarterId) : null;
  // O texto vem da URL: normaliza antes de virar filtro (o `contains` do Prisma
  // trata % e _ como literais).
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
        // Concluídas de outros quarters entregues dentro da janela deste quarter.
        ...(quarterRange
          ? [
              {
                quarterId: { not: filters.quarterId },
                status: { in: [...INICIATIVA_CONCLUIDA_STATUSES] as IniciativaStatus[] },
                endDate: { gte: quarterRange.startDate, lte: quarterRange.endDate },
              },
            ]
          : []),
      ],
    }),
    ...(filters.frenteIds?.length && { frenteId: { in: filters.frenteIds } }),
    // Responsável é N:N: a iniciativa entra se QUALQUER um dos filtrados for
    // responsável por ela.
    ...(filters.memberIds?.length && {
      members: { some: { id: { in: filters.memberIds } } },
    }),
    ...(filters.statuses?.length && { status: { in: filters.statuses as IniciativaStatus[] } }),
    ...(filters.priorities?.length && { priority: { in: filters.priorities as Priority[] } }),
    ...(termo && { id: { in: await idsDeIniciativasPorTexto(termo) } }),
  };
}

export async function getIniciativas(filters: IniciativaFilters) {
  // Server action exportada: sem este gate, qualquer POST com o id da action
  // lia os dados — a proteção ficava só no middleware (que só confere se há
  // cookie, não se o membro está ativo). Nas páginas não custa nada: o
  // getCurrentMember é memoizado por render.
  await getCurrentMember();
  const iniciativas = await prisma.iniciativa.findMany({
    where: await iniciativasWhere(filters),
    include: {
      frente: { select: { id: true, name: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      okr: { select: { id: true, objective: true } },
      quarter: { select: { id: true, year: true, quarter: true } },
      // Só a CONTAGEM: a tabela mostra "feitos/total". Antes vinha uma linha por
      // checkpoint de cada iniciativa (N × M linhas no HTML e na memória) só
      // para chamar .length e .filter().length no cliente.
      _count: { select: { comments: true, checkpoints: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Concluídos: uma agregação só para a página toda (o _count do Prisma não
  // aceita dois filtros na mesma relação).
  const concluidos =
    iniciativas.length > 0
      ? await prisma.initiativeCheckpoint.groupBy({
          by: ["initiativeId"],
          where: { initiativeId: { in: iniciativas.map((i) => i.id) }, isCompleted: true },
          _count: { _all: true },
        })
      : [];
  const concluidosPorIniciativa = new Map(concluidos.map((c) => [c.initiativeId, c._count._all]));

  return iniciativas.map((i) => ({
    ...i,
    checkpointsConcluidos: concluidosPorIniciativa.get(i.id) ?? 0,
  }));
}

/**
 * Iniciativas do roadmap: os mesmos itens da tabela, só com o que a barra, o
 * painel de detalhe e o "Editar rapidamente" usam.
 *
 * Existe porque o roadmap reaproveitava `getIniciativas`, que traz a lista de
 * TODOS os checkpoints de cada iniciativa, contagem de comentários e as datas
 * de auditoria — nada disso aparece no roadmap, mas tudo ia no HTML da página
 * e na memória do servidor a cada render. Era a página mais pesada do app.
 */
export async function getRoadmapIniciativas(filters: IniciativaFilters) {
  // Gate de sessão — ver o comentário em getIniciativas.
  await getCurrentMember();
  return await prisma.iniciativa.findMany({
    where: await iniciativasWhere(filters),
    select: {
      id: true, name: true, status: true, priority: true,
      frenteId: true, quarterId: true, okrId: true, docLink: true,
      startDate: true, endDate: true, launchDate: true, analysisDate: true, resultado: true,
      frente: { select: { id: true, name: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      okr: { select: { id: true, objective: true } },
      quarter: { select: { id: true, year: true, quarter: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getIniciativaDetail(id: string) {
  // Gate de sessão — ver o comentário em getIniciativas.
  await getCurrentMember();
  return await prisma.iniciativa.findUnique({
    where: { id, deletedAt: null },
    include: {
      // Só o que o detalhe mostra: a linha inteira do OKR (valores, meses,
      // tipo de medição...) ia serializada para o navegador a cada abertura.
      quarter: { select: { id: true, year: true, quarter: true } },
      frente: { select: { id: true, name: true } },
      okr: { select: { id: true, objective: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
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
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createIniciativa(
  data: z.infer<typeof createIniciativaSchema>
): Promise<ActionResponse> {
  try {
    const autor = await requireEditPermission();
    const v = createIniciativaSchema.parse(data);

    const iniciativa = await prisma.iniciativa.create({
      data: {
        quarterId: v.quarterId,
        frenteId: v.frenteId,
        members: { connect: (v.memberIds ?? []).map((id) => ({ id })) },
        name: v.name,
        status: v.status,
        priority: v.priority,
        startDate: v.startDate ? new Date(v.startDate) : null,
        endDate: v.endDate ? new Date(v.endDate) : null,
        launchDate: v.launchDate ? new Date(v.launchDate) : null,
        analysisDate: v.analysisDate ? new Date(v.analysisDate) : null,
        resultado: v.resultado || null,
        okrId: v.okrId || null,
        docLink: v.docLink || null,
      },
    });

    revalidatePath("/iniciativas"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    await registrarEvento("iniciativa", iniciativa.id, autor.id, { campo: "criado", de: null, para: null });
    await notificarResponsaveis({ fonte: "iniciativa", id: iniciativa.id, autorId: autor.id, antes: [], depois: v.memberIds ?? [] });
    updateTag("onboarding");
    return { success: true, data: iniciativa };
  } catch (error) {
    if (error instanceof z.ZodError || (error as Error)?.name === "ZodError") {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao criar a iniciativa." };
  }
}

export async function updateIniciativa(
  id: string,
  data: z.infer<typeof updateIniciativaSchema>
): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    const antes = await fotoAntes("iniciativa", id);
    const v = updateIniciativaSchema.parse(data);
    const respAntes = v.memberIds !== undefined ? await responsaveisAtuais("iniciativa", id) : null;

    // Edição de só uma das datas: confere contra a outra, já salva.
    if (("startDate" in v) !== ("endDate" in v)) {
      const salvo = await prisma.iniciativa.findUnique({ where: { id }, select: { startDate: true, endDate: true } });
      const erroOrdem = salvo && conferirOrdemDatas(v, salvo);
      if (erroOrdem) return { success: false, error: erroOrdem };
    }

    // Registro da semana ANTES de gravar: nome, status, frente e responsáveis do
    // item aparecem na Weekly de cada checkpoint dele (ver AGENTS.md).
    await antesDeMexerNoItem("iniciativa", id);
    const iniciativa = await prisma.iniciativa.update({
      where: { id },
      data: {
        ...(v.quarterId !== undefined && { quarterId: v.quarterId }),
        ...(v.name !== undefined && { name: v.name }),
        ...(v.status !== undefined && { status: v.status }),
        ...(v.priority !== undefined && { priority: v.priority }),
        ...(v.frenteId !== undefined && { frenteId: v.frenteId }),
        // `set` substitui a lista inteira: o formulário sempre manda o estado
        // final dos responsáveis, então connect/disconnect seria redundante.
        ...(v.memberIds !== undefined && {
          members: { set: v.memberIds.map((mid) => ({ id: mid })) },
        }),
        ...("startDate" in v && {
          startDate: v.startDate ? new Date(v.startDate as string) : null,
        }),
        ...("endDate" in v && {
          endDate: v.endDate ? new Date(v.endDate as string) : null,
        }),
        ...("launchDate" in v && {
          launchDate: v.launchDate ? new Date(v.launchDate as string) : null,
        }),
        ...("analysisDate" in v && {
          analysisDate: v.analysisDate ? new Date(v.analysisDate as string) : null,
        }),
        ...("resultado" in v && { resultado: v.resultado || null }),
        ...("okrId" in v && { okrId: v.okrId || null }),
        ...("docLink" in v && { docLink: v.docLink || null }),
        ...(v.precisaApresentarResultados !== undefined && {
          precisaApresentarResultados: v.precisaApresentarResultados,
        }),
      },
    });

    await registrarMudancas("iniciativa", id, ator.id, antes);
    if (v.memberIds !== undefined) {
      await notificarResponsaveis({ fonte: "iniciativa", id, autorId: ator.id, antes: respAntes, depois: v.memberIds });
    }
    revalidatePath("/iniciativas"); revalidatePath("/dashboard"); revalidatePath("/roadmap"); revalidatePath("/rituais");
    return { success: true, data: iniciativa };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError || (error as Error)?.name === "ZodError") {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    return { success: false, error: "Erro inesperado ao atualizar a iniciativa." };
  }
}

export async function updateIniciativaStatus(
  id: string,
  status: IniciativaStatus
): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    const antes = await fotoAntes("iniciativa", id);
    await antesDeMexerNoItem("iniciativa", id);
    const iniciativa = await prisma.iniciativa.update({
      where: { id },
      data: { status },
    });
    await registrarMudancas("iniciativa", id, ator.id, antes);
    revalidatePath("/iniciativas");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: iniciativa };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao atualizar o status." };
  }
}

export async function updateIniciativaPriority(
  id: string,
  priority: Priority
): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    const antes = await fotoAntes("iniciativa", id);
    const iniciativa = await prisma.iniciativa.update({
      where: { id },
      data: { priority },
    });
    await registrarMudancas("iniciativa", id, ator.id, antes);
    revalidatePath("/iniciativas");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: iniciativa };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao atualizar a prioridade." };
  }
}

const bulkUpdateIniciativasSchema = z.object({
  status: z.nativeEnum(IniciativaStatus).optional(),
  quarterId: z.string().uuid("Quarter inválido.").optional(),
  okrId: z.string().uuid("OKR inválido.").nullable().optional().or(z.literal("")),
  // Lista completa de responsáveis a aplicar. Array vazio = "tire todos".
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
});

// Edição em massa de status/OKR/quarter/responsáveis. A verificação de permissão
// é por item: liderança edita tudo; colaborador só edita itens sob sua
// responsabilidade (ou sem responsável). Itens fora do alcance são ignorados e
// reportados em `skipped` — não fazem a operação inteira falhar.
export async function bulkUpdateIniciativas(
  ids: string[],
  patch: { status?: string; quarterId?: string; okrId?: string | null; memberIds?: string[] }
): Promise<ActionResponse<{ updated: number; skipped: number }>> {
  try {
    const member = await requireEditPermission();
    const v = bulkUpdateIniciativasSchema.parse(patch);

    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return { success: false, error: "Nenhuma iniciativa selecionada." };
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
    const items = await prisma.iniciativa.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, members: { select: { id: true } } },
    });
    const targetIds = (
      member.role === MemberRole.LIDERANCA
        ? items
        : items.filter((i) => hasOwnershipAccess(member, i.members.map((m) => m.id)))
    ).map((i) => i.id);
    if (targetIds.length === 0) {
      return {
        success: false,
        error:
          items.length === 0
            ? "Nenhum iniciativa encontrado."
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
      ? await Promise.all(targetIds.map(async (alvo) => [alvo, await responsaveisAtuais("iniciativa", alvo)] as const))
      : [];
    // Histórico: foto de cada item ANTES de gravar (a edição em massa muda vários).
    const fotos = await Promise.all(
      targetIds.map(async (alvo) => [alvo, await fotoAntes("iniciativa", alvo)] as const)
    );

    // Responsáveis são N:N, e `updateMany` não escreve relação. Os campos
    // escalares seguem num único UPDATE; a lista de responsáveis vira um
    // update por item, tudo na mesma transação para não deixar a seleção
    // meio-aplicada.
    // Registro da semana: status e responsáveis aparecem na Weekly. Um item por
    // vez — cada chamada pode fechar a semana vencida, e em paralelo elas
    // disputariam o mesmo fechamento.
    if (v.status !== undefined || v.memberIds !== undefined) {
      for (const alvo of targetIds) await antesDeMexerNoItem("iniciativa", alvo);
    }
    await prisma.$transaction([
      ...(Object.keys(data).length > 0
        ? [prisma.iniciativa.updateMany({ where: { id: { in: targetIds } }, data })]
        : []),
      ...(v.memberIds !== undefined
        ? targetIds.map((id) =>
            prisma.iniciativa.update({
              where: { id },
              data: { members: { set: v.memberIds!.map((mid) => ({ id: mid })) } },
            })
          )
        : []),
    ]);
    await Promise.all(fotos.map(([alvo, antes]) => registrarMudancas("iniciativa", alvo, member.id, antes)));
    // Uma pessoa, um aviso: quem entra em vários itens recebe "em N itens".
    if (v.memberIds !== undefined) {
      await notificarResponsaveisEmLote({
        fonte: "iniciativa",
        autorId: member.id,
        itens: respAntesDe.map(([id, antes]) => ({ id, antes })),
        depois: v.memberIds,
      });
    }

    revalidatePath("/iniciativas");
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
    return { success: false, error: "Erro inesperado ao atualizar as iniciativas." };
  }
}

export async function deleteIniciativa(id: string): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    await antesDeMexerNoItem("iniciativa", id);
    await prisma.iniciativa.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await registrarEvento("iniciativa", id, ator.id, { campo: "excluido", de: null, para: null });

    revalidatePath("/iniciativas"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao excluir a iniciativa." };
  }
}

export async function convertIniciativaToExperimento(id: string): Promise<ActionResponse<string>> {
  try {
    const member = await requireEditPermission();
    const iniciativa = await prisma.iniciativa.findUnique({
      where: { id, deletedAt: null },
      include: {
        okr: true,
        members: { select: { id: true } },
        comments: { select: { content: true, memberId: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!iniciativa) {
      return { success: false, error: "Iniciativa não encontrada." };
    }
    await requireOwnershipPermission(iniciativa.members.map((m) => m.id), member);

    let novoStatus: "BACKLOG" | "EM_ANDAMENTO" | "RESULTADOS_APRESENTADOS" | "PAUSADO" | "ARQUIVADO" = "BACKLOG";
    if (iniciativa.status === "EM_ANDAMENTO") novoStatus = "EM_ANDAMENTO";
    else if (iniciativa.status === "CONCLUIDA") novoStatus = "RESULTADOS_APRESENTADOS";
    else if (iniciativa.status === "PAUSADA") novoStatus = "PAUSADO";
    else if (iniciativa.status === "CANCELADA") novoStatus = "ARQUIVADO";

    // Transação: sem ela, falha no soft delete deixaria o item duplicado
    // (experimento criado + iniciativa ainda ativa). Os checkpoints entram na
    // mesma transação — sem eles, o trabalho registrado sumia na conversão.
    await antesDeMexerNoItem("iniciativa", id);
    const experimento = await prisma.$transaction(async (tx) => {
      // Reivindica a iniciativa ANTES de criar: o findUnique de fora da transação
      // não protege de dois cliques/abas — ambos passavam e criavam dois
      // experimentos. Aqui o segundo encontra deletedAt preenchido e aborta.
      const reivindicada = await tx.iniciativa.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (reivindicada.count === 0) throw new Error("Iniciativa não encontrada.");

      const created = await tx.experimento.create({
        data: {
          quarterId: iniciativa.quarterId,
          frenteId: iniciativa.frenteId,
          okrId: iniciativa.okrId || null,
          // A conversão leva a equipe inteira junto, não só a primeira pessoa.
          members: { connect: iniciativa.members.map((m) => ({ id: m.id })) },
          name: iniciativa.name,
          description: "Convertido a partir de uma iniciativa.",
          objective: iniciativa.okr?.objective || iniciativa.name,
          status: novoStatus,
          impactScore: 1,
          confidenceScore: 1,
          effortScore: 1,
          iceScore: 0,
          iceAction: "BACKLOG",
          docLink: iniciativa.docLink,
          startDate: iniciativa.startDate,
          endDate: iniciativa.endDate,
          // Marcos e resultado existem nos dois lados: não se perdem na conversão.
          launchDate: iniciativa.launchDate,
          analysisDate: iniciativa.analysisDate,
          resultado: iniciativa.resultado,
        },
      });

      await copiarCheckpointsNaConversao(tx, { de: "iniciativa", origemId: id, destinoId: created.id });

      // A conversa acompanha o item (os comentários sumiam da tela na conversão).
      if (iniciativa.comments.length > 0) {
        await tx.experimentoComment.createMany({
          data: iniciativa.comments.map((c) => ({
            experimentoId: created.id,
            memberId: c.memberId,
            content: c.content,
            createdAt: c.createdAt,
          })),
        });
      }

      return created;
    }, { timeout: TIMEOUT_DA_CONVERSAO_MS });

    await registrarEvento("iniciativa", id, member.id, { campo: "convertido", de: null, para: "experimento" });
    await registrarEvento("experimento", experimento.id, member.id, { campo: "criado", de: null, para: null, detalhe: "convertido de iniciativa" });
    await notificarConversao({ para: "experimento", novoId: experimento.id, autorId: member.id });

    revalidatePath("/iniciativas");
    revalidatePath("/experimentos");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");
    return { success: true, data: experimento.id };
  } catch (error) {
    console.error("convertIniciativaToExperimento error:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao converter a iniciativa." };
  }
}

export async function updateIniciativaDates(
  id: string,
  startDate: string,
  endDate: string
): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    const antes = await fotoAntes("iniciativa", id);
    const v = updateDatesSchema.parse({ startDate, endDate });

    const iniciativa = await prisma.iniciativa.update({
      where: { id },
      data: {
        startDate: new Date(v.startDate),
        endDate: new Date(v.endDate),
      },
    });

    await registrarMudancas("iniciativa", id, ator.id, antes);
    revalidatePath("/iniciativas"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: iniciativa };
  } catch (error) {
    console.error("updateIniciativaDates error:", error);
    if (error instanceof z.ZodError || (error as Error)?.name === "ZodError") {
      return { success: false, error: (error as z.ZodError).issues[0].message };
    }
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado ao atualizar as datas." };
  }
}

export async function updateIniciativaLaunchDate(
  id: string,
  launchDate: string | null
): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    const antes = await fotoAntes("iniciativa", id);
    const erroData = conferirData(launchDate);
    if (erroData) return { success: false, error: erroData };
    await prisma.iniciativa.update({
      where: { id },
      data: { launchDate: launchDate ? new Date(launchDate) : null },
    });
    await registrarMudancas("iniciativa", id, ator.id, antes);
    revalidatePath("/iniciativas"); revalidatePath("/dashboard"); revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado." };
  }
}

export async function updateIniciativaAnalysisDate(
  id: string,
  analysisDate: string | null
): Promise<ActionResponse> {
  try {
    const ator = await requireIniciativaOwnership(id);
    const antes = await fotoAntes("iniciativa", id);
    const erroData = conferirData(analysisDate);
    if (erroData) return { success: false, error: erroData };
    await prisma.iniciativa.update({
      where: { id },
      data: { analysisDate: analysisDate ? new Date(analysisDate) : null },
    });
    await registrarMudancas("iniciativa", id, ator.id, antes);
    revalidatePath("/iniciativas"); revalidatePath("/dashboard"); revalidatePath("/rituais"); revalidatePath("/roadmap");
    return { success: true, data: null };
  } catch (error) {
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro inesperado." };
  }
}
