"use server";

import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { BUSCA_MIN_GLOBAL, casaComBusca, normalizarBusca } from "@/lib/busca";
import { trechoDoComentario } from "@/lib/notificacoes";

export type TipoDeResultado =
  | "iniciativa"
  | "experimento"
  | "checkpoint"
  | "kr"
  | "objetivo"
  | "acao"
  | "comentario"
  | "playbook";

export type ResultadoDeBusca = {
  tipo: TipoDeResultado;
  id: string;
  titulo: string;
  /** Linha de contexto: onde o resultado mora (quarter e frente, item, autor…). */
  detalhe: string;
  href: string;
  /** Link de fora do app (playbook): abre em outra aba, não navega. */
  externo?: boolean;
};

type ActionResponse<T> = { success: true; data: T } | { success: false; error: string };

/** Por tipo: a paleta mostra poucos resultados; quem quer mais refina o texto. */
const LIMITE_POR_TIPO = 6;

const hrefDoItem = (kind: "iniciativa" | "experimento", id: string) =>
  kind === "iniciativa" ? `/iniciativas/${id}` : `/experimentos/${id}`;

/**
 * Busca global (Ctrl+K): iniciativas, experimentos, checkpoints, KRs,
 * objetivos, ações, comentários e links do playbook, por texto.
 *
 * Qualquer membro logado pode buscar (o conteúdo é o mesmo que ele já lê nas
 * telas). Itens excluídos — e o que mora dentro deles — não aparecem. Sem texto
 * válido (menos de BUSCA_MIN_GLOBAL caracteres) devolve vazio, sem ir ao banco.
 *
 * Ignora acento e caixa ("relatorio" acha "Relatório"): o banco compara acento,
 * então a comparação é feita aqui sobre os textos (o banco inteiro tem poucos
 * MB) e os mais recentes de cada tipo vão para a paleta.
 */
