import { prisma } from "@/lib/prisma";
import { diaPtBr } from "@/lib/csv";
import { getStatusMeta } from "@/lib/statusConfig";
import {
  ROTULO_DA_ACAO_ICE,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_RESULTADO,
  ROTULO_DA_CATEGORIA,
  diffDeCheckpoint,
  diffDeSnapshots,
  juntarNomes,
  type EntidadeDoHistorico,
  type FotoDoCheckpoint,
  type Mudanca,
  type Snapshot,
} from "@/lib/historico";

/**
 * Histórico de mudanças — o acesso ao banco. As regras estão em `lib/historico.ts`.
 *
 * Padrão de uso numa action, DEPOIS do gate de permissão:
 *
 *   const antes = await fotoAntes("iniciativa", id);
 *   ...grava...
 *   await registrarMudancas("iniciativa", id, membro.id, antes);
 *
 * Falha aqui NUNCA impede a edição: o histórico é memória, não portão. Loga e
 * segue (mesmo contrato do registro da semana).
 *
 * Nada aqui é server action: não é para ser chamado do cliente.
 */

const ENTIDADE = { iniciativa: "INICIATIVA", experimento: "EXPERIMENTO" } as const;

const trimestre = (q: { quarter: number; year: number }) => `Q${q.quarter} ${q.year}`;

/** O item como o usuário o vê, em texto. null se o item não existe. */
export async function snapshotDoItem(
  kind: EntidadeDoHistorico,
  id: string
): Promise<Snapshot | null> {
  if (kind === "iniciativa") {
    const i = await prisma.iniciativa.findUnique({
      where: { id },
      select: {
        name: true, status: true, priority: true, startDate: true, endDate: true,
        launchDate: true, analysisDate: true, resultado: true, docLink: true,
        frente: { select: { name: true } },
        quarter: { select: { quarter: true, year: true } },
        okr: { select: { objective: true } },
        members: { select: { name: true } },
      },
    });
    if (!i) return null;
    return {
      nome: i.name,
      status: getStatusMeta("iniciativa", i.status).label,
      prioridade: ROTULO_DA_PRIORIDADE[i.priority] ?? i.priority,
      frente: i.frente.name,
      quarter: trimestre(i.quarter),
      okr: i.okr?.objective ?? "",
      inicio: diaPtBr(i.startDate),
      fim: diaPtBr(i.endDate),
      lancamento: diaPtBr(i.launchDate),
      analise: diaPtBr(i.analysisDate),
      resultado: i.resultado ? (ROTULO_DO_RESULTADO[i.resultado] ?? i.resultado) : "",
      link: i.docLink ?? "",
      responsaveis: juntarNomes(i.members.map((m) => m.name)),
    };
  }

  const e = await prisma.experimento.findUnique({
    where: { id },
    select: {
      name: true, description: true, objective: true, status: true, startDate: true,
      endDate: true, launchDate: true, analysisDate: true, resultado: true, docLink: true,
      iceScore: true, iceAction: true,
      frente: { select: { name: true } },
      quarter: { select: { quarter: true, year: true } },
      okr: { select: { objective: true } },
      members: { select: { name: true } },
    },
  });
  if (!e) return null;
  return {
    nome: e.name,
    descricao: e.description,
    objetivo: e.objective,
    status: getStatusMeta("experimento", e.status).label,
    frente: e.frente.name,
    quarter: trimestre(e.quarter),
    okr: e.okr?.objective ?? "",
    inicio: diaPtBr(e.startDate),
    fim: diaPtBr(e.endDate),
    lancamento: diaPtBr(e.launchDate),
    analise: diaPtBr(e.analysisDate),
    resultado: e.resultado ? (ROTULO_DO_RESULTADO[e.resultado] ?? e.resultado) : "",
    link: e.docLink ?? "",
    responsaveis: juntarNomes(e.members.map((m) => m.name)),
    ice: `${Math.round(e.iceScore * 10) / 10} (${ROTULO_DA_ACAO_ICE[e.iceAction] ?? e.iceAction})`,
  };
}

