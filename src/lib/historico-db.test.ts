import { afterEach, describe, expect, it, vi } from "vitest";

const iniciativaFindUnique = vi.fn();
const experimentoFindUnique = vi.fn();
const createMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findUnique: iniciativaFindUnique },
    experimento: { findUnique: experimentoFindUnique },
    historicoItem: { createMany },
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

const baseIniciativa = {
  name: "Régua de e-mail",
  status: "EM_ANDAMENTO",
  priority: "ALTA",
  startDate: new Date("2026-09-01T00:00:00Z"),
  endDate: new Date("2026-09-30T00:00:00Z"),
  launchDate: null,
  analysisDate: null,
  resultado: null,
  docLink: null,
  frente: { name: "Aquisição" },
  quarter: { quarter: 3, year: 2026 },
  okr: null,
  members: [{ name: "Bia" }, { name: "Ana" }],
};

describe("snapshotDoItem", () => {
  it("devolve o item em texto legível: rótulos, datas dd/mm/aaaa e responsáveis em ordem", async () => {
    iniciativaFindUnique.mockResolvedValue(baseIniciativa);
    const { snapshotDoItem } = await import("./historico-db");

    const foto = await snapshotDoItem("iniciativa", "i1");

    expect(foto).toMatchObject({
      nome: "Régua de e-mail",
      prioridade: "Alta",
      frente: "Aquisição",
      quarter: "Q3 2026",
      inicio: "01/09/2026",
      fim: "30/09/2026",
      okr: "",
      responsaveis: "Ana, Bia",
    });
    expect(foto?.status).toBeTruthy();
    expect(foto?.status).not.toBe("EM_ANDAMENTO"); // rótulo, não o enum cru
  });

  it("item inexistente devolve null", async () => {
    iniciativaFindUnique.mockResolvedValue(null);
    const { snapshotDoItem } = await import("./historico-db");
    expect(await snapshotDoItem("iniciativa", "nao-existe")).toBeNull();
  });

  it("experimento inclui descrição, objetivo e ICE", async () => {
    experimentoFindUnique.mockResolvedValue({
      ...baseIniciativa,
      description: "Hipótese",
      objective: "Subir conversão",
      status: "BACKLOG",
      iceScore: 7.456,
      iceAction: "EXECUTAR_AGORA",
    });
    const { snapshotDoItem } = await import("./historico-db");

    const foto = await snapshotDoItem("experimento", "e1");

    expect(foto).toMatchObject({ descricao: "Hipótese", objetivo: "Subir conversão", ice: "7.5 (Executar agora)" });
  });
});

describe("registrarMudancas", () => {
  it("grava uma linha por campo alterado, num INSERT só, com o autor", async () => {
    iniciativaFindUnique.mockResolvedValue({ ...baseIniciativa, priority: "URGENTE", members: [{ name: "Ana" }] });
    const { registrarMudancas } = await import("./historico-db");
    const antes = { prioridade: "Alta", responsaveis: "Ana, Bia", nome: "Régua de e-mail" };

    const r = await registrarMudancas("iniciativa", "i1", "membro-1", antes);

    expect(r.map((m) => m.campo)).toEqual(["prioridade", "responsaveis"]);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toEqual([
      { entidade: "INICIATIVA", entidadeId: "i1", atorId: "membro-1", campo: "prioridade", de: "Alta", para: "Urgente", detalhe: null },
      { entidade: "INICIATIVA", entidadeId: "i1", atorId: "membro-1", campo: "responsaveis", de: "Ana, Bia", para: "Ana", detalhe: null },
    ]);
  });

  it("nada mudou: não grava nada", async () => {
    iniciativaFindUnique.mockResolvedValue(baseIniciativa);
    const { registrarMudancas, snapshotDoItem } = await import("./historico-db");
    const antes = await snapshotDoItem("iniciativa", "i1");

    expect(await registrarMudancas("iniciativa", "i1", "m1", antes)).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("sem foto de antes, não grava (a edição segue sem histórico)", async () => {
    const { registrarMudancas } = await import("./historico-db");
    expect(await registrarMudancas("iniciativa", "i1", "m1", null)).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("falha no banco do histórico NUNCA propaga — o histórico é memória, não portão", async () => {
    iniciativaFindUnique.mockResolvedValue({ ...baseIniciativa, priority: "URGENTE" });
    createMany.mockRejectedValue(new Error("Connection terminated"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registrarMudancas, registrarEvento, fotoAntes } = await import("./historico-db");

    await expect(registrarMudancas("iniciativa", "i1", "m1", { prioridade: "Alta" })).resolves.toEqual([]);
    await expect(registrarEvento("iniciativa", "i1", "m1", { campo: "excluido", de: null, para: null })).resolves.toBeUndefined();

    iniciativaFindUnique.mockRejectedValue(new Error("timeout"));
    await expect(fotoAntes("iniciativa", "i1")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("registrarEdicaoDeCheckpoint", () => {
  const dia = (s: string) => new Date(`${s}T00:00:00Z`);

  it("grava a remarcação de prazo e a troca de nome", async () => {
    const { registrarEdicaoDeCheckpoint } = await import("./historico-db");

    await registrarEdicaoDeCheckpoint(
      "iniciativa", "i1", "m1",
      { name: "Briefing", dueDate: dia("2026-09-01") },
      { name: "Briefing v2", dueDate: dia("2026-09-15") }
    );

    expect(createMany.mock.calls[0][0].data.map((d: { para: string }) => d.para)).toEqual([
      "prazo 01/09/2026 → 15/09/2026",
      'renomeado (era "Briefing")',
    ]);
  });

  it("sem mudança de prazo nem de nome, não grava", async () => {
    const { registrarEdicaoDeCheckpoint } = await import("./historico-db");
    await registrarEdicaoDeCheckpoint(
      "experimento", "e1", "m1",
      { name: "A", dueDate: dia("2026-09-01") },
      { name: "A", dueDate: dia("2026-09-01") }
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it("dado incompleto NÃO lança: roda depois da gravação e não pode transformar edição salva em erro", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registrarEdicaoDeCheckpoint } = await import("./historico-db");
    await expect(
      registrarEdicaoDeCheckpoint(
        "iniciativa", "i1", "m1",
        { name: "A" } as never,
        { name: "A", dueDate: dia("2026-09-01") }
      )
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
