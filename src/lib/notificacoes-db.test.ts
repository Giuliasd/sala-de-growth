import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const iniciativaFindUnique = vi.fn();
const experimentoFindUnique = vi.fn();
const okrFindUnique = vi.fn();
const icFindUnique = vi.fn();
const ecFindUnique = vi.fn();
const teamFindMany = vi.fn();
const createMany = vi.fn();
const findMany = vi.fn();
const count = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findUnique: iniciativaFindUnique },
    experimento: { findUnique: experimentoFindUnique },
    oKR: { findUnique: okrFindUnique },
    initiativeCheckpoint: { findUnique: icFindUnique },
    experimentoCheckpoint: { findUnique: ecFindUnique },
    teamMember: { findMany: teamFindMany },
    notificacao: { createMany, findMany, count, deleteMany },
  },
}));

const equipe = [
  { id: "ana", name: "Ana" },
  { id: "bia", name: "Bia Souza" },
  { id: "caio", name: "Caio" },
  { id: "autor", name: "Autora" },
];

/** teamMember.findMany serve a duas perguntas: "quem está ativo" (por ids) e "a equipe" (menção). */
function ativos(...ids: string[]) {
  teamFindMany.mockImplementation(async (args: { where: { id?: { in: string[] }; isActive: boolean } }) => {
    if (args.where.id) return args.where.id.in.filter((id) => ids.includes(id)).map((id) => ({ id }));
    return equipe.filter((m) => ids.includes(m.id));
  });
}

beforeEach(() => {
  ativos("ana", "bia", "caio", "autor");
  iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [{ id: "ana" }] });
});

afterEach(() => {
  vi.clearAllMocks();
});

const dadosGravados = () => createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;

