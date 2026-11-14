import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Notificações: edição em massa (um aviso por pessoa), preferências (o que foi
 * desligado nem é criado), conversão e duplicação. A base — responsáveis,
 * comentário — está em notificacoes-db.test.ts.
 */
const iniciativaFindUnique = vi.fn();
const experimentoFindUnique = vi.fn();
const icFindUnique = vi.fn();
const teamFindMany = vi.fn();
const teamFindUnique = vi.fn();
const createMany = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findUnique: iniciativaFindUnique },
    experimento: { findUnique: experimentoFindUnique },
    initiativeCheckpoint: { findUnique: icFindUnique },
    teamMember: { findMany: teamFindMany, findUnique: teamFindUnique },
    notificacao: { createMany, findMany },
  },
}));

type Pessoa = { id: string; name?: string; notificacoesSilenciadas?: string[] };
const equipe: Pessoa[] = [
  { id: "ana", name: "Ana" },
  { id: "bia", name: "Bia" },
  { id: "autor", name: "Autora" },
];

/** teamMember.findMany serve a duas perguntas: "quem está ativo" (por ids) e "a equipe" (menção). */
function equipeAtiva(pessoas: Pessoa[] = equipe) {
  teamFindMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) =>
    args.where.id ? pessoas.filter((p) => args.where.id!.in.includes(p.id)) : pessoas
  );
}

beforeEach(() => equipeAtiva());
afterEach(() => vi.clearAllMocks());

const gravado = () => createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;

