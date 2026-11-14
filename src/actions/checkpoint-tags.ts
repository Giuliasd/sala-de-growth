"use server";

import { CHECKPOINT_TAG_COLORS } from "@/lib/checkpoint-tag-colors";
import { prisma } from "@/lib/prisma";
import { registrarEvento, registrarEventos } from "@/lib/historico-db";
import { antesDeMexerNoItem } from "@/lib/registro-semanal-db";
import { requireEditPermission, requireOwnershipPermission, type OwnershipMember } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Tags de checkpoint. Cada iniciativa/experimento configura as próprias — não
 * há catálogo global. Configurar tags é mutação estrutural do item (como criar
 * ou excluir checkpoint), então exige ser responsável do item ou liderança.
 */

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export type CheckpointTagOwner = { kind: "iniciativa" | "experimento"; id: string };

const ownerSchema = z.object({
  kind: z.enum(["iniciativa", "experimento"]),
  id: z.string().uuid("Item inválido."),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, "O nome da tag é obrigatório.")
  .max(40, "O nome da tag é muito longo.");

const createSchema = z.object({
  owner: ownerSchema,
  name: nameSchema,
  color: z.enum(CHECKPOINT_TAG_COLORS),
});

const updateSchema = z.object({
  id: z.string().uuid("Tag inválida."),
  name: nameSchema.optional(),
  color: z.enum(CHECKPOINT_TAG_COLORS).optional(),
});

async function requireOwnerAccess(owner: CheckpointTagOwner, member?: OwnershipMember) {
  const item =
    owner.kind === "iniciativa"
      ? await prisma.iniciativa.findUnique({
          where: { id: owner.id, deletedAt: null },
          select: { members: { select: { id: true } } },
        })
      : await prisma.experimento.findUnique({
          where: { id: owner.id, deletedAt: null },
          select: { members: { select: { id: true } } },
        });
  if (!item) {
    throw new Error(owner.kind === "iniciativa" ? "Iniciativa não encontrada." : "Experimento não encontrado.");
  }
  return requireOwnershipPermission(item.members.map((m) => m.id), member);
}

function ownerOf(tag: { iniciativaId: string | null; experimentoId: string | null }): CheckpointTagOwner {
  return tag.iniciativaId
    ? { kind: "iniciativa", id: tag.iniciativaId }
    : { kind: "experimento", id: tag.experimentoId! };
}

/**
 * "QA" e "qa" no mesmo item seriam duas pills idênticas no filtro. O @@unique
 * do banco é sensível a caixa, então a checagem de verdade é esta.
 */
async function assertNameFree(owner: CheckpointTagOwner, name: string, exceptId?: string) {
  const clash = await prisma.checkpointTag.findFirst({
    where: {
      ...(owner.kind === "iniciativa" ? { iniciativaId: owner.id } : { experimentoId: owner.id }),
      name: { equals: name, mode: "insensitive" },
      ...(exceptId && { NOT: { id: exceptId } }),
    },
    select: { id: true },
  });
  if (clash) throw new TagNameTaken();
}

class TagNameTaken extends Error {
  constructor() {
    super("Já existe uma tag com esse nome.");
  }
}

function revalidateOwner(owner: CheckpointTagOwner) {
  const base = owner.kind === "iniciativa" ? "/iniciativas" : "/experimentos";
  revalidatePath(base, "layout");
  revalidatePath(`${base}/${owner.id}`);
}

function toError(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof TagNameTaken) return error.message;
  // Violação do @@unique([dono, name]).
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return "Já existe uma tag com esse nome.";
  }
  if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrad"))) {
    return error.message;
  }
  return fallback;
}

export async function createCheckpointTag(data: {
  owner: CheckpointTagOwner;
  name: string;
  color: string;
}): Promise<ActionResponse<{ id: string; name: string; color: string }>> {
  try {
    const member = await requireEditPermission();
    const v = createSchema.parse(data);
    await requireOwnerAccess(v.owner, member);
    await assertNameFree(v.owner, v.name);

    // Tag nova entra no fim da lista.
    const ultima = await prisma.checkpointTag.aggregate({
      where: v.owner.kind === "iniciativa" ? { iniciativaId: v.owner.id } : { experimentoId: v.owner.id },
      _max: { order: true },
    });

    const tag = await prisma.checkpointTag.create({
      data: {
        name: v.name,
        color: v.color,
        order: (ultima._max.order ?? -1) + 1,
        ...(v.owner.kind === "iniciativa" ? { iniciativaId: v.owner.id } : { experimentoId: v.owner.id }),
      },
      select: { id: true, name: true, color: true },
    });

    await registrarEvento(v.owner.kind, v.owner.id, member.id, { campo: "tag", de: null, para: `“${tag.name}” criada` });
    revalidateOwner(v.owner);
    return { success: true, data: tag };
  } catch (error) {
    console.error("Erro ao criar tag de checkpoint:", error);
    return { success: false, error: toError(error, "Erro ao criar a tag.") };
  }
}

