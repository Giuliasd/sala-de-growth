import { prisma } from "@/lib/prisma";
import {
  RETENCAO_EM_DIAS,
  agruparAvisos,
  descreverNotificacao,
  destinatariosDoComentario,
  destinoDaNotificacao,
  diffDeResponsaveis,
  ehGrupoDeItens,
  extrairMencoes,
  pessoaAceitaAviso,
  trechoDoComentario,
  type AlvoDaNotificacao,
  type AvisoCandidato,
  type TipoDaNotificacao,
} from "@/lib/notificacoes";

/**
 * Notificações — o acesso ao banco. As regras estão em `lib/notificacoes.ts`.
 *
 * Padrão de uso numa action, DEPOIS do gate de permissão:
 *
 *   const antes = await responsaveisAtuais("iniciativa", id);
 *   ...grava...
 *   await notificarResponsaveis({ fonte: "iniciativa", id, autorId: ator.id, antes, depois: v.memberIds });
 *
 * Aviso é memória do que aconteceu, não portão: falha aqui só loga e NUNCA
 * desfaz nem impede a edição (mesmo contrato do histórico).
 *
 * Nada aqui é server action: não é para ser chamado do cliente.
 */

/** De onde vêm os responsáveis. */
export type FonteDeResponsaveis =
  | "iniciativa"
  | "experimento"
  | "okr"
  | "checkpoint-iniciativa"
  | "checkpoint-experimento";

type Contexto = {
  alvo: AlvoDaNotificacao;
  alvoId: string;
  alvoNome: string;
  subitem: string | null;
};

type Entrada = Contexto & {
  destinatarioId: string;
  autorId: string;
  tipo: TipoDaNotificacao;
  trecho?: string | null;
  /** Quantos itens o aviso reúne; ausente = 1. */
  quantidade?: number;
};

const idsDe = (ms: { id: string }[]) => ms.map((m) => m.id);

/** Responsáveis de agora. `null` se a leitura falhar (a edição segue sem aviso). */
export async function responsaveisAtuais(
  fonte: FonteDeResponsaveis,
  id: string
): Promise<string[] | null> {
  try {
    const sel = { members: { select: { id: true } } } as const;
    switch (fonte) {
      case "iniciativa":
        return idsDe((await prisma.iniciativa.findUnique({ where: { id }, select: sel }))?.members ?? []);
      case "experimento":
        return idsDe((await prisma.experimento.findUnique({ where: { id }, select: sel }))?.members ?? []);
      case "okr":
        return idsDe((await prisma.oKR.findUnique({ where: { id }, select: sel }))?.members ?? []);
      case "checkpoint-iniciativa":
        return idsDe((await prisma.initiativeCheckpoint.findUnique({ where: { id }, select: sel }))?.members ?? []);
      case "checkpoint-experimento":
        return idsDe((await prisma.experimentoCheckpoint.findUnique({ where: { id }, select: sel }))?.members ?? []);
    }
  } catch (error) {
    console.error("notificações (responsáveis antes):", error);
    return null;
  }
}

/** Para onde o aviso leva e como o item se chama agora. null se não existe. */
async function contextoDe(fonte: FonteDeResponsaveis, id: string): Promise<Contexto | null> {
  switch (fonte) {
    case "iniciativa": {
      const i = await prisma.iniciativa.findUnique({ where: { id }, select: { name: true } });
      return i && { alvo: "INICIATIVA", alvoId: id, alvoNome: i.name, subitem: null };
    }
    case "experimento": {
      const e = await prisma.experimento.findUnique({ where: { id }, select: { name: true } });
      return e && { alvo: "EXPERIMENTO", alvoId: id, alvoNome: e.name, subitem: null };
    }
    case "okr": {
      const k = await prisma.oKR.findUnique({ where: { id }, select: { objective: true } });
      return k && { alvo: "OKR", alvoId: id, alvoNome: k.objective, subitem: null };
    }
    case "checkpoint-iniciativa": {
      const c = await prisma.initiativeCheckpoint.findUnique({
        where: { id },
        select: { name: true, initiative: { select: { id: true, name: true } } },
      });
      return c && { alvo: "INICIATIVA", alvoId: c.initiative.id, alvoNome: c.initiative.name, subitem: c.name };
    }
    case "checkpoint-experimento": {
      const c = await prisma.experimentoCheckpoint.findUnique({
        where: { id },
        select: { name: true, experimento: { select: { id: true, name: true } } },
      });
      return c && { alvo: "EXPERIMENTO", alvoId: c.experimento.id, alvoNome: c.experimento.name, subitem: c.name };
    }
  }
}

