import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Integridade do que a Weekly e os KRs guardam:
 *  - editar/excluir/converter um ITEM registra a semana ANTES de gravar (nome,
 *    status, frente e responsáveis do item aparecem em cada checkpoint dele);
 *  - concluir em massa não sobrescreve a data de quem já estava concluído;
 *  - editar um KR trava a linha antes de ler, para não apagar um valor lançado
 *    ao mesmo tempo.
 */
const ordem: string[] = [];
const antesDeMexerNoItem = vi.fn(async (_kind: string, id: string) => {
  ordem.push(`registro:${id}`);
});
vi.mock("@/lib/registro-semanal-db", () => ({
  antesDeMexerNoItem,
  contarRemarcacoes: vi.fn(),
  marcarExcluidos: vi.fn(),
}));

const iniciativaUpdate = vi.fn(async () => {
  ordem.push("grava");
  return { id: "i1" };
});
const iniciativaFindUnique = vi.fn(async () => ({ members: [{ id: "membro-1" }] }));
const iniciativaFindMany = vi.fn();
const iniciativaUpdateMany = vi.fn(async () => ({ count: 0 }));
const cpFindMany = vi.fn();
const cpUpdateMany = vi.fn((args: unknown) => ({ op: "updateMany", args }));
const transacao = vi.fn(async (arg: unknown) => {
  if (typeof arg === "function") return arg(tx);
  ordem.push("grava");
  return arg;
});
const tx = {
  $queryRaw: vi.fn(async () => {
    ordem.push("trava");
    return [];
  }),
  oKR: {
    findUnique: vi.fn(async () => {
      ordem.push("le");
      return {
        measurementType: "ACUMULADO", initialValue: 0, targetValue: 100, currentValue: 40,
        monthValue1: null, monthValue2: null, monthValue3: null,
      };
    }),
    update: vi.fn(async () => {
      ordem.push("grava");
      return { id: "k1" };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: {
      update: iniciativaUpdate, findUnique: iniciativaFindUnique, findMany: iniciativaFindMany,
      updateMany: iniciativaUpdateMany,
    },
    initiativeCheckpoint: { findMany: cpFindMany, updateMany: cpUpdateMany },
    teamMember: { count: vi.fn(async () => 1) },
    oKR: { findUnique: vi.fn(async () => ({ members: [{ id: "membro-1" }] })) },
    $transaction: transacao,
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

const membro = { id: "membro-1", role: "LIDERANCA" };
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn(async () => membro),
  hasOwnershipAccess: vi.fn(() => true),
  requireEditPermission: vi.fn(async () => membro),
  requireOwnershipPermission: vi.fn(async () => membro),
}));
vi.mock("@/lib/quarters-cache", () => ({ findQuarterCached: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/historico-db", () => ({
  fotoAntes: vi.fn(async () => null),
  registrarMudancas: vi.fn(async () => []),
  registrarEvento: vi.fn(async () => {}),
  registrarEdicaoDeCheckpoint: vi.fn(async () => {}),
  fotosDosCheckpoints: vi.fn(async () => new Map()),
  registrarMudancasDosCheckpoints: vi.fn(async () => {}),
  registrarEventos: vi.fn(async () => {}),
  registrarMovimentoDeCheckpoints: vi.fn(async () => {}),
}));
vi.mock("@/lib/notificacoes-db", () => ({
  responsaveisAtuais: vi.fn(async () => []),
  notificarResponsaveis: vi.fn(async () => {}),
  notificarResponsaveisEmLote: vi.fn(async () => {}),
  notificarConversao: vi.fn(async () => {}),
  notificarDuplicacaoDeCheckpoints: vi.fn(async () => {}),
}));

const ID = "3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b";
const ID2 = "7a1d9e2c-4b3f-4c8d-8e5a-6f7081928374";

afterEach(() => {
  vi.clearAllMocks();
  ordem.length = 0;
});

describe("item: registra a semana ANTES de gravar", () => {
  it("editar a iniciativa", async () => {
    const { updateIniciativa } = await import("./iniciativas");
    const r = await updateIniciativa(ID, { name: "Novo nome" });
    expect(r.success).toBe(true);
    expect(ordem).toEqual([`registro:${ID}`, "grava"]);
  });

  it("mudar o status (cancelar tira os checkpoints da Weekly)", async () => {
    const { updateIniciativaStatus } = await import("./iniciativas");
    await updateIniciativaStatus(ID, "CANCELADA" as never);
    expect(ordem).toEqual([`registro:${ID}`, "grava"]);
  });

  it("excluir", async () => {
    const { deleteIniciativa } = await import("./iniciativas");
    await deleteIniciativa(ID);
    expect(ordem).toEqual([`registro:${ID}`, "grava"]);
  });

  it("edição em massa de status: cada item, um de cada vez, antes da transação", async () => {
    iniciativaFindMany.mockResolvedValue([
      { id: ID, members: [] },
      { id: ID2, members: [] },
    ]);
    const { bulkUpdateIniciativas } = await import("./iniciativas");
    const r = await bulkUpdateIniciativas([ID, ID2], { status: "PAUSADA" });
    expect(r.success).toBe(true);
    expect(ordem).toEqual([`registro:${ID}`, `registro:${ID2}`, "grava"]);
  });

  it("edição em massa só de quarter/OKR não mexe no que a Weekly mostra: não registra", async () => {
    iniciativaFindMany.mockResolvedValue([{ id: ID, members: [] }]);
    const { bulkUpdateIniciativas } = await import("./iniciativas");
    await bulkUpdateIniciativas([ID], { quarterId: ID2 });
    expect(antesDeMexerNoItem).not.toHaveBeenCalled();
  });
});

describe("checkpoints em massa: concluir não apaga a data de quem já estava concluído", () => {
  const selecionados = [
    { id: ID, name: "A", initiativeId: "i1", startDate: null, dueDate: new Date(), members: [], initiative: { members: [] } },
    { id: ID2, name: "B", initiativeId: "i1", startDate: null, dueDate: new Date(), members: [], initiative: { members: [] } },
  ];

  it("concluir: só os que ainda não estavam concluídos ganham isCompleted e completedAt", async () => {
    cpFindMany.mockResolvedValue(selecionados);
    const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");

    const r = await bulkUpdateCheckpoints({ ids: [ID, ID2], isCompleted: true });

    expect(r.success).toBe(true);
    expect(cpUpdateMany).toHaveBeenCalledTimes(1);
    const args = cpUpdateMany.mock.calls[0][0] as { where: unknown; data: { isCompleted: boolean; completedAt: Date } };
    expect(args.where).toEqual({ id: { in: [ID, ID2] }, isCompleted: false });
    expect(args.data.isCompleted).toBe(true);
    expect(args.data.completedAt).toBeInstanceOf(Date);
  });

  it("reabrir: só os concluídos voltam a abertos, com a data limpa", async () => {
    cpFindMany.mockResolvedValue(selecionados);
    const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");

    await bulkUpdateCheckpoints({ ids: [ID, ID2], isCompleted: false });

    expect(cpUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: [ID, ID2] }, isCompleted: true },
      data: { isCompleted: false, completedAt: null },
    });
  });

  it("mudar só a categoria não toca em conclusão", async () => {
    cpFindMany.mockResolvedValue(selecionados);
    const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");

    await bulkUpdateCheckpoints({ ids: [ID, ID2], categoria: null });

    const datas = cpUpdateMany.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(datas.every((d) => !("isCompleted" in d) && !("completedAt" in d))).toBe(true);
  });
});

describe("updateOKR: trava o KR antes de ler", () => {
  it("trava → lê → grava, tudo dentro da transação", async () => {
    const { updateOKR } = await import("./okrs");

    const r = await updateOKR(ID, { targetValue: 200 });

    expect(r.success).toBe(true);
    expect(ordem).toEqual(["trava", "le", "grava"]);
    // O valor já lançado (40) é preservado; só a meta muda.
    expect((tx.oKR.update.mock.calls as unknown as unknown[][])[0][0]).toMatchObject({ data: { currentValue: 40, targetValue: 200 } });
  });
});
