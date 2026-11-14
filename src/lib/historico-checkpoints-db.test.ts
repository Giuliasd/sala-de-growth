import { afterEach, describe, expect, it, vi } from "vitest";

/** Histórico dos checkpoints: foto antes/depois, mover e eventos em lote. */
const icFindMany = vi.fn();
const ecFindMany = vi.fn();
const createMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    initiativeCheckpoint: { findMany: icFindMany },
    experimentoCheckpoint: { findMany: ecFindMany },
    historicoItem: { createMany },
  },
}));

afterEach(() => vi.clearAllMocks());

const linha = (extra = {}) => ({
  id: "c1",
  name: "Briefing",
  dueDate: new Date("2026-09-01T00:00:00Z"),
  categoria: null,
  members: [{ name: "Bia" }, { name: "Ana" }],
  tags: [{ name: "Design" }],
  requisitos: [],
  marcos: [],
  ...extra,
});
const gravado = () => createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;

describe("fotos e diferença dos checkpoints", () => {
  it("foto legível: prazo dd/mm/aaaa, categoria com rótulo, nomes em ordem", async () => {
    icFindMany.mockResolvedValue([linha({ categoria: "MARCO" })]);
    const { fotosDosCheckpoints } = await import("./historico-db");

    const fotos = await fotosDosCheckpoints("iniciativa", ["c1"]);

    expect(fotos.get("c1")).toEqual({
      nome: "Briefing", prazo: "01/09/2026", categoria: "Marco",
      responsaveis: ["Ana", "Bia"], tags: ["Design"], requisitos: [], marcos: [],
    });
  });

  it("grava, num INSERT só, as linhas de cada checkpoint que mudou (e ignora os iguais e os excluídos)", async () => {
    icFindMany
      .mockResolvedValueOnce([linha(), linha({ id: "c2", name: "QA" }), linha({ id: "c3", name: "Some" })])
      .mockResolvedValueOnce([
        linha({ members: [{ name: "Ana" }], tags: [] }), // c1: tirou Bia e a tag
        linha({ id: "c2", name: "QA" }), // c2: igual
        // c3: excluído no meio — não aparece depois
      ]);
    const { fotosDosCheckpoints, registrarMudancasDosCheckpoints } = await import("./historico-db");

    const antes = await fotosDosCheckpoints("iniciativa", ["c1", "c2", "c3"]);
    await registrarMudancasDosCheckpoints("iniciativa", "i1", "m1", antes);

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(gravado()).toEqual([
      { entidade: "INICIATIVA", entidadeId: "i1", atorId: "m1", campo: "checkpoint", de: null, para: "responsáveis: removeu Bia", detalhe: "Briefing" },
      { entidade: "INICIATIVA", entidadeId: "i1", atorId: "m1", campo: "checkpoint", de: null, para: "tags: removeu Design", detalhe: "Briefing" },
    ]);
  });

  it("experimento usa a tabela de checkpoints de experimento", async () => {
    ecFindMany.mockResolvedValueOnce([linha()]).mockResolvedValueOnce([linha({ dueDate: new Date("2026-09-15T00:00:00Z") })]);
    const { fotosDosCheckpoints, registrarMudancasDosCheckpoints } = await import("./historico-db");

    await registrarMudancasDosCheckpoints("experimento", "e1", "m1", await fotosDosCheckpoints("experimento", ["c1"]));

    expect(gravado()[0]).toMatchObject({ entidade: "EXPERIMENTO", para: "prazo 01/09/2026 → 15/09/2026" });
    expect(icFindMany).not.toHaveBeenCalled();
  });

  it("falha nunca propaga: foto vira mapa vazio e a gravação só loga", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    icFindMany.mockRejectedValueOnce(new Error("timeout"));
    const { fotosDosCheckpoints, registrarMudancasDosCheckpoints } = await import("./historico-db");

    expect((await fotosDosCheckpoints("iniciativa", ["c1"])).size).toBe(0);

    icFindMany.mockRejectedValueOnce(new Error("timeout"));
    const antes = new Map([["c1", { nome: "A", prazo: "", categoria: "", responsaveis: [], tags: [], requisitos: [], marcos: [] }]]);
    await expect(registrarMudancasDosCheckpoints("iniciativa", "i1", "m1", antes)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("registrarMovimentoDeCheckpoints", () => {
  it("para dentro de outro checkpoint: cita o novo pai", async () => {
    icFindMany.mockResolvedValue([{ id: "c1", name: "Layout" }, { id: "p1", name: "Site" }]);
    const { registrarMovimentoDeCheckpoints } = await import("./historico-db");

    await registrarMovimentoDeCheckpoints("iniciativa", "i1", "m1", ["c1"], "p1");

    expect(gravado()).toEqual([
      expect.objectContaining({ campo: "checkpoint", detalhe: "Layout", para: 'movido para dentro de "Site"' }),
    ]);
  });

  it("para o nível principal", async () => {
    icFindMany.mockResolvedValue([{ id: "c1", name: "Layout" }, { id: "c2", name: "QA" }]);
    const { registrarMovimentoDeCheckpoints } = await import("./historico-db");

    await registrarMovimentoDeCheckpoints("iniciativa", "i1", "m1", ["c1", "c2"], null);

    expect(gravado().map((d) => d.para)).toEqual(["movido para o nível principal", "movido para o nível principal"]);
  });
});
