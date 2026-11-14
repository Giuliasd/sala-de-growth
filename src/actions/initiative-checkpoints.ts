"use server";

import { antesDeMexerNoItem, contarRemarcacoes, marcarExcluidos } from "@/lib/registro-semanal-db";
import { planCheckpointDuplication } from "@/lib/checkpoint-duplication";
import { MAX_CHECKPOINT_DEPTH, planCheckpointMove, validMoveTargets } from "@/lib/checkpoint-move";
import { CHECKPOINT_CATEGORIAS, type CheckpointCategoria } from "@/lib/checkpoint-categoria";
import { podeSerRequisito } from "@/lib/checkpoint-marco";
import { planejarCoberturaDosPais } from "@/lib/checkpoint-cobertura";
import { prisma } from "@/lib/prisma";
import {
  fotosDosCheckpoints,
  registrarEvento,
  registrarEventos,
  registrarMovimentoDeCheckpoints,
  registrarMudancasDosCheckpoints,
} from "@/lib/historico-db";
import { notificarDuplicacaoDeCheckpoints, notificarResponsaveis, notificarResponsaveisEmLote } from "@/lib/notificacoes-db";
import { getStatusMeta } from "@/lib/statusConfig";
import {
  dataOpcionalSchema,
  datasEmOrdem,
  isDataPlausivel,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_ORDEM_DATAS,
  nomesComDatasInvertidas,
} from "@/lib/date-validation";
import { hasOwnershipAccess, requireEditPermission, requireOwnershipPermission, type OwnershipMember } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { erroNaListaDeOrdem } from "@/lib/lista-de-ordem";

const createCheckpointSchema = z.object({
  initiativeId: z.string().uuid("Iniciativa inválida."),
  parentId: z.string().uuid("Checkpoint pai inválido.").optional().nullable(),
  name: z.string().min(1, "O nome do checkpoint é obrigatório.").max(200, "O nome é muito longo."),
  description: z.string().max(1000, "A descrição é muito longa.").optional(),
  startDate: dataOpcionalSchema,
  dueDate: z.string().min(1, "A data de fim é obrigatória.").refine(isDataPlausivel, MENSAGEM_DATA_INVALIDA),
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
  // Nulável e opcional: a maioria dos checkpoints não tem categoria, e
  // `null` é o jeito de LIMPAR uma que já foi posta.
  categoria: z.enum(CHECKPOINT_CATEGORIAS).nullable().optional(),
  // Lista final de tags (da própria iniciativa). Ausente = não altera; `[]` = tira todas.
  tagIds: z.array(z.string().uuid("Tag inválida.")).optional(),
  // Só em marco: checkpoints necessários (lista final). Ignorado nos demais.
  requisitoIds: z.array(z.string().uuid("Checkpoint necessário inválido.")).optional(),
  // Só em checkpoint que não é marco: os marcos de que ele é necessário (o
  // outro lado de `requisitoIds`). Ignorado em marco.
  marcoIds: z.array(z.string().uuid("Marco inválido.")).optional(),
}).refine(datasEmOrdem, MENSAGEM_ORDEM_DATAS);

const updateCheckpointSchema = z.object({
  id: z.string().uuid("Checkpoint inválido."),
  name: z.string().min(1, "O nome do checkpoint é obrigatório.").max(200, "O nome é muito longo."),
  description: z.string().max(1000, "A descrição é muito longa.").optional().nullable(),
  startDate: dataOpcionalSchema,
  dueDate: z.string().min(1, "A data de fim é obrigatória.").refine(isDataPlausivel, MENSAGEM_DATA_INVALIDA),
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
  // Nulável e opcional: a maioria dos checkpoints não tem categoria, e
  // `null` é o jeito de LIMPAR uma que já foi posta.
  categoria: z.enum(CHECKPOINT_CATEGORIAS).nullable().optional(),
  // Lista final de tags (da própria iniciativa). Ausente = não altera; `[]` = tira todas.
  tagIds: z.array(z.string().uuid("Tag inválida.")).optional(),
  // Só em marco: lista final de necessários. Ausente = não altera; `[]` = tira todos.
  requisitoIds: z.array(z.string().uuid("Checkpoint necessário inválido.")).optional(),
  // Lista final dos marcos de que ele é necessário. Ausente = não altera; `[]` = tira de todos.
  marcoIds: z.array(z.string().uuid("Marco inválido.")).optional(),
}).refine(datasEmOrdem, MENSAGEM_ORDEM_DATAS);

// Edição em massa. Cada campo é opt-in: `undefined` = "não altera"; `null`
// (início) ou array vazio (responsáveis) = "limpa o valor". Sem essa distinção
// não haveria como dizer "tire o responsável de todos" sem também mexer nas datas.
const bulkUpdateCheckpointsSchema = z.object({
  ids: z.array(z.string().uuid("Checkpoint inválido.")).min(1, "Selecione ao menos um checkpoint."),
  memberIds: z.array(z.string().uuid("Responsável inválido.")).optional(),
  startDate: dataOpcionalSchema,
  dueDate: z.string().min(1, "A data de fim é obrigatória.").refine(isDataPlausivel, MENSAGEM_DATA_INVALIDA).optional(),
  isCompleted: z.boolean().optional(),
  // Ausente = não altera; `null` = tirar a categoria dos selecionados.
  categoria: z.enum(CHECKPOINT_CATEGORIAS).nullable().optional(),
  // Lista final de tags (da própria iniciativa). Ausente = não altera; `[]` = tira todas.
  tagIds: z.array(z.string().uuid("Tag inválida.")).optional(),
}).refine(datasEmOrdem, MENSAGEM_ORDEM_DATAS);

const renameCheckpointSchema = z.object({
  id: z.string().uuid("Checkpoint inválido."),
  name: z.string().trim().min(1, "O nome do checkpoint é obrigatório.").max(200, "O nome é muito longo."),
});

const bulkIdsSchema = z
  .array(z.string().uuid("Checkpoint inválido."))
  .min(1, "Selecione ao menos um checkpoint.");

/**
 * Mensagem de permissão da edição em massa. A operação é tudo-ou-nada, então a
 * mensagem precisa dizer QUAIS itens barraram — senão a pessoa fica sem saber o
 * que desmarcar. Lista até 3 nomes para não estourar o chip da barra flutuante.
 */
