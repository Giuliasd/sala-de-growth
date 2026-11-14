import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CheckpointCategoria } from "@/generated/prisma/enums";

/**
 * Checkpoints na conversão iniciativa ↔ experimento.
 *
 * A conversão cria o item novo e apaga (soft) o antigo. Os checkpoints não
 * vinham junto: ficavam pendurados no item apagado e sumiam de todas as telas
 * — da Weekly, do roadmap, do detalhe — como se nunca tivessem existido.
 *
 * Iniciativa e experimento têm tabelas de checkpoint separadas, então "levar
 * junto" é COPIAR: cada checkpoint, com a árvore de subcheckpoints, o
 * andamento (concluído e quando), responsáveis, tags e as ligações de marco.
 * O item antigo fica como estava — é soft delete, e apagar o que ele tinha
 * tiraria a volta.
 *
 * Diferente da duplicação (`checkpoint-duplication`), aqui nada muda: nome sem
 * "(cópia)", concluído continua concluído, a data de criação é a original. É o
 * mesmo trabalho trocando de casa, não uma cópia para reaproveitar.
 */

export type CheckpointFonte = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  isCompleted: boolean;
  completedAt: Date | null;
  categoria: CheckpointCategoria | null;
  order: number;
  createdAt: Date;
  members: { id: string }[];
  tags: { id: string }[];
  requisitos: { id: string }[];
};

export type TagFonte = { id: string; name: string; color: string; order: number; createdAt: Date };

export type PlanoDeConversao = {
  tags: { fonte: TagFonte; novoId: string }[];
  /** Em ordem de criação: pai antes do filho. */
  checkpoints: {
    fonte: CheckpointFonte;
    novoId: string;
    parentId: string | null;
    tagIds: string[];
  }[];
  /** Marcos e os necessários deles, já com os ids novos. */
  requisitos: { marcoId: string; requisitoIds: string[] }[];
};

/**
 * Planeja a cópia: ids novos gerados aqui para o filho apontar para o pai e o
 * marco para os necessários dentro de uma transação só.
 *
 * Referência que não está na lista (pai, tag ou necessário de outro item —
 * não deveria existir, mas o banco não impede) cai em vez de quebrar a
 * conversão: o checkpoint sobe para o topo e a ligação some.
 */
export function planejarConversao(
  checkpoints: CheckpointFonte[],
  tags: TagFonte[],
  novoId: () => string = randomUUID
): PlanoDeConversao {
  const porId = new Map(checkpoints.map((c) => [c.id, c]));
  const profundidade = (c: CheckpointFonte): number => {
    let d = 0;
    let pid = c.parentId;
    // O limite protege de um ciclo (que o app não cria) virar laço infinito.
    while (pid && porId.has(pid) && d < checkpoints.length) {
      d++;
      pid = porId.get(pid)!.parentId;
    }
    return d;
  };

  const tagsPlano = tags.map((fonte) => ({ fonte, novoId: novoId() }));
  const tagNova = new Map(tagsPlano.map((t) => [t.fonte.id, t.novoId]));

  const ordenados = [...checkpoints].sort(
    (a, b) => profundidade(a) - profundidade(b) || a.order - b.order
  );
  const cpNovo = new Map(ordenados.map((c) => [c.id, novoId()]));

  return {
    tags: tagsPlano,
    checkpoints: ordenados.map((fonte) => ({
      fonte,
      novoId: cpNovo.get(fonte.id)!,
      parentId: fonte.parentId ? (cpNovo.get(fonte.parentId) ?? null) : null,
      tagIds: fonte.tags.flatMap((t) => tagNova.get(t.id) ?? []),
    })),
    requisitos: ordenados
      .filter((c) => c.categoria === "MARCO" && c.requisitos.length > 0)
      .map((c) => ({
        marcoId: cpNovo.get(c.id)!,
        requisitoIds: c.requisitos.flatMap((r) => cpNovo.get(r.id) ?? []),
      }))
      .filter((r) => r.requisitoIds.length > 0),
  };
}

const CAMPOS_DO_CHECKPOINT = {
  id: true, parentId: true, name: true, description: true, startDate: true, dueDate: true,
  isCompleted: true, completedAt: true, categoria: true, order: true, createdAt: true,
  members: { select: { id: true } },
  tags: { select: { id: true } },
  requisitos: { select: { id: true } },
} as const;

const CAMPOS_DA_TAG = { id: true, name: true, color: true, order: true, createdAt: true } as const;

function dadosDoCheckpoint(p: PlanoDeConversao["checkpoints"][number]) {
  const f = p.fonte;
  return {
    id: p.novoId,
    parentId: p.parentId,
    name: f.name,
    description: f.description,
    startDate: f.startDate,
    dueDate: f.dueDate,
    isCompleted: f.isCompleted,
    completedAt: f.completedAt,
    categoria: f.categoria,
    order: f.order,
    createdAt: f.createdAt,
    members: { connect: f.members.map((m) => ({ id: m.id })) },
    tags: { connect: p.tagIds.map((id) => ({ id })) },
  };
}