/** Grava os avisos, só para quem está ativo (conta desativada não recebe). */
async function gravar(entradas: Entrada[]): Promise<void> {
  if (entradas.length === 0) return;
  const ativos = await prisma.teamMember.findMany({
    where: { id: { in: [...new Set(entradas.map((e) => e.destinatarioId))] }, isActive: true },
    select: { id: true, notificacoesSilenciadas: true },
  });
  // Conta desativada não recebe; o que a pessoa desligou no Perfil nem é criado.
  const silenciadas = new Map(ativos.map((a) => [a.id, a.notificacoesSilenciadas ?? []]));
  const validas = entradas.filter((e) => {
    const s = silenciadas.get(e.destinatarioId);
    return s !== undefined && pessoaAceitaAviso(s, e.tipo);
  });
  if (validas.length === 0) return;
  await prisma.notificacao.createMany({
    data: validas.map((e) => ({
      destinatarioId: e.destinatarioId,
      autorId: e.autorId,
      tipo: e.tipo,
      alvo: e.alvo,
      alvoId: e.alvoId,
      alvoNome: e.alvoNome,
      subitem: e.subitem,
      trecho: e.trecho ?? null,
      quantidade: e.quantidade ?? 1,
    })),
  });
}

/**
 * Avisa quem entrou e quem saiu da lista de responsáveis.
 *
 * `antes` vem de `responsaveisAtuais` (tirado ANTES de gravar). Sem ele (a
 * leitura falhou) não há como saber quem é novo, e o aviso é omitido — melhor
 * calar do que avisar quem já era responsável.
 */
export async function notificarResponsaveis(args: {
  fonte: FonteDeResponsaveis;
  id: string;
  autorId: string;
  antes: readonly string[] | null;
  depois: readonly string[];
}): Promise<void> {
  if (!args.antes) return;
  try {
    const { adicionados, removidos } = diffDeResponsaveis(args.antes, args.depois, args.autorId);
    if (adicionados.length === 0 && removidos.length === 0) return;
    const ctx = await contextoDe(args.fonte, args.id);
    if (!ctx) return;
    await gravar([
      ...adicionados.map((d) => ({ ...ctx, destinatarioId: d, autorId: args.autorId, tipo: "RESPONSAVEL_ADICIONADO" as const })),
      ...removidos.map((d) => ({ ...ctx, destinatarioId: d, autorId: args.autorId, tipo: "RESPONSAVEL_REMOVIDO" as const })),
    ]);
  } catch (error) {
    console.error("notificações (responsáveis):", error);
  }
}

/**
 * Edição EM MASSA de responsáveis: uma pessoa, um aviso. Se a edição põe Ana em
 * 5 iniciativas, Ana recebe "adicionou você em 5 iniciativas" e não cinco avisos.
 *
 * `itens` traz, para cada item, os responsáveis de ANTES (lidos antes de gravar);
 * `depois` é a lista final aplicada a todos. Item cuja leitura de antes falhou
 * (`antes: null`) fica de fora, pela mesma razão de `notificarResponsaveis`.
 */
export async function notificarResponsaveisEmLote(args: {
  fonte: FonteDeResponsaveis;
  autorId: string;
  itens: readonly { id: string; antes: readonly string[] | null }[];
  depois: readonly string[];
}): Promise<void> {
  try {
    const mudou = args.itens.flatMap((it) => {
      if (!it.antes) return [];
      const d = diffDeResponsaveis(it.antes, args.depois, args.autorId);
      return d.adicionados.length + d.removidos.length > 0 ? [{ id: it.id, ...d }] : [];
    });
    if (mudou.length === 0) return;

    const contextos = new Map(
      (await Promise.all(mudou.map(async (m) => [m.id, await contextoDe(args.fonte, m.id)] as const)))
        .filter((par): par is readonly [string, Contexto] => par[1] !== null)
    );
    const candidatos: AvisoCandidato[] = mudou.flatMap((m) => {
      const ctx = contextos.get(m.id);
      if (!ctx) return [];
      return [
        ...m.adicionados.map((d) => ({ ...ctx, destinatarioId: d, tipo: "RESPONSAVEL_ADICIONADO" as const })),
        ...m.removidos.map((d) => ({ ...ctx, destinatarioId: d, tipo: "RESPONSAVEL_REMOVIDO" as const })),
      ];
    });
    await gravar(agruparAvisos(candidatos).map((a) => ({ ...a, autorId: args.autorId })));
  } catch (error) {
    console.error("notificações (responsáveis em lote):", error);
  }
}

/**
 * Iniciativa virou experimento (ou o contrário): quem é responsável pelo item
 * novo — ou por algum checkpoint copiado para ele — é avisado. O alvo do aviso é
 * o item NOVO (é nele que a pessoa vai trabalhar daqui em diante).
 */