describe("notificarResponsaveis", () => {
  it("avisa quem entrou e quem saiu, nunca o autor, com o item como alvo", async () => {
    const { notificarResponsaveis } = await import("./notificacoes-db");

    await notificarResponsaveis({
      fonte: "iniciativa", id: "i1", autorId: "autor",
      antes: ["ana", "autor"], depois: ["bia", "autor"],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(dadosGravados()).toEqual([
      expect.objectContaining({
        destinatarioId: "bia", autorId: "autor", tipo: "RESPONSAVEL_ADICIONADO",
        alvo: "INICIATIVA", alvoId: "i1", alvoNome: "Régua", subitem: null,
      }),
      expect.objectContaining({ destinatarioId: "ana", tipo: "RESPONSAVEL_REMOVIDO", alvo: "INICIATIVA" }),
    ]);
  });

  it("checkpoint: o aviso aponta para o item e cita o checkpoint", async () => {
    icFindUnique.mockResolvedValue({ name: "Briefing", initiative: { id: "i9", name: "Régua" } });
    const { notificarResponsaveis } = await import("./notificacoes-db");

    await notificarResponsaveis({ fonte: "checkpoint-iniciativa", id: "c1", autorId: "autor", antes: [], depois: ["bia"] });

    expect(dadosGravados()[0]).toMatchObject({
      destinatarioId: "bia", alvo: "INICIATIVA", alvoId: "i9", alvoNome: "Régua", subitem: "Briefing",
    });
  });

  it("checkpoint de experimento e KR apontam para o alvo certo", async () => {
    ecFindUnique.mockResolvedValue({ name: "Setup", experimento: { id: "e1", name: "Teste A/B" } });
    okrFindUnique.mockResolvedValue({ objective: "Crescer 10%" });
    const { notificarResponsaveis } = await import("./notificacoes-db");

    await notificarResponsaveis({ fonte: "checkpoint-experimento", id: "c1", autorId: "autor", antes: [], depois: ["ana"] });
    await notificarResponsaveis({ fonte: "okr", id: "k1", autorId: "autor", antes: [], depois: ["ana"] });

    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ alvo: "EXPERIMENTO", alvoId: "e1", subitem: "Setup" });
    expect(createMany.mock.calls[1][0].data[0]).toMatchObject({ alvo: "OKR", alvoId: "k1", alvoNome: "Crescer 10%" });
  });

  it("sem a lista de antes (a leitura falhou), não avisa ninguém — melhor calar que avisar quem já era responsável", async () => {
    const { notificarResponsaveis } = await import("./notificacoes-db");
    await notificarResponsaveis({ fonte: "iniciativa", id: "i1", autorId: "autor", antes: null, depois: ["ana"] });
    expect(createMany).not.toHaveBeenCalled();
    expect(iniciativaFindUnique).not.toHaveBeenCalled();
  });

  it("nada mudou: nem consulta o item", async () => {
    const { notificarResponsaveis } = await import("./notificacoes-db");
    await notificarResponsaveis({ fonte: "iniciativa", id: "i1", autorId: "autor", antes: ["ana"], depois: ["ana"] });
    expect(createMany).not.toHaveBeenCalled();
    expect(iniciativaFindUnique).not.toHaveBeenCalled();
  });

  it("conta desativada não recebe aviso", async () => {
    ativos("ana", "autor"); // bia saiu do time
    const { notificarResponsaveis } = await import("./notificacoes-db");

    await notificarResponsaveis({ fonte: "iniciativa", id: "i1", autorId: "autor", antes: [], depois: ["ana", "bia"] });

    expect(dadosGravados().map((d) => d.destinatarioId)).toEqual(["ana"]);
  });

  it("falha do banco NUNCA propaga — aviso é memória, não portão", async () => {
    createMany.mockRejectedValueOnce(new Error("Connection terminated"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { notificarResponsaveis, responsaveisAtuais } = await import("./notificacoes-db");

    await expect(
      notificarResponsaveis({ fonte: "iniciativa", id: "i1", autorId: "autor", antes: [], depois: ["ana"] })
    ).resolves.toBeUndefined();

    iniciativaFindUnique.mockRejectedValueOnce(new Error("timeout"));
    await expect(responsaveisAtuais("iniciativa", "i1")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("responsaveisAtuais", () => {
  it("devolve os ids dos responsáveis; item inexistente vira lista vazia", async () => {
    const { responsaveisAtuais } = await import("./notificacoes-db");
    iniciativaFindUnique.mockResolvedValueOnce({ members: [{ id: "a" }, { id: "b" }] });
    expect(await responsaveisAtuais("iniciativa", "i1")).toEqual(["a", "b"]);
    iniciativaFindUnique.mockResolvedValueOnce(null);
    expect(await responsaveisAtuais("iniciativa", "nao-existe")).toEqual([]);
  });
});

describe("notificarComentario", () => {
  it("responsável não mencionado recebe 'comentário'; mencionado recebe 'menção'; autor não recebe nada", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [{ id: "ana" }, { id: "bia" }, { id: "autor" }] });
    const { notificarComentario } = await import("./notificacoes-db");

    await notificarComentario({
      fonte: "iniciativa", itemId: "i1", autorId: "autor",
      conteudo: "@Bia Souza e @Caio, olhem isto. @Autora também",
    });

    const porDestino = Object.fromEntries(dadosGravados().map((d) => [d.destinatarioId, d.tipo]));
    expect(porDestino).toEqual({ bia: "MENCAO", caio: "MENCAO", ana: "COMENTARIO" });
    expect(dadosGravados().every((d) => d.trecho === "@Bia Souza e @Caio, olhem isto. @Autora também")).toBe(true);
    expect(dadosGravados().every((d) => d.alvo === "INICIATIVA" && d.alvoId === "i1")).toBe(true);
  });

  it("comentário sem menção avisa só os responsáveis (menos o autor)", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [{ id: "ana" }, { id: "autor" }] });
    const { notificarComentario } = await import("./notificacoes-db");

    await notificarComentario({ fonte: "iniciativa", itemId: "i1", autorId: "autor", conteudo: "ficou ótimo" });

    expect(dadosGravados()).toEqual([expect.objectContaining({ destinatarioId: "ana", tipo: "COMENTARIO" })]);
  });

  it("comentário de um responsável num item só dele não avisa ninguém", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [{ id: "autor" }] });
    const { notificarComentario } = await import("./notificacoes-db");
    await notificarComentario({ fonte: "iniciativa", itemId: "i1", autorId: "autor", conteudo: "nota para mim" });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("experimento usa o experimento como alvo", async () => {
    experimentoFindUnique.mockResolvedValue({ name: "Teste A/B", members: [{ id: "ana" }] });
    const { notificarComentario } = await import("./notificacoes-db");
    await notificarComentario({ fonte: "experimento", itemId: "e1", autorId: "autor", conteudo: "oi" });
    expect(dadosGravados()[0]).toMatchObject({ alvo: "EXPERIMENTO", alvoId: "e1", alvoNome: "Teste A/B" });
  });
});

