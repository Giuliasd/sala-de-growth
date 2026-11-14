import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A busca por nome (`?q=`) entra no MESMO `where` do filtro de quarter, e os
 * dois usam `OR`. Duas chaves `OR` no mesmo objeto se sobrescrevem: a busca
 * apagaria o filtro de quarter (ou o contrário) sem nenhum erro. Estes testes
 * fixam que os dois sobrevivem juntos.
 */
const iniciativaFindMany = vi.fn();
const experimentoFindMany = vi.fn();

vi.mock("@/lib/registro-semanal-db", () => ({ antesDeMexerNoItem: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findMany: iniciativaFindMany },
    experimento: { findMany: experimentoFindMany },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn().mockResolvedValue({ id: "m1", role: "COLABORADOR" }),
  hasOwnershipAccess: vi.fn(),
  requireEditPermission: vi.fn(),
  requireOwnershipPermission: vi.fn(),
}));
vi.mock("@/lib/quarters-cache", () => ({
  findQuarterCached: vi.fn().mockResolvedValue({
    id: "q1",
    startDate: new Date("2026-07-01"),
    endDate: new Date("2026-09-30"),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getIniciativas — busca por nome", () => {
  it("filtra por nome SEM ACENTO, sem perder o filtro de quarter", async () => {
    // 1ª consulta: os nomes (para comparar sem acento); 2ª: a lista.
    iniciativaFindMany
      .mockResolvedValueOnce([
        { id: "i1", name: "Régua de e-mail" },
        { id: "i2", name: "Outra" },
      ])
      .mockResolvedValue([]);
    const { getIniciativas } = await import("./iniciativas");

    await getIniciativas({ quarterId: "q1", q: "  regua  " });

    const where = iniciativaFindMany.mock.calls[1][0].where;
    expect(where.id).toEqual({ in: ["i1"] });
    expect(where.OR).toBeDefined(); // o filtro de quarter continua lá
    expect(where.deletedAt).toBeNull();
  });

  it("sem busca (ou só espaços), não filtra por nome", async () => {
    iniciativaFindMany.mockResolvedValue([]);
    const { getIniciativas } = await import("./iniciativas");

    await getIniciativas({ quarterId: "q1", q: "   " });

    expect(iniciativaFindMany).toHaveBeenCalledTimes(1); // só a lista, sem ler os nomes
    expect(iniciativaFindMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});

describe("getExperimentos — busca por nome, objetivo e descrição", () => {
  it("busca sem acento em nome, objetivo e descrição, sem perder o filtro de quarter", async () => {
    experimentoFindMany
      .mockResolvedValueOnce([
        { id: "e1", name: "Frete grátis", objective: "", description: "" },
        { id: "e2", name: "Outro", objective: "Reduzir frete", description: "" },
        { id: "e3", name: "Outro", objective: "", description: "Hipótese: FRÉTE" },
        { id: "e4", name: "Nada", objective: "", description: "" },
      ])
      .mockResolvedValue([]);
    const { getExperimentos } = await import("./experimentos");

    await getExperimentos({ quarterId: "q1", q: "frete" });

    const where = experimentoFindMany.mock.calls[1][0].where;
    expect(where.OR).toBeDefined(); // quarter
    expect(where.id).toEqual({ in: ["e1", "e2", "e3"] });
  });

  it("sem busca, não lê os textos nem filtra por id", async () => {
    experimentoFindMany.mockResolvedValue([]);
    const { getExperimentos } = await import("./experimentos");

    await getExperimentos({ quarterId: "q1" });

    expect(experimentoFindMany).toHaveBeenCalledTimes(1);
    expect(experimentoFindMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});