export async function notificarConversao(args: {
  para: "iniciativa" | "experimento";
  novoId: string;
  autorId: string;
}): Promise<void> {
  try {
    const sel = {
      name: true,
      members: { select: { id: true } },
      checkpoints: { select: { members: { select: { id: true } } } },
    } as const;
    const novo =
      args.para === "experimento"
        ? await prisma.experimento.findUnique({ where: { id: args.novoId }, select: sel })
        : await prisma.iniciativa.findUnique({ where: { id: args.novoId }, select: sel });
    if (!novo) return;
    const destinatarios = new Set<string>([
      ...novo.members.map((m) => m.id),
      ...novo.checkpoints.flatMap((c) => c.members.map((m) => m.id)),
    ]);
    destinatarios.delete(args.autorId);
    await gravar(
      [...destinatarios].map((destinatarioId) => ({
        destinatarioId,
        autorId: args.autorId,
        tipo: "ITEM_CONVERTIDO" as const,
        alvo: args.para === "experimento" ? ("EXPERIMENTO" as const) : ("INICIATIVA" as const),
        alvoId: args.novoId,
        alvoNome: novo.name,
        subitem: null,
      }))
    );
  } catch (error) {
    console.error("notificações (conversão):", error);
  }
}

/**
 * Checkpoints duplicados: cada responsável pelas CÓPIAS é avisado uma vez, com a
 * contagem ("duplicou 3 checkpoints…"), não um aviso por cópia.
 */
export async function notificarDuplicacaoDeCheckpoints(args: {
  kind: "iniciativa" | "experimento";
  itemId: string;
  autorId: string;
  copias: readonly { nome: string; responsaveisIds: readonly string[] }[];
}): Promise<void> {
  try {
    if (!args.copias.some((c) => c.responsaveisIds.some((id) => id !== args.autorId))) return;
    const ctx = await contextoDe(args.kind, args.itemId);
    if (!ctx) return;
    const candidatos: AvisoCandidato[] = args.copias.flatMap((c) =>
      [...new Set(c.responsaveisIds)]
        .filter((id) => id !== args.autorId)
        .map((destinatarioId) => ({ ...ctx, destinatarioId, tipo: "ITEM_DUPLICADO" as const, subitem: c.nome }))
    );
    await gravar(agruparAvisos(candidatos).map((a) => ({ ...a, autorId: args.autorId })));
  } catch (error) {
    console.error("notificações (duplicação):", error);
  }
}

/** Ação da semana criada por outra pessoa (a liderança) para alguém. */
export async function notificarAcaoAtribuida(args: {
  acaoId: string;
  titulo: string;
  responsavelId: string;
  autorId: string;
}): Promise<void> {
  if (args.responsavelId === args.autorId) return;
  try {
    await gravar([
      {
        destinatarioId: args.responsavelId,
        autorId: args.autorId,
        tipo: "RESPONSAVEL_ADICIONADO",
        alvo: "ACAO_SEMANA",
        alvoId: args.acaoId,
        alvoNome: args.titulo,
        subitem: null,
      },
    ]);
  } catch (error) {
    console.error("notificações (ação):", error);
  }
}

async function equipeAtiva() {
  return prisma.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true } });
}

/**
 * Comentário novo: avisa os mencionados (@) e os responsáveis do item.
 * Quem é as duas coisas recebe só o aviso de menção.
 */
export async function notificarComentario(args: {
  fonte: "iniciativa" | "experimento";
  itemId: string;
  autorId: string;
  conteudo: string;
}): Promise<void> {
  try {
    const [ctx, responsaveis, equipe] = await Promise.all([
      contextoDe(args.fonte, args.itemId),
      responsaveisAtuais(args.fonte, args.itemId),
      equipeAtiva(),
    ]);
    if (!ctx) return;
    const { mencao, comentario } = destinatariosDoComentario({
      autorId: args.autorId,
      responsaveisIds: responsaveis ?? [],
      mencionadosIds: extrairMencoes(args.conteudo, equipe),
    });
    const trecho = trechoDoComentario(args.conteudo);
    await gravar([
      ...mencao.map((d) => ({ ...ctx, destinatarioId: d, autorId: args.autorId, tipo: "MENCAO" as const, trecho })),
      ...comentario.map((d) => ({ ...ctx, destinatarioId: d, autorId: args.autorId, tipo: "COMENTARIO" as const, trecho })),
    ]);
  } catch (error) {
    console.error("notificações (comentário):", error);
  }
}