function blockedByPermissionMessage(names: string[]): string {
  const shown = names.slice(0, 3).map((n) => `"${n}"`).join(", ");
  const rest = names.length - 3;
  const list = rest > 0 ? `${shown} e mais ${rest}` : shown;
  return names.length === 1
    ? `Permissão negada: ${list} está sob responsabilidade de outra pessoa. Desmarque para continuar.`
    : `Permissão negada: ${list} estão sob responsabilidade de outras pessoas. Desmarque para continuar.`;
}

/** Edição em massa que deixaria o fim antes do início — nomeia quem barrou. */
function datasInvertidasMessage(names: string[]): string {
  const shown = names.slice(0, 3).map((n) => `"${n}"`).join(", ");
  const rest = names.length - 3;
  const list = rest > 0 ? `${shown} e mais ${rest}` : shown;
  return `${MENSAGEM_ORDEM_DATAS} Ficaria${names.length === 1 ? "" : "m"} fora de ordem: ${list}.`;
}

/**
 * Estica os pais para englobarem as datas dos filhos (ver
 * lib/checkpoint-cobertura.ts). Roda depois de toda mudança de data ou de
 * hierarquia, só nos ancestrais de `alterados`: o que já existia fora da
 * regra não é corrigido de carona. Lê a árvore inteira porque o ajuste sobe
 * a cadeia.
 */
async function cobrirPais(initiativeId: string, alterados: string[]): Promise<void> {
  const arvore = await prisma.initiativeCheckpoint.findMany({
    where: { initiativeId },
    select: { id: true, parentId: true, startDate: true, dueDate: true },
  });
  const ajustes = planejarCoberturaDosPais(arvore, alterados);
  if (ajustes.length === 0) return;
  await prisma.$transaction(
    ajustes.map(({ id, startDate, dueDate }) =>
      prisma.initiativeCheckpoint.update({ where: { id }, data: { startDate, dueDate } })
    )
  );
}

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

function knownError(error: unknown): string | null {
  if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrad"))) {
    return error.message;
  }
  return null;
}

// Mutações estruturais (criar/mover/excluir/reordenar) exigem ser responsável
// da iniciativa (ou liderança).
/**
 * Responsáveis do checkpoint `parentId` e de todos os ancestrais dele — quem
 * responde por um ramo pode criar subcheckpoints dentro dele, mesmo sem ser
 * responsável da iniciativa. É a mesma regra do editar (responsável do item
 * OU do checkpoint), estendida para cima: o sub nasce dentro do ramo da pessoa.
 *
 * Devolve null se o pai não existir ou for de outra iniciativa (request forjado).
 * `nivel` é onde o sub novo cairia (pai de topo → 1).
 */
async function responsaveisDoRamo(
  parentId: string,
  initiativeId: string
): Promise<{ ids: string[]; nivel: number } | null> {
  const ids: string[] = [];
  const vistos = new Set<string>();
  let atual: string | null = parentId;
  while (atual && !vistos.has(atual)) {
    vistos.add(atual);
    const cp: { initiativeId: string; parentId: string | null; members: { id: string }[] } | null =
      await prisma.initiativeCheckpoint.findUnique({
        where: { id: atual },
        select: { initiativeId: true, parentId: true, members: { select: { id: true } } },
      });
    if (!cp || cp.initiativeId !== initiativeId) return atual === parentId ? null : { ids, nivel: vistos.size - 1 };
    ids.push(...cp.members.map((m) => m.id));
    atual = cp.parentId;
  }
  return { ids, nivel: vistos.size };
}

/**
 * Tags do checkpoint pai: o default de um sub criado sem escolher tags. O sub
 * quase sempre é parte da mesma frente, e nascer sem tag o tirava do grupo do
 * pai na visão segmentada.
 */
async function tagsDoPai(parentId: string): Promise<string[]> {
  const pai = await prisma.initiativeCheckpoint.findUnique({
    where: { id: parentId },
    select: { tags: { select: { id: true } } },
  });
  return pai?.tags.map((t) => t.id) ?? [];
}

async function requireInitiativeOwnership(
  initiativeId: string,
  member?: OwnershipMember,
  /** Donos além dos responsáveis do item (ex.: os do ramo, ao criar um sub). */
  outrosDonos: string[] = []
) {
  // deletedAt: null — item excluído (ou convertido) não aceita mais mutação; sem
  // isto, uma aba antiga seguia criando checkpoints invisíveis em todas as telas.
  const initiative = await prisma.iniciativa.findUnique({
    where: { id: initiativeId, deletedAt: null },
    select: { members: { select: { id: true } } },
  });
  if (!initiative) throw new Error("Iniciativa não encontrada.");
  return requireOwnershipPermission(
    [...initiative.members.map((m) => m.id), ...outrosDonos],
    member
  );
}

// Tag só marca checkpoint da MESMA iniciativa que a configurou: cada item tem
// o próprio conjunto de tags, e um id de outro item só chega por request forjado.
async function assertTagsBelong(tagIds: string[] | undefined, initiativeId: string) {
  if (!tagIds?.length) return;
  const unique = [...new Set(tagIds)];
  const count = await prisma.checkpointTag.count({ where: { id: { in: unique }, iniciativaId: initiativeId } });
  if (count !== unique.length) throw new Error("Tag não encontrada nesta iniciativa.");
}

/**
 * Confere os necessários de um marco: todos da MESMA iniciativa, e
 * que não sejam marco (ver `podeSerRequisito`). Ids de fora só
 * chegam por request forjado ou por lista desatualizada no cliente.
 *
 * Devolve a mensagem de erro, ou null se a lista vale.
 */
async function erroNosRequisitos(
  requisitoIds: string[],
  initiativeId: string,
  marcoId?: string
): Promise<string | null> {
  const unique = [...new Set(requisitoIds)];
  if (unique.length === 0) return null;
  if (marcoId && unique.includes(marcoId)) return "Um marco não pode ser necessário para ele mesmo.";
  const encontrados = await prisma.initiativeCheckpoint.findMany({
    where: { id: { in: unique }, initiativeId },
    select: { parentId: true, categoria: true },
  });
  if (encontrados.length !== unique.length) return "Checkpoint necessário não encontrado nesta iniciativa.";
  if (!encontrados.every(podeSerRequisito)) {
    return "Um marco não pode ser atrelado a outro marco.";
  }
  return null;
}