describe("notificarResponsaveisEmLote", () => {
  it("quem entra em 5 itens recebe UM aviso, com a contagem e os nomes", async () => {
    iniciativaFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      name: `Item ${where.id}`,
      members: [],
    }));
    const { notificarResponsaveisEmLote } = await import("./notificacoes-db");

    await notificarResponsaveisEmLote({
      fonte: "iniciativa", autorId: "autor",
      itens: ["a", "b", "c", "d", "e"].map((id) => ({ id, antes: [] })),
      depois: ["ana"],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(gravado()).toHaveLength(1);
    expect(gravado()[0]).toMatchObject({
      destinatarioId: "ana", tipo: "RESPONSAVEL_ADICIONADO", alvo: "INICIATIVA", quantidade: 5,
      trecho: "Item a, Item b, Item c e mais 2",
    });
  });

  it("quem entra em dois itens e quem sai de um recebem avisos separados, cada um com a sua contagem", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "X", members: [] });
    const { notificarResponsaveisEmLote } = await import("./notificacoes-db");

    await notificarResponsaveisEmLote({
      fonte: "iniciativa", autorId: "autor",
      itens: [{ id: "a", antes: [] }, { id: "b", antes: ["ana"] }],
      depois: ["bia"],
    });

    const bia = gravado().find((d) => d.destinatarioId === "bia");
    const ana = gravado().find((d) => d.destinatarioId === "ana");
    expect(bia).toMatchObject({ tipo: "RESPONSAVEL_ADICIONADO", quantidade: 2 });
    expect(ana).toMatchObject({ tipo: "RESPONSAVEL_REMOVIDO", quantidade: 1 });
    expect(gravado()).toHaveLength(2);
  });

  it("checkpoints do mesmo item: um aviso, o item é o alvo e os nomes ficam no subitem", async () => {
    icFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      name: `CP ${where.id}`, initiative: { id: "i9", name: "Régua" },
    }));
    const { notificarResponsaveisEmLote } = await import("./notificacoes-db");

    await notificarResponsaveisEmLote({
      fonte: "checkpoint-iniciativa", autorId: "autor",
      itens: [{ id: "1", antes: [] }, { id: "2", antes: [] }, { id: "3", antes: [] }],
      depois: ["ana"],
    });

    expect(gravado()).toHaveLength(1);
    expect(gravado()[0]).toMatchObject({
      alvo: "INICIATIVA", alvoId: "i9", quantidade: 3, subitem: "CP 1, CP 2, CP 3",
    });
  });

  it("item sem a leitura de antes fica de fora; o autor nunca recebe; falha não propaga", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "X", members: [] });
    const { notificarResponsaveisEmLote } = await import("./notificacoes-db");

    await notificarResponsaveisEmLote({
      fonte: "iniciativa", autorId: "autor",
      itens: [{ id: "a", antes: null }, { id: "b", antes: [] }],
      depois: ["ana", "autor"],
    });
    expect(gravado()).toHaveLength(1);
    expect(gravado()[0]).toMatchObject({ destinatarioId: "ana", quantidade: 1 });

    createMany.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notificarResponsaveisEmLote({ fonte: "iniciativa", autorId: "autor", itens: [{ id: "a", antes: [] }], depois: ["ana"] })
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("preferências: o que a pessoa desligou nem é criado", () => {
  it("aviso do tipo silenciado é descartado; os outros seguem", async () => {
    equipeAtiva([
      { id: "ana", notificacoesSilenciadas: ["RESPONSAVEL_REMOVIDO"] },
      { id: "bia", notificacoesSilenciadas: [] },
    ]);
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [] });
    const { notificarResponsaveis } = await import("./notificacoes-db");

    await notificarResponsaveis({ fonte: "iniciativa", id: "i1", autorId: "autor", antes: ["ana", "bia"], depois: [] });

    // Ana desligou "removido"; Bia não.
    expect(gravado().map((d) => d.destinatarioId)).toEqual(["bia"]);
  });

  it("tudo desligado: nada é gravado", async () => {
    equipeAtiva([{ id: "ana", notificacoesSilenciadas: ["RESPONSAVEL_ADICIONADO"] }]);
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [] });
    const { notificarResponsaveis } = await import("./notificacoes-db");

    await notificarResponsaveis({ fonte: "iniciativa", id: "i1", autorId: "autor", antes: [], depois: ["ana"] });

    expect(createMany).not.toHaveBeenCalled();
  });

  it("vale também para menção e comentário", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [{ id: "bia" }] });
    equipeAtiva([
      { id: "ana", name: "Ana", notificacoesSilenciadas: ["MENCAO"] },
      { id: "bia", name: "Bia", notificacoesSilenciadas: ["COMENTARIO"] },
    ]);
    const { notificarComentario } = await import("./notificacoes-db");

    await notificarComentario({ fonte: "iniciativa", itemId: "i1", autorId: "autor", conteudo: "@Ana veja" });

    // Ana silenciou menção; Bia (responsável) silenciou comentário.
    expect(createMany).not.toHaveBeenCalled();
  });

  it("lerSilenciadas devolve a lista da pessoa (vazia se não há conta)", async () => {
    const { lerSilenciadas } = await import("./notificacoes-db");
    teamFindUnique.mockResolvedValueOnce({ notificacoesSilenciadas: ["MENCAO"] });
    expect(await lerSilenciadas("ana")).toEqual(["MENCAO"]);
    teamFindUnique.mockResolvedValueOnce(null);
    expect(await lerSilenciadas("sumiu")).toEqual([]);
  });
});