/**
 * Copia checkpoints e tags de um item para o item que nasceu da conversão.
 * Roda dentro da transação da conversão: se a cópia falha, o item novo não é
 * criado e o antigo não é apagado.
 *
 * Devolve quantos checkpoints foram copiados.
 */
export async function copiarCheckpointsNaConversao(
  tx: Prisma.TransactionClient,
  conversao:
    | { de: "iniciativa"; origemId: string; destinoId: string }
    | { de: "experimento"; origemId: string; destinoId: string }
): Promise<number> {
  if (conversao.de === "iniciativa") {
    // Em sequência: na transação interativa tudo passa por UMA conexão, e duas
    // consultas ao mesmo tempo nela são aviso hoje e erro no pg@9.
    const checkpoints = await tx.initiativeCheckpoint.findMany({
      where: { initiativeId: conversao.origemId },
      select: CAMPOS_DO_CHECKPOINT,
    });
    const tags = await tx.checkpointTag.findMany({ where: { iniciativaId: conversao.origemId }, select: CAMPOS_DA_TAG });
    const plano = planejarConversao(checkpoints, tags);
    if (plano.tags.length > 0) {
      await tx.checkpointTag.createMany({
        data: plano.tags.map((t) => ({
          id: t.novoId, name: t.fonte.name, color: t.fonte.color, order: t.fonte.order,
          createdAt: t.fonte.createdAt, experimentoId: conversao.destinoId,
        })),
      });
    }
    for (const p of plano.checkpoints) {
      await tx.experimentoCheckpoint.create({
        data: { ...dadosDoCheckpoint(p), experimentoId: conversao.destinoId },
      });
    }
    for (const r of plano.requisitos) {
      await tx.experimentoCheckpoint.update({
        where: { id: r.marcoId },
        data: { requisitos: { connect: r.requisitoIds.map((id) => ({ id })) } },
      });
    }
    // O registro da semana vai junto: sem isso, a passagem dos checkpoints
    // pelas semanas ficava presa no item apagado.
    for (const p of plano.checkpoints) {
      await tx.registroSemanal.updateMany({
        where: { initiativeCheckpointId: p.fonte.id },
        data: {
          initiativeCheckpointId: null, iniciativaId: null,
          experimentoCheckpointId: p.novoId, experimentoId: conversao.destinoId,
        },
      });
    }
    await tx.registroSemanal.updateMany({
      where: { iniciativaId: conversao.origemId },
      data: { iniciativaId: null, experimentoId: conversao.destinoId },
    });
    return plano.checkpoints.length;
  }

  // Em sequência: na transação interativa tudo passa por UMA conexão, e duas
  // consultas ao mesmo tempo nela são aviso hoje e erro no pg@9.
  const checkpoints = await tx.experimentoCheckpoint.findMany({
    where: { experimentoId: conversao.origemId },
    select: CAMPOS_DO_CHECKPOINT,
  });
  const tags = await tx.checkpointTag.findMany({ where: { experimentoId: conversao.origemId }, select: CAMPOS_DA_TAG });
  const plano = planejarConversao(checkpoints, tags);
  if (plano.tags.length > 0) {
    await tx.checkpointTag.createMany({
      data: plano.tags.map((t) => ({
        id: t.novoId, name: t.fonte.name, color: t.fonte.color, order: t.fonte.order,
        createdAt: t.fonte.createdAt, iniciativaId: conversao.destinoId,
      })),
    });
  }
  for (const p of plano.checkpoints) {
    await tx.initiativeCheckpoint.create({
      data: { ...dadosDoCheckpoint(p), initiativeId: conversao.destinoId },
    });
  }
  for (const r of plano.requisitos) {
    await tx.initiativeCheckpoint.update({
      where: { id: r.marcoId },
      data: { requisitos: { connect: r.requisitoIds.map((id) => ({ id })) } },
    });
  }
  for (const p of plano.checkpoints) {
    await tx.registroSemanal.updateMany({
      where: { experimentoCheckpointId: p.fonte.id },
      data: {
        experimentoCheckpointId: null, experimentoId: null,
        initiativeCheckpointId: p.novoId, iniciativaId: conversao.destinoId,
      },
    });
  }
  await tx.registroSemanal.updateMany({
    where: { experimentoId: conversao.origemId },
    data: { experimentoId: null, iniciativaId: conversao.destinoId },
  });
  return plano.checkpoints.length;
}

/**
 * Uma criação por checkpoint (os responsáveis e as tags são N:N, fora do
 * alcance do `createMany`), em sequência dentro da transação. O padrão de 5s
 * do Prisma não cobre uma árvore grande no essential-0, onde cada ida ao banco
 * custa caro.
 */
export const TIMEOUT_DA_CONVERSAO_MS = 30_000;