describe("notificarEdicaoDeComentario", () => {
  it("avisa só quem passou a ser mencionado agora", async () => {
    const { notificarEdicaoDeComentario } = await import("./notificacoes-db");

    await notificarEdicaoDeComentario({
      fonte: "iniciativa", itemId: "i1", autorId: "autor",
      antes: "@Ana veja", depois: "@Ana e @Caio vejam",
    });

    expect(dadosGravados().map((d) => [d.destinatarioId, d.tipo])).toEqual([["caio", "MENCAO"]]);
  });

  it("editar sem mencionar ninguém de novo não avisa nada", async () => {
    const { notificarEdicaoDeComentario } = await import("./notificacoes-db");
    await notificarEdicaoDeComentario({
      fonte: "iniciativa", itemId: "i1", autorId: "autor", antes: "@Ana veja", depois: "@Ana veja, corrigido",
    });
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("notificarAcaoAtribuida", () => {
  it("ação criada por outra pessoa avisa o responsável, apontando para a Weekly", async () => {
    const { notificarAcaoAtribuida } = await import("./notificacoes-db");
    await notificarAcaoAtribuida({ acaoId: "a1", titulo: "1:1 com time", responsavelId: "ana", autorId: "autor" });
    expect(dadosGravados()[0]).toMatchObject({
      destinatarioId: "ana", tipo: "RESPONSAVEL_ADICIONADO", alvo: "ACAO_SEMANA", alvoId: "a1", alvoNome: "1:1 com time",
    });
  });

  it("ação criada para si mesma não avisa", async () => {
    const { notificarAcaoAtribuida } = await import("./notificacoes-db");
    await notificarAcaoAtribuida({ acaoId: "a1", titulo: "x", responsavelId: "autor", autorId: "autor" });
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("listarNotificacoes / contarNaoLidas / limparAvisosAntigos", () => {
  const linha = (i: number, extra = {}) => ({
    id: `n${i}`, tipo: "COMENTARIO", alvo: "INICIATIVA", alvoId: "i1", alvoNome: "Régua", subitem: null,
    trecho: "oi", lidaEm: null, createdAt: new Date(Date.UTC(2026, 10, 10, 12, 0, 60 - i)),
    autor: { name: "Ana" }, ...extra,
  });

  it("monta a frase, o destino e o estado de leitura; só consulta as da pessoa", async () => {
    findMany.mockResolvedValue([linha(1), linha(2, { lidaEm: new Date(), autor: null })]);
    const { listarNotificacoes } = await import("./notificacoes-db");

    const r = await listarNotificacoes("ana");

    expect(findMany.mock.calls[0][0].where).toEqual({ destinatarioId: "ana" });
    expect(r.proximo).toBeNull();
    expect(r.avisos[0]).toMatchObject({
      texto: "Ana comentou na iniciativa “Régua”", href: "/iniciativas/i1", lida: false, trecho: "oi",
    });
    expect(r.avisos[1]).toMatchObject({ lida: true });
    expect(r.avisos[1].texto).toMatch(/^Alguém que saiu do time/);
  });

  it("página cheia devolve o cursor da última e descarta a sobra", async () => {
    findMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => linha(i)));
    const { listarNotificacoes, AVISOS_POR_PAGINA } = await import("./notificacoes-db");

    const r = await listarNotificacoes("ana", new Date("2026-11-11T00:00:00Z"));

    expect(r.avisos).toHaveLength(AVISOS_POR_PAGINA);
    expect(r.proximo).toBe(r.avisos[AVISOS_POR_PAGINA - 1].quando);
    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ lt: new Date("2026-11-11T00:00:00Z") });
  });

  it("conta só as não lidas da própria pessoa", async () => {
    count.mockResolvedValue(4);
    const { contarNaoLidas } = await import("./notificacoes-db");
    expect(await contarNaoLidas("ana")).toBe(4);
    expect(count).toHaveBeenCalledWith({ where: { destinatarioId: "ana", lidaEm: null } });
  });

  it("limpeza apaga as da pessoa com mais de 90 dias e nunca lança", async () => {
    const { limparAvisosAntigos } = await import("./notificacoes-db");
    const antes = Date.now();
    await limparAvisosAntigos("ana");

    const where = deleteMany.mock.calls[0][0].where;
    expect(where.destinatarioId).toBe("ana");
    const idadeEmDias = (antes - where.createdAt.lt.getTime()) / 86_400_000;
    expect(Math.round(idadeEmDias)).toBe(90);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteMany.mockRejectedValueOnce(new Error("boom"));
    await expect(limparAvisosAntigos("ana")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