/** A foto de ANTES da edição; nunca lança (sem foto, a edição segue sem histórico). */
export async function fotoAntes(kind: EntidadeDoHistorico, id: string): Promise<Snapshot | null> {
  try {
    return await snapshotDoItem(kind, id);
  } catch (error) {
    console.error("histórico (foto antes):", error);
    return null;
  }
}

/** Compara com a foto de depois e grava uma linha por campo alterado. */
export async function registrarMudancas(
  kind: EntidadeDoHistorico,
  id: string,
  atorId: string,
  antes: Snapshot | null
): Promise<Mudanca[]> {
  if (!antes) return [];
  try {
    const depois = await snapshotDoItem(kind, id);
    if (!depois) return [];
    const mudancas = diffDeSnapshots(antes, depois);
    if (mudancas.length > 0) await gravar(kind, id, atorId, mudancas);
    return mudancas;
  } catch (error) {
    console.error("histórico (registrar):", error);
    return [];
  }
}

/** Um evento avulso: criação, exclusão, conversão, checkpoint. */
export async function registrarEvento(
  kind: EntidadeDoHistorico,
  id: string,
  atorId: string,
  mudanca: Mudanca
): Promise<void> {
  try {
    await gravar(kind, id, atorId, [mudanca]);
  } catch (error) {
    console.error("histórico (evento):", error);
  }
}

async function gravar(kind: EntidadeDoHistorico, id: string, atorId: string, mudancas: Mudanca[]) {
  // Um INSERT só: as linhas de uma mesma edição ficam com o mesmo `createdAt`
  // (o default do banco é o instante da transação), e é isso que a tela usa
  // para agrupá-las.
  await prisma.historicoItem.createMany({
    data: mudancas.map((m) => ({
      entidade: ENTIDADE[kind],
      entidadeId: id,
      atorId,
      campo: m.campo,
      de: m.de,
      para: m.para,
      detalhe: m.detalhe ?? null,
    })),
  });
}

/**
 * Edição de checkpoint: grava o que interessa saber depois — quem remarcou o
 * prazo e quem renomeou. Recebe o checkpoint de antes e o de depois e se
 * defende de dado incompleto: roda DEPOIS da gravação, e um erro aqui não pode
 * fazer uma edição salva parecer falha.
 */
export async function registrarEdicaoDeCheckpoint(
  kind: EntidadeDoHistorico,
  itemId: string,
  atorId: string,
  antes: { name: string; dueDate: Date },
  depois: { name: string; dueDate: Date }
): Promise<void> {
  try {
    const mudancas: Mudanca[] = [];
    if (antes.dueDate.getTime() !== depois.dueDate.getTime()) {
      mudancas.push({
        campo: "checkpoint",
        de: null,
        detalhe: depois.name,
        para: `prazo ${diaPtBr(antes.dueDate)} → ${diaPtBr(depois.dueDate)}`,
      });
    }
    if (antes.name !== depois.name) {
      mudancas.push({ campo: "checkpoint", de: null, detalhe: depois.name, para: `renomeado (era "${antes.name}")` });
    }
    if (mudancas.length > 0) await gravar(kind, itemId, atorId, mudancas);
  } catch (error) {
    console.error("histórico (checkpoint):", error);
  }
}

// ─── Checkpoints: foto antes / depois ─────────────────────────────────────────

const ordenar = (nomes: string[]) => [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));

const CAMPOS_DA_FOTO = {
  id: true,
  name: true,
  dueDate: true,
  categoria: true,
  members: { select: { name: true } },
  tags: { select: { name: true } },
  requisitos: { select: { name: true } },
  marcos: { select: { name: true } },
} as const;

type LinhaDaFoto = {
  id: string;
  name: string;
  dueDate: Date;
  categoria: string | null;
  members: { name: string }[];
  tags: { name: string }[];
  requisitos: { name: string }[];
  marcos: { name: string }[];
};