export async function buscarNoApp(texto: string): Promise<ActionResponse<ResultadoDeBusca[]>> {
  try {
    await getCurrentMember();
    const termo = normalizarBusca(texto, BUSCA_MIN_GLOBAL);
    if (!termo) return { success: true, data: [] };
    const comContexto = { quarter: { select: { quarter: true, year: true } }, frente: { select: { name: true } } } as const;
    const recentes = { updatedAt: "desc" } as const;

    const [
      todasIniciativas,
      todosExperimentos,
      todosKrs,
      todosObjetivos,
      cpsDeIniciativa,
      cpsDeExperimento,
      todasAcoes,
      comentariosDeIniciativa,
      comentariosDeExperimento,
      linksDoPlaybook,
    ] = await withDbRetry(() =>
      Promise.all([
        prisma.iniciativa.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, ...comContexto },
          orderBy: recentes,
        }),
        prisma.experimento.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, objective: true, ...comContexto },
          orderBy: recentes,
        }),
        prisma.oKR.findMany({
          select: { id: true, objective: true, quarterId: true, ...comContexto },
          orderBy: recentes,
        }),
        prisma.objetivo.findMany({
          select: { id: true, title: true, description: true, quarterId: true, quarter: comContexto.quarter },
          orderBy: recentes,
        }),
        prisma.initiativeCheckpoint.findMany({
          where: { initiative: { deletedAt: null } },
          select: { id: true, name: true, description: true, updatedAt: true, initiative: { select: { id: true, name: true } } },
          orderBy: recentes,
        }),
        prisma.experimentoCheckpoint.findMany({
          where: { experimento: { deletedAt: null } },
          select: { id: true, name: true, description: true, updatedAt: true, experimento: { select: { id: true, name: true } } },
          orderBy: recentes,
        }),
        prisma.acao.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            notes: true,
            iniciativaId: true,
            experimentoId: true,
            responsavel: { select: { name: true } },
            frente: { select: { name: true } },
          },
          orderBy: recentes,
        }),
        prisma.initiativeComment.findMany({
          where: { initiative: { deletedAt: null } },
          select: {
            id: true,
            content: true,
            updatedAt: true,
            member: { select: { name: true } },
            initiative: { select: { id: true, name: true } },
          },
          orderBy: recentes,
        }),
        prisma.experimentoComment.findMany({
          where: { experimento: { deletedAt: null } },
          select: {
            id: true,
            content: true,
            updatedAt: true,
            member: { select: { name: true } },
            experimento: { select: { id: true, name: true } },
          },
          orderBy: recentes,
        }),
        prisma.playbookLink.findMany({
          select: { id: true, title: true, subtitle: true, url: true, section: { select: { name: true } } },
          orderBy: recentes,
        }),
      ])
    );

    // Já vêm do mais recente: o filtro preserva a ordem e o corte pega os primeiros.
    const primeiros = <T,>(lista: T[], ...campos: ((x: T) => string | null | undefined)[]) =>
      lista.filter((x) => casaComBusca(termo, ...campos.map((c) => c(x)))).slice(0, LIMITE_POR_TIPO);

    const contexto = (q: { quarter: number; year: number }, frente?: { name: string } | null) =>
      frente ? `Q${q.quarter} ${q.year} · ${frente.name}` : `Q${q.quarter} ${q.year}`;

    // Checkpoints e comentários das duas entidades disputam o mesmo limite:
    // junta, reordena pelo mais recente e corta.
    const checkpoints = [
      ...primeiros(cpsDeIniciativa, (c) => c.name, (c) => c.description).map((c) => ({
        tipo: "checkpoint" as const,
        id: c.id,
        titulo: c.name,
        detalhe: `Checkpoint de ${c.initiative.name}`,
        href: hrefDoItem("iniciativa", c.initiative.id),
        quando: c.updatedAt,
      })),
      ...primeiros(cpsDeExperimento, (c) => c.name, (c) => c.description).map((c) => ({
        tipo: "checkpoint" as const,
        id: c.id,
        titulo: c.name,
        detalhe: `Checkpoint de ${c.experimento.name}`,
        href: hrefDoItem("experimento", c.experimento.id),
        quando: c.updatedAt,
      })),
    ];
    const comentarios = [
      ...primeiros(comentariosDeIniciativa, (c) => c.content).map((c) => ({
        tipo: "comentario" as const,
        id: c.id,
        titulo: trechoDoComentario(c.content),
        detalhe: `${c.member.name} em ${c.initiative.name}`,
        href: hrefDoItem("iniciativa", c.initiative.id),
        quando: c.updatedAt,
      })),
      ...primeiros(comentariosDeExperimento, (c) => c.content).map((c) => ({
        tipo: "comentario" as const,
        id: c.id,
        titulo: trechoDoComentario(c.content),
        detalhe: `${c.member.name} em ${c.experimento.name}`,
        href: hrefDoItem("experimento", c.experimento.id),
        quando: c.updatedAt,
      })),
    ];
    const intercalar = <T extends { quando: Date }>(lista: T[]): Omit<T, "quando">[] =>
      [...lista]
        .sort((a, b) => b.quando.getTime() - a.quando.getTime())
        .slice(0, LIMITE_POR_TIPO)
        .map(({ quando: _quando, ...resto }) => resto);

    const data: ResultadoDeBusca[] = [
      ...primeiros(todasIniciativas, (i) => i.name).map((i) => ({
        tipo: "iniciativa" as const,
        id: i.id,
        titulo: i.name,
        detalhe: contexto(i.quarter, i.frente),
        href: hrefDoItem("iniciativa", i.id),
      })),
      ...primeiros(todosExperimentos, (e) => e.name, (e) => e.objective).map((e) => ({
        tipo: "experimento" as const,
        id: e.id,
        titulo: e.name,
        detalhe: contexto(e.quarter, e.frente),
        href: hrefDoItem("experimento", e.id),
      })),
      ...intercalar(checkpoints),
      ...primeiros(todosKrs, (k) => k.objective).map((k) => ({
        tipo: "kr" as const,
        id: k.id,
        titulo: k.objective,
        detalhe: contexto(k.quarter, k.frente),
        // KR não tem página própria: abre o quarter dele em /okrs.
        href: `/okrs?quarter=${k.quarterId}`,
      })),
      ...primeiros(todosObjetivos, (o) => o.title, (o) => o.description).map((o) => ({
        tipo: "objetivo" as const,
        id: o.id,
        titulo: o.title,
        detalhe: contexto(o.quarter),
        href: `/okrs?quarter=${o.quarterId}`,
      })),
      ...primeiros(todasAcoes, (a) => a.title, (a) => a.notes).map((a) => ({
        tipo: "acao" as const,
        id: a.id,
        titulo: a.title,
        detalhe: a.frente ? `${a.responsavel.name} · ${a.frente.name}` : a.responsavel.name,
        // Ação de um item abre o item; a solta, a Weekly (onde ela mora).
        href: a.iniciativaId
          ? hrefDoItem("iniciativa", a.iniciativaId)
          : a.experimentoId
            ? hrefDoItem("experimento", a.experimentoId)
            : "/rituais",
      })),
      ...intercalar(comentarios),
      ...primeiros(linksDoPlaybook, (l) => l.title, (l) => l.subtitle, (l) => l.section?.name).map((l) => ({
        tipo: "playbook" as const,
        id: l.id,
        titulo: l.title,
        detalhe: l.section ? `${l.section.name} · ${l.subtitle}` : l.subtitle,
        href: l.url,
        externo: true,
      })),
    ];

    return { success: true, data };
  } catch (error) {
    console.error("buscarNoApp error:", error);
    // Sessão inválida/banco fora: a paleta mostra erro, não "nenhum resultado".
    return { success: false, error: "Não foi possível buscar agora. Tente novamente." };
  }
}