/**
 * Confere os marcos escolhidos para um checkpoint (o inverso de
 * `erroNosRequisitos`): todos da MESMA iniciativa e de categoria MARCO.
 *
 * Quem muda a lista de um marco precisa poder editá-lo — a mesma regra de
 * `atrelarCheckpointsAoMarco`, senão este caminho contornaria a posse do
 * marco. Só conta o que MUDOU: manter um marco que a pessoa não controla,
 * enquanto edita o checkpoint, continua permitido.
 *
 * Devolve a mensagem de erro, ou null se a lista vale.
 */
async function erroNosMarcos(
  marcoIds: string[],
  atuais: string[],
  initiativeId: string,
  member: OwnershipMember
): Promise<string | null> {
  const escolhidos = [...new Set(marcoIds)];
  const alterados = new Set([
    ...escolhidos.filter((id) => !atuais.includes(id)),
    ...atuais.filter((id) => !escolhidos.includes(id)),
  ]);
  if (escolhidos.length === 0 && alterados.size === 0) return null;

  const marcos = await prisma.initiativeCheckpoint.findMany({
    where: { id: { in: [...new Set([...escolhidos, ...alterados])] }, initiativeId },
    select: {
      id: true,
      name: true,
      categoria: true,
      members: { select: { id: true } },
      initiative: { select: { members: { select: { id: true } } } },
    },
  });
  const porId = new Map(marcos.map((m) => [m.id, m]));
  for (const id of escolhidos) {
    const marco = porId.get(id);
    if (!marco) return "Marco não encontrado nesta iniciativa.";
    if (marco.categoria !== "MARCO") return "O checkpoint escolhido não é um marco.";
  }
  for (const id of alterados) {
    const marco = porId.get(id);
    if (!marco) continue;
    const donos = [...marco.initiative.members.map((m) => m.id), ...marco.members.map((m) => m.id)];
    if (!hasOwnershipAccess(member, donos)) {
      return `Permissão negada: o marco "${marco.name}" está sob responsabilidade de outra pessoa.`;
    }
  }
  return null;
}