describe("notificarConversao", () => {
  it("avisa os responsáveis do item novo e os dos checkpoints copiados, menos o autor", async () => {
    experimentoFindUnique.mockResolvedValue({
      name: "Teste A/B",
      members: [{ id: "ana" }, { id: "autor" }],
      checkpoints: [{ members: [{ id: "bia" }, { id: "ana" }] }, { members: [] }],
    });
    const { notificarConversao } = await import("./notificacoes-db");

    await notificarConversao({ para: "experimento", novoId: "e1", autorId: "autor" });

    expect(gravado().map((d) => d.destinatarioId).sort()).toEqual(["ana", "bia"]);
    expect(gravado()[0]).toMatchObject({
      tipo: "ITEM_CONVERTIDO", alvo: "EXPERIMENTO", alvoId: "e1", alvoNome: "Teste A/B", subitem: null,
    });
  });

  it("experimento virando iniciativa aponta para a iniciativa nova", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [{ id: "ana" }], checkpoints: [] });
    const { notificarConversao } = await import("./notificacoes-db");

    await notificarConversao({ para: "iniciativa", novoId: "i7", autorId: "autor" });

    expect(gravado()[0]).toMatchObject({ alvo: "INICIATIVA", alvoId: "i7", tipo: "ITEM_CONVERTIDO" });
  });

  it("sem responsáveis além do autor, não grava; falha não propaga", async () => {
    experimentoFindUnique.mockResolvedValue({ name: "X", members: [{ id: "autor" }], checkpoints: [] });
    const { notificarConversao } = await import("./notificacoes-db");
    await notificarConversao({ para: "experimento", novoId: "e1", autorId: "autor" });
    expect(createMany).not.toHaveBeenCalled();

    experimentoFindUnique.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notificarConversao({ para: "experimento", novoId: "e1", autorId: "autor" })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("notificarDuplicacaoDeCheckpoints", () => {
  it("cada responsável pelas cópias recebe UM aviso, com a contagem das suas cópias", async () => {
    iniciativaFindUnique.mockResolvedValue({ name: "Régua", members: [] });
    const { notificarDuplicacaoDeCheckpoints } = await import("./notificacoes-db");

    await notificarDuplicacaoDeCheckpoints({
      kind: "iniciativa", itemId: "i1", autorId: "autor",
      copias: [
        { nome: "Briefing", responsaveisIds: ["ana", "bia"] },
        { nome: "Layout", responsaveisIds: ["ana", "autor"] },
        { nome: "QA", responsaveisIds: [] },
      ],
    });

    const porPessoa = Object.fromEntries(gravado().map((d) => [d.destinatarioId as string, d]));
    expect(Object.keys(porPessoa).sort()).toEqual(["ana", "bia"]);
    expect(porPessoa.ana).toMatchObject({
      tipo: "ITEM_DUPLICADO", alvo: "INICIATIVA", alvoId: "i1", quantidade: 2, subitem: "Briefing, Layout",
    });
    expect(porPessoa.bia).toMatchObject({ quantidade: 1, subitem: "Briefing" });
  });

  it("cópias sem responsável (ou só do autor) não consultam nada nem gravam", async () => {
    const { notificarDuplicacaoDeCheckpoints } = await import("./notificacoes-db");

    await notificarDuplicacaoDeCheckpoints({
      kind: "experimento", itemId: "e1", autorId: "autor",
      copias: [{ nome: "A", responsaveisIds: [] }, { nome: "B", responsaveisIds: ["autor"] }],
    });

    expect(createMany).not.toHaveBeenCalled();
    expect(experimentoFindUnique).not.toHaveBeenCalled();
  });
});

describe("listarNotificacoes — avisos agrupados", () => {
  const base = {
    tipo: "RESPONSAVEL_ADICIONADO", alvo: "INICIATIVA", alvoId: "i1", alvoNome: "A", subitem: null,
    trecho: null, quantidade: 1, lidaEm: null, createdAt: new Date("2026-11-10T12:00:00Z"), autor: { name: "Ana" },
  };

  it("aviso que reúne itens: frase no plural, nomes como detalhe, leva à lista e não abre popup", async () => {
    findMany.mockResolvedValue([{ id: "n1", ...base, quantidade: 5, trecho: "A, B, C e mais 2" }]);
    const { listarNotificacoes } = await import("./notificacoes-db");

    const { avisos } = await listarNotificacoes("ana");

    expect(avisos[0]).toMatchObject({
      texto: "Ana adicionou você como responsável em 5 iniciativas",
      trecho: "A, B, C e mais 2", href: "/iniciativas", abreModal: false, quantidade: 5,
    });
  });

  it("aviso de checkpoints de um item: abre o item e mostra os nomes", async () => {
    findMany.mockResolvedValue([{ id: "n2", ...base, quantidade: 3, subitem: "CP1, CP2, CP3" }]);
    const { listarNotificacoes } = await import("./notificacoes-db");

    const { avisos } = await listarNotificacoes("ana");

    expect(avisos[0]).toMatchObject({
      texto: "Ana adicionou você como responsável em 3 checkpoints da iniciativa “A”",
      trecho: "CP1, CP2, CP3", href: "/iniciativas/i1", abreModal: true,
    });
  });

  it("aviso comum de item abre o popup; KR não", async () => {
    findMany.mockResolvedValue([{ id: "n3", ...base }, { id: "n4", ...base, alvo: "OKR", alvoId: "k1" }]);
    const { listarNotificacoes } = await import("./notificacoes-db");

    const { avisos } = await listarNotificacoes("ana");

    expect(avisos.map((a) => a.abreModal)).toEqual([true, false]);
  });
});