function paraFoto(c: LinhaDaFoto): FotoDoCheckpoint {
  return {
    nome: c.name,
    prazo: diaPtBr(c.dueDate),
    categoria: c.categoria ? (ROTULO_DA_CATEGORIA[c.categoria] ?? c.categoria) : "",
    responsaveis: ordenar(c.members.map((m) => m.name)),
    tags: ordenar(c.tags.map((t) => t.name)),
    requisitos: ordenar(c.requisitos.map((r) => r.name)),
    marcos: ordenar(c.marcos.map((r) => r.name)),
  };
}

async function lerFotos(kind: EntidadeDoHistorico, ids: string[]): Promise<Map<string, FotoDoCheckpoint>> {
  const linhas: LinhaDaFoto[] =
    kind === "iniciativa"
      ? await prisma.initiativeCheckpoint.findMany({ where: { id: { in: ids } }, select: CAMPOS_DA_FOTO })
      : await prisma.experimentoCheckpoint.findMany({ where: { id: { in: ids } }, select: CAMPOS_DA_FOTO });
  return new Map(linhas.map((c) => [c.id, paraFoto(c)]));
}

/**
 * Fotos dos checkpoints ANTES da edição (nome, prazo, categoria, responsáveis,
 * tags, necessários e marcos). Nunca lança: sem foto, a edição segue sem
 * histórico.
 */
export async function fotosDosCheckpoints(
  kind: EntidadeDoHistorico,
  ids: string[]
): Promise<Map<string, FotoDoCheckpoint>> {
  if (ids.length === 0) return new Map();
  try {
    return await lerFotos(kind, ids);
  } catch (error) {
    console.error("histórico (fotos de checkpoint):", error);
    return new Map();
  }
}

/**
 * Compara com as fotos de depois e grava, num INSERT só, uma linha por aspecto
 * que mudou em cada checkpoint. Checkpoint que sumiu (excluído) é ignorado —
 * exclusão tem evento próprio.
 */
export async function registrarMudancasDosCheckpoints(
  kind: EntidadeDoHistorico,
  itemId: string,
  atorId: string,
  antes: Map<string, FotoDoCheckpoint>
): Promise<void> {
  if (antes.size === 0) return;
  try {
    const depois = await lerFotos(kind, [...antes.keys()]);
    const mudancas: Mudanca[] = [];
    for (const [id, a] of antes) {
      const d = depois.get(id);
      if (d) mudancas.push(...diffDeCheckpoint(a, d));
    }
    if (mudancas.length > 0) await gravar(kind, itemId, atorId, mudancas);
  } catch (error) {
    console.error("histórico (checkpoints):", error);
  }
}

/** Vários eventos de uma vez (um INSERT: aparecem como uma edição só). */
export async function registrarEventos(
  kind: EntidadeDoHistorico,
  id: string,
  atorId: string,
  mudancas: Mudanca[]
): Promise<void> {
  if (mudancas.length === 0) return;
  try {
    await gravar(kind, id, atorId, mudancas);
  } catch (error) {
    console.error("histórico (eventos):", error);
  }
}

/**
 * Checkpoints mudaram de lugar na árvore: uma linha por checkpoint movido
 * ("movido para dentro de "Pai"" / "movido para o nível principal").
 */
export async function registrarMovimentoDeCheckpoints(
  kind: EntidadeDoHistorico,
  itemId: string,
  atorId: string,
  ids: string[],
  parentId: string | null
): Promise<void> {
  if (ids.length === 0) return;
  try {
    const buscar = (onde: string[]) =>
      kind === "iniciativa"
        ? prisma.initiativeCheckpoint.findMany({ where: { id: { in: onde } }, select: { id: true, name: true } })
        : prisma.experimentoCheckpoint.findMany({ where: { id: { in: onde } }, select: { id: true, name: true } });
    const nomes = new Map((await buscar(parentId ? [...ids, parentId] : ids)).map((c) => [c.id, c.name]));
    const destino = parentId ? `movido para dentro de "${nomes.get(parentId) ?? "—"}"` : "movido para o nível principal";
    await gravar(
      kind,
      itemId,
      atorId,
      ids.filter((id) => nomes.has(id)).map((id) => ({ campo: "checkpoint", de: null, para: destino, detalhe: nomes.get(id)! }))
    );
  } catch (error) {
    console.error("histórico (mover checkpoint):", error);
  }
}