export async function updateCheckpointTag(data: {
  id: string;
  name?: string;
  color?: string;
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = updateSchema.parse(data);

    const existing = await prisma.checkpointTag.findUnique({
      where: { id: v.id },
      select: { iniciativaId: true, experimentoId: true, name: true, color: true },
    });
    if (!existing) return { success: false, error: "Tag não encontrada." };
    const owner = ownerOf(existing);
    await requireOwnerAccess(owner, member);
    if (v.name !== undefined) await assertNameFree(owner, v.name, v.id);

    // As tags entram na foto da semana: semana vencida congela com o nome de
    // antes da mudança (mesma regra das actions de checkpoint — AGENTS.md).
    await antesDeMexerNoItem(owner.kind, owner.id);
    await prisma.checkpointTag.update({
      where: { id: v.id },
      data: {
        ...(v.name !== undefined && { name: v.name }),
        ...(v.color !== undefined && { color: v.color }),
      },
    });

    const eventos = [
      ...(v.name !== undefined && v.name !== existing.name
        ? [{ campo: "tag" as const, de: null, para: `“${existing.name}” renomeada para “${v.name}”` }]
        : []),
      ...(v.color !== undefined && v.color !== existing.color
        ? [{ campo: "tag" as const, de: null, para: `cor de “${v.name ?? existing.name}” alterada` }]
        : []),
    ];
    await registrarEventos(owner.kind, owner.id, member.id, eventos);
    revalidateOwner(owner);
    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    console.error("Erro ao atualizar tag de checkpoint:", error);
    return { success: false, error: toError(error, "Erro ao atualizar a tag.") };
  }
}

const reorderSchema = z.object({
  owner: ownerSchema,
  ids: z.array(z.string().uuid("Tag inválida.")).max(200),
});

/**
 * Grava a ordem das tags do item (arrastar no gerenciador). `ids` é a lista
 * final, na ordem nova; ids de outro dono são ignorados pelo `where`.
 */
export async function reorderCheckpointTags(data: {
  owner: CheckpointTagOwner;
  ids: string[];
}): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = reorderSchema.parse(data);
    await requireOwnerAccess(v.owner, member);
    const dono = v.owner.kind === "iniciativa" ? { iniciativaId: v.owner.id } : { experimentoId: v.owner.id };

    await prisma.$transaction(
      v.ids.map((id, order) =>
        prisma.checkpointTag.updateMany({ where: { id, ...dono }, data: { order } })
      )
    );

    await registrarEvento(v.owner.kind, v.owner.id, member.id, { campo: "tag", de: null, para: "reordenadas" });
    revalidateOwner(v.owner);
    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    console.error("Erro ao reordenar tags de checkpoint:", error);
    return { success: false, error: toError(error, "Erro ao reordenar as tags.") };
  }
}

/** Exclui a tag. Os checkpoints marcados com ela só perdem a marcação. */
export async function deleteCheckpointTag(id: string): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const tagId = z.string().uuid("Tag inválida.").parse(id);

    const existing = await prisma.checkpointTag.findUnique({
      where: { id: tagId },
      select: { iniciativaId: true, experimentoId: true, name: true },
    });
    if (!existing) return { success: false, error: "Tag não encontrada." };
    const owner = ownerOf(existing);
    await requireOwnerAccess(owner, member);

    await antesDeMexerNoItem(owner.kind, owner.id);
    await prisma.checkpointTag.delete({ where: { id: tagId } });

    await registrarEvento(owner.kind, owner.id, member.id, { campo: "tag", de: null, para: `“${existing.name}” excluída` });
    revalidateOwner(owner);
    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    console.error("Erro ao excluir tag de checkpoint:", error);
    return { success: false, error: toError(error, "Erro ao excluir a tag.") };
  }
}