export async function createCheckpoint(data: {
  initiativeId: string;
  parentId?: string | null;
  name: string;
  description?: string;
  startDate?: string | null;
  dueDate: string;
  memberIds?: string[];
  categoria?: CheckpointCategoria | null;
  tagIds?: string[];
  requisitoIds?: string[];
  marcoIds?: string[];
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = createCheckpointSchema.parse(data);
    // Sub: quem responde pelo checkpoint pai (ou um ancestral) também cria.
    let donosDoRamo: string[] = [];
    if (v.parentId) {
      const ramo = await responsaveisDoRamo(v.parentId, v.initiativeId);
      if (!ramo) return { success: false, error: "Checkpoint pai não encontrado." };
      // A tela só oferece "+ sub" até o nível 1; o servidor confere também —
      // um sub abaixo do nível 2 não é buscado pela página e sumiria.
      if (ramo.nivel > MAX_CHECKPOINT_DEPTH) {
        return { success: false, error: "Checkpoint passaria do limite de 3 níveis." };
      }
      donosDoRamo = ramo.ids;
    }
    await requireInitiativeOwnership(v.initiativeId, member, donosDoRamo);
    await assertTagsBelong(v.tagIds, v.initiativeId);
    // Sem tags na chamada, o sub herda as do pai; `[]` explícito é "sem tags".
    const tagIds = v.tagIds ?? (v.parentId ? await tagsDoPai(v.parentId) : []);
    // Necessários só valem em marco; nos demais a lista é ignorada.
    const requisitoIds = v.categoria === "MARCO" ? [...new Set(v.requisitoIds ?? [])] : [];
    const erroRequisitos = await erroNosRequisitos(requisitoIds, v.initiativeId);
    if (erroRequisitos) return { success: false, error: erroRequisitos };
    // Marcos de que ele é necessário: só vale fora de marco.
    const marcoIds = v.categoria !== "MARCO" ? [...new Set(v.marcoIds ?? [])] : [];
    const erroMarcos = await erroNosMarcos(marcoIds, [], v.initiativeId, member);
    if (erroMarcos) return { success: false, error: erroMarcos };

    const maxOrder = await prisma.initiativeCheckpoint.aggregate({
      where: {
        initiativeId: v.initiativeId,
        parentId: v.parentId ?? null,
      },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    await antesDeMexerNoItem("iniciativa", v.initiativeId);
    const checkpoint = await prisma.initiativeCheckpoint.create({
      data: {
        initiativeId: v.initiativeId,
        parentId: v.parentId ?? null,
        name: v.name,
        description: v.description,
        startDate: v.startDate ? new Date(v.startDate) : null,
        dueDate: new Date(v.dueDate),
        members: { connect: (v.memberIds ?? []).map((id) => ({ id })) },
        tags: { connect: [...new Set(tagIds)].map((id) => ({ id })) },
        requisitos: { connect: requisitoIds.map((id) => ({ id })) },
        marcos: { connect: marcoIds.map((id) => ({ id })) },
        categoria: v.categoria ?? null,
        isCompleted: false,
        order: nextOrder,
      },
    });

    await cobrirPais(v.initiativeId, [checkpoint.id]);
    await registrarEvento("iniciativa", v.initiativeId, member.id, { campo: "checkpoint", de: null, para: "criado", detalhe: checkpoint.name });
    await notificarResponsaveis({ fonte: "checkpoint-iniciativa", id: checkpoint.id, autorId: member.id, antes: [], depois: v.memberIds ?? [] });
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${v.initiativeId}`);
    return { success: true, data: checkpoint };
  } catch (error) {
    console.error("Error creating checkpoint:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro ao criar o checkpoint." };
  }
}

export async function updateCheckpoint(data: {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  dueDate: string;
  memberIds?: string[];
  categoria?: CheckpointCategoria | null;
  tagIds?: string[];
  requisitoIds?: string[];
  marcoIds?: string[];
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = updateCheckpointSchema.parse(data);

    // Qualquer responsável do checkpoint também pode editá-lo, além de qualquer
    // responsável da iniciativa.
    const existing = await prisma.initiativeCheckpoint.findUnique({
      where: { id: v.id },
      select: {
        initiativeId: true,
        name: true,
        categoria: true,
        dueDate: true,
        members: { select: { id: true } },
        marcos: { select: { id: true } },
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (!existing) return { success: false, error: "Checkpoint não encontrado." };
    await requireOwnershipPermission([
      ...existing.initiative.members.map((m) => m.id),
      ...existing.members.map((m) => m.id),
    ], member);
    await assertTagsBelong(v.tagIds, existing.initiativeId);

    // Ligações de marco seguem a categoria que fica depois do save:
    // - continua/vira marco: os necessários são a lista enviada (se veio);
    // - deixa de ser marco: os necessários que ele tinha caem;
    // - vira marco: sai dos marcos de que era necessário (marco não depende
    //   de marco).
    const categoriaFinal = v.categoria !== undefined ? v.categoria : existing.categoria;
    const ehMarcoAgora = categoriaFinal === "MARCO";
    const eraMarco = existing.categoria === "MARCO";
    if (ehMarcoAgora && v.requisitoIds !== undefined) {
      const erroRequisitos = await erroNosRequisitos(v.requisitoIds, existing.initiativeId, v.id);
      if (erroRequisitos) return { success: false, error: erroRequisitos };
    }
    // Marcos de que ELE é necessário: qualquer checkpoint, menos marco (marco
    // não depende de marco).
    const podeTerMarcos = !ehMarcoAgora;
    if (podeTerMarcos && v.marcoIds !== undefined) {
      const erroMarcos = await erroNosMarcos(
        v.marcoIds,
        existing.marcos.map((m) => m.id),
        existing.initiativeId,
        member
      );
      if (erroMarcos) return { success: false, error: erroMarcos };
    }

    // Histórico: a foto de antes (nome, prazo, categoria, responsáveis, tags, marcos).
    const fotosAntes = await fotosDosCheckpoints("iniciativa", [v.id]);
    await antesDeMexerNoItem("iniciativa", existing.initiativeId);
    const checkpoint = await prisma.initiativeCheckpoint.update({
      where: { id: v.id },
      data: {
        name: v.name,
        description: v.description,
        startDate: v.startDate ? new Date(v.startDate) : null,
        dueDate: new Date(v.dueDate),
        ...(v.memberIds !== undefined && {
          members: { set: v.memberIds.map((mid) => ({ id: mid })) },
        }),
        // Ausente não mexe na coluna; `null` limpa a categoria.
        ...(v.categoria !== undefined && { categoria: v.categoria }),
        ...(v.tagIds !== undefined && {
          tags: { set: [...new Set(v.tagIds)].map((tid) => ({ id: tid })) },
        }),
        ...(ehMarcoAgora && v.requisitoIds !== undefined && {
          requisitos: { set: [...new Set(v.requisitoIds)].map((rid) => ({ id: rid })) },
        }),
        ...(!ehMarcoAgora && eraMarco && { requisitos: { set: [] } }),
        ...(ehMarcoAgora && !eraMarco && { marcos: { set: [] } }),
        ...(podeTerMarcos && v.marcoIds !== undefined && {
          marcos: { set: [...new Set(v.marcoIds)].map((mid) => ({ id: mid })) },
        }),
      },
    });

    await cobrirPais(checkpoint.initiativeId, [v.id]);
    await contarRemarcacoes("iniciativa", [{ id: v.id, antes: existing.dueDate, depois: checkpoint.dueDate }]);
    // Histórico: a comparação mora na camada protegida — nada ali pode fazer
    // uma edição já salva parecer falha.
    await registrarMudancasDosCheckpoints("iniciativa", checkpoint.initiativeId, member.id, fotosAntes);
    if (v.memberIds !== undefined) {
      await notificarResponsaveis({ fonte: "checkpoint-iniciativa", id: v.id, autorId: member.id, antes: existing.members.map((m) => m.id), depois: v.memberIds });
    }
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${checkpoint.initiativeId}`);
    if (v.marcoIds !== undefined) {
      // O progresso do marco aparece na Weekly e no dashboard.
      revalidatePath("/rituais");
      revalidatePath("/dashboard");
    }
    return { success: true, data: checkpoint };
  } catch (error) {
    console.error("Error updating checkpoint:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao atualizar o checkpoint." };
  }
}

/**
 * Renomeia o checkpoint — e SÓ isso.
 *
 * Existe separada do `update` porque aquele exige o pacote inteiro (nome +
 * prazo) e zera o início quando não o recebe. Para renomear a partir da
 * Weekly, onde só o título está em jogo, isso significaria reenviar campos
 * que a tela não tem — e apagar o que ela não conhece.
 *
 * Mesma regra de permissão do update: responsável do item OU do checkpoint.
 */
export async function renameCheckpoint(data: {
  id: string;
  name: string;
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = renameCheckpointSchema.parse(data);

    const existing = await prisma.initiativeCheckpoint.findUnique({
      where: { id: v.id },
      select: {
        initiativeId: true,
        members: { select: { id: true } },
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (!existing) return { success: false, error: "Checkpoint não encontrado." };
    await requireOwnershipPermission([
      ...existing.initiative.members.map((m) => m.id),
      ...existing.members.map((m) => m.id),
    ], member);

    const fotosAntes = await fotosDosCheckpoints("iniciativa", [v.id]);
    await antesDeMexerNoItem("iniciativa", existing.initiativeId);
    const checkpoint = await prisma.initiativeCheckpoint.update({
      where: { id: v.id },
      data: { name: v.name },
    });
    await registrarMudancasDosCheckpoints("iniciativa", checkpoint.initiativeId, member.id, fotosAntes);

    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${checkpoint.initiativeId}`);
    revalidatePath("/rituais");
    return { success: true, data: checkpoint };
  } catch (error) {
    console.error("Erro ao renomear checkpoint:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao renomear o checkpoint." };
  }
}

export async function bulkUpdateCheckpoints(data: {
  ids: string[];
  memberIds?: string[];
  startDate?: string | null;
  dueDate?: string;
  isCompleted?: boolean;
  categoria?: CheckpointCategoria | null;
  tagIds?: string[];
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = bulkUpdateCheckpointsSchema.parse(data);

    const patch: {
      startDate?: Date | null;
      dueDate?: Date;
      categoria?: CheckpointCategoria | null;
    } = {};
    if (v.startDate !== undefined) patch.startDate = v.startDate ? new Date(v.startDate) : null;
    if (v.dueDate !== undefined) patch.dueDate = new Date(v.dueDate);
    if (v.categoria !== undefined) patch.categoria = v.categoria;
    if (
      Object.keys(patch).length === 0 &&
      v.memberIds === undefined &&
      v.tagIds === undefined &&
      v.isCompleted === undefined
    ) {
      return { success: false, error: "Nenhum campo para alterar." };
    }

    const checkpoints = await prisma.initiativeCheckpoint.findMany({
      where: { id: { in: v.ids } },
      select: {
        id: true, name: true, initiativeId: true, startDate: true, dueDate: true,
        members: { select: { id: true } },
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (checkpoints.length !== v.ids.length) {
      return { success: false, error: "Checkpoint não encontrado." };
    }
    // A seção de checkpoints é escopada por iniciativa: seleção cruzando
    // iniciativas só acontece por bug no cliente ou request forjado.
    const initiativeIds = new Set(checkpoints.map((c) => c.initiativeId));
    if (initiativeIds.size > 1) {
      return { success: false, error: "Seleção inválida: checkpoints de iniciativas diferentes." };
    }
    const initiativeId = checkpoints[0].initiativeId;
    await assertTagsBelong(v.tagIds, initiativeId);

    // Mesma regra do update individual, aplicada item por item: se a pessoa não
    // pode editar UM dos selecionados, nada é aplicado. Aqui avaliamos todos
    // antes de decidir, para a mensagem poder nomear os que barraram.
    const blocked = checkpoints.filter(
      (cp) =>
        !hasOwnershipAccess(member, [
          ...cp.initiative.members.map((m) => m.id),
          ...cp.members.map((m) => m.id),
        ])
    );
    if (blocked.length > 0) {
      return { success: false, error: blockedByPermissionMessage(blocked.map((cp) => cp.name)) };
    }

    // Mudar só UMA das datas não pode deixar alguém com o fim antes do início:
    // compara com a outra data, já salva, de cada selecionado. Nada é aplicado
    // se um deles ficar fora de ordem. (Com as duas juntas, o schema já conferiu.)
    if ((v.startDate !== undefined) !== (v.dueDate !== undefined)) {
      const invertidos = nomesComDatasInvertidas(v, checkpoints);
      if (invertidos.length > 0) {
        return { success: false, error: datasInvertidasMessage(invertidos) };
      }
    }

    // Escalares num UPDATE só; responsáveis (N:N, fora do alcance do
    // `updateMany`) num update por checkpoint, na mesma transação.
    //
    // O `updateMany` só entra se houver campo escalar: chamá-lo com `data: {}`
    // (caso "só troquei os responsáveis") é um UPDATE sem SET.
    const hasScalar = Object.keys(patch).length > 0;
    const ops = [
      ...(hasScalar
        ? [prisma.initiativeCheckpoint.updateMany({ where: { id: { in: v.ids } }, data: patch })]
        : []),
      // Concluir/reabrir só mexe em quem MUDA de estado. Antes o `completedAt`
      // de todos os selecionados era sobrescrito: concluir em massa um grupo
      // em que parte já estava concluída apagava QUANDO aquela parte foi
      // entregue (a Weekly e os relatórios contam pela data de conclusão).
      ...(v.isCompleted !== undefined
        ? [
            prisma.initiativeCheckpoint.updateMany({
              where: { id: { in: v.ids }, isCompleted: !v.isCompleted },
              data: { isCompleted: v.isCompleted, completedAt: v.isCompleted ? new Date() : null },
            }),
          ]
        : []),
      ...(v.memberIds !== undefined
        ? v.ids.map((id) =>
            prisma.initiativeCheckpoint.update({
              where: { id },
              data: { members: { set: v.memberIds!.map((mid) => ({ id: mid })) } },
            })
          )
        : []),
      // Tags também são N:N: mesma estratégia dos responsáveis.
      ...(v.tagIds !== undefined
        ? v.ids.map((id) =>
            prisma.initiativeCheckpoint.update({
              where: { id },
              data: { tags: { set: [...new Set(v.tagIds!)].map((tid) => ({ id: tid })) } },
            })
          )
        : []),
      // Trocar a categoria mexe nas ligações de marco, como no update
      // individual: virou marco → sai dos marcos de que era necessário;
      // deixou de ser → perde os necessários que tinha.
      ...(v.categoria !== undefined
        ? v.ids.map((id) =>
            prisma.initiativeCheckpoint.update({
              where: { id },
              data: v.categoria === "MARCO" ? { marcos: { set: [] } } : { requisitos: { set: [] } },
            })
          )
        : []),
    ];
    const fotosAntes = await fotosDosCheckpoints("iniciativa", v.ids);
    await antesDeMexerNoItem("iniciativa", initiativeId);
    await prisma.$transaction(ops);
    await registrarMudancasDosCheckpoints("iniciativa", initiativeId, member.id, fotosAntes);
    // Todos os selecionados existem (conferido acima): a contagem é a da seleção.
    const res = { count: v.ids.length };

    // Concluir em massa também tira a iniciativa do backlog — mesma regra do
    // toggle individual.
    let bumped = 0;
    if (v.isCompleted === true) {
      const b = await prisma.iniciativa.updateMany({
        where: { id: initiativeId, status: "BACKLOG" },
        data: { status: "EM_ANDAMENTO" },
      });
      bumped = b.count;
    }

    // Notificações: `checkpoints` foi lido ANTES da gravação, com os responsáveis de então.
    if (v.memberIds !== undefined) {
      await notificarResponsaveisEmLote({
        fonte: "checkpoint-iniciativa",
        autorId: member.id,
        itens: checkpoints.map((cp) => ({ id: cp.id, antes: cp.members.map((m) => m.id) })),
        depois: v.memberIds,
      });
    }
    if (v.startDate !== undefined || v.dueDate !== undefined) await cobrirPais(initiativeId, v.ids);
    if (v.dueDate !== undefined) {
      const depois = new Date(v.dueDate);
      await contarRemarcacoes("iniciativa", checkpoints.map((c) => ({ id: c.id, antes: c.dueDate, depois })));
    }
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${initiativeId}`);
    revalidatePath("/rituais");
    if (bumped > 0) {
      revalidatePath("/dashboard");
      revalidatePath("/roadmap");
      revalidatePath("/rituais");
    }
    return { success: true, data: { count: res.count } };
  } catch (error) {
    console.error("Error bulk updating checkpoints:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao atualizar os checkpoints." };
  }
}

export async function bulkDeleteCheckpoints(ids: string[]): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = bulkIdsSchema.parse(ids);

    const checkpoints = await prisma.initiativeCheckpoint.findMany({
      where: { id: { in: v } },
      select: {
        initiativeId: true,
        name: true,
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (checkpoints.length !== v.length) {
      return { success: false, error: "Checkpoint não encontrado." };
    }
    const initiativeIds = new Set(checkpoints.map((c) => c.initiativeId));
    if (initiativeIds.size > 1) {
      return { success: false, error: "Seleção inválida: checkpoints de iniciativas diferentes." };
    }
    const initiativeId = checkpoints[0].initiativeId;
    // Excluir é mutação estrutural: exige ser responsável da iniciativa — regra
    // mais estrita que a de editar, por isso a mensagem é própria (dizer "itens
    // sob sua responsabilidade" aqui confundiria quem É responsável pelo
    // checkpoint mas não pela iniciativa).
    if (!hasOwnershipAccess(member, checkpoints[0].initiative.members.map((m) => m.id))) {
      return {
        success: false,
        error: "Permissão negada: excluir checkpoints exige ser responsável pela iniciativa.",
      };
    }

    await antesDeMexerNoItem("iniciativa", initiativeId);
    // Subcheckpoints caem por cascata. Selecionar pai e filho junto é seguro:
    // é um único DELETE, e o filho já removido pela cascata só não é contado.
    const res = await prisma.initiativeCheckpoint.deleteMany({ where: { id: { in: v } } });

    await marcarExcluidos("iniciativa", initiativeId, member.id);
    // Um evento só para a seleção: os três primeiros nomes e quantos mais.
    const nomes = checkpoints.map((c) => c.name);
    await registrarEvento("iniciativa", initiativeId, member.id, {
      campo: "checkpoint", de: null,
      para: nomes.length > 1 ? `excluídos (${nomes.length})` : "excluído",
      detalhe: nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? `, +${nomes.length - 3}` : ""),
    });
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${initiativeId}`);
    return { success: true, data: { count: res.count } };
  } catch (error) {
    console.error("Error bulk deleting checkpoints:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao excluir os checkpoints." };
  }
}

/**
 * Duplica os checkpoints selecionados, na mesma iniciativa.
 *
 * Copia exatamente a seleção, preservando a hierarquia DENTRO dela: se pai e
 * filho foram marcados juntos, a cópia do filho nasce sob a cópia do pai; um
 * filho marcado sozinho ganha a cópia ao lado dele, sob o mesmo pai original.
 * Filhos não marcados não vêm junto — quem quer a subárvore marca com Shift.
 *
 * A cópia nasce pendente (duplicar serve para reaproveitar a estrutura, não o
 * andamento) e só as raízes da duplicação levam "(cópia)" no nome: marcar os
 * filhos também deixaria a árvore inteira poluída com o sufixo.
 */
export async function bulkDuplicateCheckpoints(ids: string[]): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = bulkIdsSchema.parse(ids);

    const checkpoints = await prisma.initiativeCheckpoint.findMany({
      where: { id: { in: v } },
      select: {
        id: true, initiativeId: true, parentId: true, name: true, description: true,
        startDate: true, dueDate: true, categoria: true, order: true,
        members: { select: { id: true } },
        tags: { select: { id: true } },
        requisitos: { select: { id: true } },
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (checkpoints.length !== v.length) {
      return { success: false, error: "Checkpoint não encontrado." };
    }
    const initiativeIds = new Set(checkpoints.map((c) => c.initiativeId));
    if (initiativeIds.size > 1) {
      return { success: false, error: "Seleção inválida: checkpoints de iniciativas diferentes." };
    }
    const initiativeId = checkpoints[0].initiativeId;
    // Criar checkpoint é mutação estrutural — mesma regra do create.
    if (!hasOwnershipAccess(member, checkpoints[0].initiative.members.map((m) => m.id))) {
      return {
        success: false,
        error: "Permissão negada: duplicar checkpoints exige ser responsável pela iniciativa.",
      };
    }

    const plan = planCheckpointDuplication(checkpoints);
    // Cópias que ficam sob um pai que JÁ existe vão para o fim daquele grupo de
    // irmãos; as que ficam sob outra cópia herdam a ordem relativa original.
    const existingParents = [...new Set(plan.filter((p) => !p.parentIsCopy).map((p) => p.parentId))];
    const maxOrders = await Promise.all(
      existingParents.map((parentId) =>
        prisma.initiativeCheckpoint.aggregate({
          where: { initiativeId, parentId },
          _max: { order: true },
        })
      )
    );
    const nextOrder = new Map(
      existingParents.map((parentId, i) => [parentId, (maxOrders[i]._max.order ?? -1) + 1])
    );

    await antesDeMexerNoItem("iniciativa", initiativeId);
    await prisma.$transaction(
      plan.map((p) => {
        let order = p.source.order;
        if (!p.parentIsCopy) {
          order = nextOrder.get(p.parentId)!;
          nextOrder.set(p.parentId, order + 1);
        }
        return prisma.initiativeCheckpoint.create({
          data: {
            id: p.newId,
            initiativeId,
            parentId: p.parentId,
            name: p.name,
            description: p.source.description,
            startDate: p.source.startDate,
            dueDate: p.source.dueDate,
            categoria: p.source.categoria,
            members: { connect: p.source.members.map((m) => ({ id: m.id })) },
            tags: { connect: p.source.tags.map((t) => ({ id: t.id })) },
            // Marco duplicado depende dos mesmos checkpoints que o original.
            ...(p.source.categoria === "MARCO" && {
              requisitos: { connect: p.source.requisitos.map((r) => ({ id: r.id })) },
            }),
            isCompleted: false,
            order,
          },
        });
      })
    );

    // Quem é responsável pelas cópias é avisado (um aviso, com a contagem).
    await notificarDuplicacaoDeCheckpoints({
      kind: "iniciativa",
      itemId: initiativeId,
      autorId: member.id,
      copias: plan.map((p) => ({ nome: p.name, responsaveisIds: p.source.members.map((m) => m.id) })),
    });
    await registrarEventos(
      "iniciativa",
      initiativeId,
      member.id,
      plan
        .filter((p) => !p.parentIsCopy)
        .map((p) => ({ campo: "checkpoint" as const, de: null, para: `duplicado (cópia: "${p.name}")`, detalhe: p.source.name }))
    );
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${initiativeId}`);
    revalidatePath("/rituais");
    return { success: true, data: { count: plan.length, ids: plan.map((p) => p.newId) } };
  } catch (error) {
    console.error("Error bulk duplicating checkpoints:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao duplicar os checkpoints." };
  }
}

const bulkMoveCheckpointsSchema = z.object({
  ids: bulkIdsSchema,
  parentId: z.string().uuid("Checkpoint de destino inválido.").nullable(),
});

/**
 * Move os selecionados para baixo de `parentId` (`null` = topo), no fim
 * daquele grupo de irmãos. Leva a subárvore junto; quem foi marcado junto com
 * o pai continua sob ele (ver `planCheckpointMove`).
 *
 * `ids` chega na ordem em que a lista exibe, e é essa a ordem no destino.
 */
export async function bulkMoveCheckpoints(data: {
  ids: string[];
  parentId: string | null;
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = bulkMoveCheckpointsSchema.parse(data);

    const checkpoints = await prisma.initiativeCheckpoint.findMany({
      where: { id: { in: v.ids } },
      select: {
        initiativeId: true,
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (checkpoints.length !== v.ids.length) {
      return { success: false, error: "Checkpoint não encontrado." };
    }
    const ownerIds = new Set(checkpoints.map((c) => c.initiativeId));
    if (ownerIds.size > 1) {
      return { success: false, error: "Seleção inválida: checkpoints de iniciativas diferentes." };
    }
    const initiativeId = checkpoints[0].initiativeId;
    // Mover é mutação estrutural — mesma regra do arrasto.
    if (!hasOwnershipAccess(member, checkpoints[0].initiative.members.map((m) => m.id))) {
      return {
        success: false,
        error: "Permissão negada: mover checkpoints exige ser responsável pela iniciativa.",
      };
    }

    // A árvore inteira da iniciativa: o destino tem de ser dela, e as regras de
    // ciclo e profundidade olham os filhos não selecionados também.
    const all = await prisma.initiativeCheckpoint.findMany({
      where: { initiativeId },
      select: { id: true, parentId: true, order: true },
    });
    const plan = planCheckpointMove(all, v.ids, v.parentId);
    if (!plan.ok) return { success: false, error: plan.error };

    await antesDeMexerNoItem("iniciativa", initiativeId);
    await prisma.$transaction(
      plan.moves.map(({ id, parentId, order }) =>
        prisma.initiativeCheckpoint.update({
          where: { id },
          data: { parentId, order },
        })
      )
    );

    await cobrirPais(initiativeId, v.ids);
    await registrarMovimentoDeCheckpoints("iniciativa", initiativeId, member.id, v.ids, v.parentId);
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${initiativeId}`);
    revalidatePath("/rituais");
    return { success: true, data: { count: v.ids.length } };
  } catch (error) {
    console.error("Error bulk moving checkpoints:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao mover os checkpoints." };
  }
}

const atrelarAoMarcoSchema = z.object({
  marcoId: z.string().uuid("Marco inválido."),
  ids: bulkIdsSchema,
});

/**
 * Atrela os selecionados ao marco como necessários — o caminho rápido da
 * edição em massa. Soma aos que o marco já tinha (não substitui): quem monta
 * o plano costuma atrelar em levas.
 *
 * Permissão é a de EDITAR o marco (responsável da iniciativa ou do marco):
 * é a lista dele que muda, não os checkpoints atrelados.
 */
export async function atrelarCheckpointsAoMarco(data: {
  marcoId: string;
  ids: string[];
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = atrelarAoMarcoSchema.parse(data);

    const marco = await prisma.initiativeCheckpoint.findUnique({
      where: { id: v.marcoId },
      select: {
        initiativeId: true,
        categoria: true,
        members: { select: { id: true } },
        initiative: { select: { members: { select: { id: true } } } },
      },
    });
    if (!marco) return { success: false, error: "Marco não encontrado." };
    if (marco.categoria !== "MARCO") return { success: false, error: "O checkpoint escolhido não é um marco." };
    await requireOwnershipPermission([
      ...marco.initiative.members.map((m) => m.id),
      ...marco.members.map((m) => m.id),
    ], member);

    const erroRequisitos = await erroNosRequisitos(v.ids, marco.initiativeId, v.marcoId);
    if (erroRequisitos) return { success: false, error: erroRequisitos };

    const fotosAntes = await fotosDosCheckpoints("iniciativa", [v.marcoId]);
    await prisma.initiativeCheckpoint.update({
      where: { id: v.marcoId },
      data: { requisitos: { connect: [...new Set(v.ids)].map((id) => ({ id })) } },
    });
    await registrarMudancasDosCheckpoints("iniciativa", marco.initiativeId, member.id, fotosAntes);

    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${marco.initiativeId}`);
    revalidatePath("/rituais");
    revalidatePath("/dashboard");
    return { success: true, data: { count: v.ids.length } };
  } catch (error) {
    console.error("Error linking checkpoints to marco:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: "Erro ao atrelar os checkpoints ao marco." };
  }
}

export async function updateCheckpointParent(data: {
  id: string;
  /**
   * Outros checkpoints que vão junto para o mesmo pai — o arrasto de uma
   * seleção em massa. A posição de todos vem em `siblings`.
   */
  juntos?: string[];
  parentId: string | null;
  siblings: { id: string; order: number }[];
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const ids = [...new Set([data.id, ...(data.juntos ?? [])])];

    const checkpoint = await prisma.initiativeCheckpoint.findUnique({
      where: { id: data.id },
      select: { initiativeId: true },
    });
    if (!checkpoint) return { success: false, error: "Checkpoint não encontrado." };
    await requireInitiativeOwnership(checkpoint.initiativeId, member);
    // Os que vão junto têm de ser do mesmo dono: a posse foi checada só nele.
    if (ids.length > 1) {
      const doMesmoDono = await prisma.initiativeCheckpoint.count({
        where: { id: { in: ids }, initiativeId: checkpoint.initiativeId },
      });
      if (doMesmoDono !== ids.length) return { success: false, error: "Checkpoint não encontrado." };
    }
    // `siblings` também vem do cliente e vira um UPDATE por elemento: mesma
    // regra do reordenar (sem repetidos, com teto, todos deste item).
    const erroNaOrdem = await erroNaListaDeOrdem(
      data.siblings.map((s) => s.id),
      (sibs) => prisma.initiativeCheckpoint.count({ where: { id: { in: sibs }, initiativeId: checkpoint.initiativeId } }),
      "Checkpoint não encontrado.",
    );
    if (erroNaOrdem) return { success: false, error: erroNaOrdem };

    // Mesmas regras do mover em massa, revalidadas com a árvore do banco: o
    // arrasto já filtra, mas árvore desatualizada ou request forjado gravariam
    // ciclo ou checkpoint além do nível 2 — que a página não busca, e some.
    if (data.parentId !== null) {
      const arvore = await prisma.initiativeCheckpoint.findMany({
        where: { initiativeId: checkpoint.initiativeId },
        select: { id: true, parentId: true },
      });
      if (!validMoveTargets(arvore, ids).has(data.parentId)) {
        return { success: false, error: "O checkpoint não pode ir para lá: passaria do limite de 3 níveis." };
      }
    }

    await antesDeMexerNoItem("iniciativa", checkpoint.initiativeId);
    await prisma.$transaction([
      ...ids.map((id) =>
        prisma.initiativeCheckpoint.update({
          where: { id },
          data: { parentId: data.parentId },
        })
      ),
      // updateMany amarrado ao item: `siblings` vem do cliente e não tem a posse
      // checada id a id — com update({ where: { id } }) um request forjado
      // reordenava checkpoints de OUTRO item (reorderCheckpoints já fazia certo).
      ...data.siblings.map(({ id, order }) =>
        prisma.initiativeCheckpoint.updateMany({ where: { id, initiativeId: checkpoint.initiativeId }, data: { order } })
      ),
    ]);

    await cobrirPais(checkpoint.initiativeId, ids);
    await registrarMovimentoDeCheckpoints("iniciativa", checkpoint.initiativeId, member.id, ids, data.parentId);
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${checkpoint.initiativeId}`);
    return { success: true, data: null };
  } catch (error) {
    console.error("Error updating checkpoint parent:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro ao mover o checkpoint." };
  }
}

export async function reorderCheckpoints(
  initiativeId: string,
  items: { id: string; order: number }[]
): Promise<ActionResponse> {
  try {
    const ator = await requireInitiativeOwnership(initiativeId);

    // A posse foi checada no item pai (initiativeId), mas os ids vêm do
    // cliente: sem amarrar cada checkpoint a esse pai, um request forjado
    // reordenava checkpoints de outra iniciativa — onde a pessoa não tem permissão.
    // A checagem vem antes de gravar para não aplicar uma reordenação pela metade.
    // Sem repetidos e com teto (ver lib/lista-de-ordem.ts): cada elemento vira
    // um UPDATE, e contar só os ids distintos deixava passar o mesmo id N vezes.
    const erroNaOrdem = await erroNaListaDeOrdem(
      items.map((i) => i.id),
      (ids) => prisma.initiativeCheckpoint.count({ where: { id: { in: ids }, initiativeId } }),
      "Checkpoint não encontrado nesta iniciativa.",
    );
    if (erroNaOrdem) return { success: false, error: erroNaOrdem };

    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.initiativeCheckpoint.updateMany({ where: { id, initiativeId }, data: { order } })
      )
    );
    await registrarEvento("iniciativa", initiativeId, ator.id, { campo: "ordem", de: null, para: null });

    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${initiativeId}`);
    return { success: true, data: null };
  } catch (error) {
    console.error("Error reordering checkpoints:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro ao reordenar os checkpoints." };
  }
}

export async function toggleCheckpointCompletion(checkpointId: string): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();

    const current = await prisma.initiativeCheckpoint.findUnique({
      where: { id: checkpointId },
      select: {
        initiativeId: true,
        isCompleted: true,
        members: { select: { id: true } },
        initiative: { select: { members: { select: { id: true } } } },
      },
    });

    if (!current) {
      return { success: false, error: "Checkpoint não encontrado." };
    }
    // Qualquer responsável da iniciativa ou do checkpoint pode concluí-lo.
    await requireOwnershipPermission([
      ...current.initiative.members.map((m) => m.id),
      ...current.members.map((m) => m.id),
    ], member);

    const nextStatus = !current.isCompleted;

    await antesDeMexerNoItem("iniciativa", current.initiativeId);
    const checkpoint = await prisma.initiativeCheckpoint.update({
      where: { id: checkpointId },
      data: {
        isCompleted: nextStatus,
        completedAt: nextStatus ? new Date() : null,
      },
    });

    // Concluir um checkpoint (ou subcheckpoint) tira a iniciativa do backlog:
    // se estava em BACKLOG, passa para EM_ANDAMENTO. O `updateMany` com o status
    // no filtro torna a transição atômica e não sobrescreve outros status.
    await registrarEvento("iniciativa", current.initiativeId, member.id, {
      campo: "checkpoint", de: null, detalhe: checkpoint.name, para: nextStatus ? "concluído" : "reaberto",
    });

    let bumped = 0;
    if (nextStatus) {
      const res = await prisma.iniciativa.updateMany({
        where: { id: current.initiativeId, status: "BACKLOG" },
        data: { status: "EM_ANDAMENTO" },
      });
      bumped = res.count;
      if (bumped > 0) {
        // A subida automática de BACKLOG também é uma mudança de status do item.
        await registrarEvento("iniciativa", current.initiativeId, member.id, {
          campo: "status",
          de: getStatusMeta("iniciativa", "BACKLOG").label,
          para: getStatusMeta("iniciativa", "EM_ANDAMENTO").label,
          detalhe: "ao concluir um checkpoint",
        });
      }
    }

    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${current.initiativeId}`);
    // A Weekly mostra a caixa de conclusão, então ela invalida sempre — não
    // só quando a iniciativa saiu do backlog.
    revalidatePath("/rituais");
    if (bumped > 0) {
      revalidatePath("/dashboard");
      revalidatePath("/roadmap");
    }
    return { success: true, data: checkpoint };
  } catch (error) {
    console.error("Error toggling checkpoint:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro ao alternar status do checkpoint." };
  }
}

export async function deleteCheckpoint(checkpointId: string): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();

    const checkpoint = await prisma.initiativeCheckpoint.findUnique({
      where: { id: checkpointId },
    });

    if (!checkpoint) {
      return { success: false, error: "Checkpoint não encontrado." };
    }
    await requireInitiativeOwnership(checkpoint.initiativeId, member);

    await antesDeMexerNoItem("iniciativa", checkpoint.initiativeId);
    await prisma.initiativeCheckpoint.delete({
      where: { id: checkpointId },
    });

    await marcarExcluidos("iniciativa", checkpoint.initiativeId, member.id);
    await registrarEvento("iniciativa", checkpoint.initiativeId, member.id, { campo: "checkpoint", de: null, para: "excluído", detalhe: checkpoint.name });
    revalidatePath("/iniciativas", "layout");
    revalidatePath(`/iniciativas/${checkpoint.initiativeId}`);
    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    console.error("Error deleting checkpoint:", error);
    const known = knownError(error);
    if (known) return { success: false, error: known };
    return { success: false, error: "Erro ao deletar o checkpoint." };
  }
}