/**
 * Comentário editado: só avisa quem passou a ser mencionado agora. Quem já
 * tinha sido mencionado no texto anterior não é avisado de novo, e editar não
 * dispara o aviso genérico de comentário (a conversa já foi avisada).
 */
export async function notificarEdicaoDeComentario(args: {
  fonte: "iniciativa" | "experimento";
  itemId: string;
  autorId: string;
  antes: string;
  depois: string;
}): Promise<void> {
  try {
    const equipe = await equipeAtiva();
    const jaMencionados = new Set(extrairMencoes(args.antes, equipe));
    const novos = extrairMencoes(args.depois, equipe).filter((id) => id !== args.autorId && !jaMencionados.has(id));
    if (novos.length === 0) return;
    const ctx = await contextoDe(args.fonte, args.itemId);
    if (!ctx) return;
    const trecho = trechoDoComentario(args.depois);
    await gravar(novos.map((d) => ({ ...ctx, destinatarioId: d, autorId: args.autorId, tipo: "MENCAO" as const, trecho })));
  } catch (error) {
    console.error("notificações (edição de comentário):", error);
  }
}

/** Apaga os avisos desta pessoa com mais de RETENCAO_EM_DIAS. Nunca lança. */
export async function limparAvisosAntigos(destinatarioId: string): Promise<void> {
  try {
    const corte = new Date(Date.now() - RETENCAO_EM_DIAS * 24 * 60 * 60 * 1000);
    await prisma.notificacao.deleteMany({ where: { destinatarioId, createdAt: { lt: corte } } });
  } catch (error) {
    console.error("notificações (limpeza):", error);
  }
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export type AvisoDaLista = {
  id: string;
  /** A frase pronta ("Ana adicionou você como responsável na iniciativa …"). */
  texto: string;
  trecho: string | null;
  tipo: TipoDaNotificacao;
  alvo: AlvoDaNotificacao;
  alvoId: string;
  /** Para onde o clique leva. */
  href: string;
  /** Abre o popup de detalhe (iniciativa/experimento únicos); senão navega para `href`. */
  abreModal: boolean;
  quantidade: number;
  lida: boolean;
  /** ISO. */
  quando: string;
};

export const AVISOS_POR_PAGINA = 30;

/** Os avisos da pessoa, do mais recente para o mais antigo. */
export async function listarNotificacoes(
  destinatarioId: string,
  antesDe?: Date
): Promise<{ avisos: AvisoDaLista[]; proximo: string | null }> {
  const linhas = await prisma.notificacao.findMany({
    where: { destinatarioId, ...(antesDe && { createdAt: { lt: antesDe } }) },
    select: {
      id: true, tipo: true, alvo: true, alvoId: true, alvoNome: true, subitem: true,
      trecho: true, quantidade: true, lidaEm: true, createdAt: true,
      autor: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: AVISOS_POR_PAGINA + 1,
  });
  const pagina = linhas.slice(0, AVISOS_POR_PAGINA);
  return {
    proximo: linhas.length > AVISOS_POR_PAGINA ? pagina[pagina.length - 1].createdAt.toISOString() : null,
    avisos: pagina.map((n) => {
      const grupoDeItens = ehGrupoDeItens(n);
      return {
        id: n.id,
        texto: descreverNotificacao({
          tipo: n.tipo, alvo: n.alvo, alvoNome: n.alvoNome, subitem: n.subitem,
          quantidade: n.quantidade, autorNome: n.autor?.name ?? null,
        }),
        // Aviso que reúne checkpoints guarda os nomes em `subitem`: aparecem como detalhe.
        trecho: n.trecho ?? (n.quantidade > 1 ? n.subitem : null),
        tipo: n.tipo,
        alvo: n.alvo,
        alvoId: n.alvoId,
        href: destinoDaNotificacao(n.alvo, n.alvoId, grupoDeItens),
        abreModal: (n.alvo === "INICIATIVA" || n.alvo === "EXPERIMENTO") && !grupoDeItens,
        quantidade: n.quantidade,
        lida: n.lidaEm !== null,
        quando: n.createdAt.toISOString(),
      };
    }),
  };
}

/** Quantos avisos a pessoa ainda não leu (o número do sino). */
export async function contarNaoLidas(destinatarioId: string): Promise<number> {
  return prisma.notificacao.count({ where: { destinatarioId, lidaEm: null } });
}

// ─── Preferências ─────────────────────────────────────────────────────────────

/** Os tipos de aviso que a pessoa desligou. */
export async function lerSilenciadas(memberId: string): Promise<TipoDaNotificacao[]> {
  const m = await prisma.teamMember.findUnique({
    where: { id: memberId },
    select: { notificacoesSilenciadas: true },
  });
  return m?.notificacoesSilenciadas ?? [];
}
