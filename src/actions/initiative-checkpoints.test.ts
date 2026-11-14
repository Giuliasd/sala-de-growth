import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O que estes testes protegem: a CATEGORIA do checkpoint atravessando o action
 * até o banco.
 *
 * Existem porque esse caminho quebrou de verdade. A categoria foi implementada
 * no formulário, no tipo e no action, mas o call site que monta o payload não
 * passava o campo: a tela mostrava "Comunicação", nenhum erro aparecia, e o
 * banco gravava `null`. Só o teste manual pegou — nenhum teste automatizado
 * cobria escrita de action.
 *
 * A distinção que mais importa aqui é `undefined` × `null`:
 *   - ausente  → não mexe na coluna (é o que permite editar o nome sem apagar
 *                a categoria de quem já tinha uma);
 *   - `null`   → limpa.
 */

const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const aggregate = vi.fn();
const count = vi.fn();
const $transaction = vi.fn();

// O registro da semana tem teste próprio (lib/registro-semanal.test.ts); aqui
// ele só atrapalharia o mock do prisma.
vi.mock("@/lib/registro-semanal-db", () => ({
  antesDeMexerNoItem: vi.fn(),
  contarRemarcacoes: vi.fn(),
  marcarExcluidos: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    initiativeCheckpoint: { create, update, updateMany, findUnique, findMany, aggregate, count },
    iniciativa: { findUnique: vi.fn().mockResolvedValue({ members: [{ id: "m1" }] }) },
    $transaction,
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

vi.mock("@/lib/session", () => ({
  requireEditPermission: vi.fn().mockResolvedValue({ id: "m1", role: "LIDERANCA" }),
  // O gate devolve o membro que passou (como o real): o histórico grava em nome dele.
  requireOwnershipPermission: vi.fn().mockResolvedValue({ id: "m1", role: "LIDERANCA" }),
  hasOwnershipAccess: () => true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const INI = "11111111-1111-4111-8111-111111111111";
const CP = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  aggregate.mockResolvedValue({ _max: { order: 2 } });
  create.mockResolvedValue({ id: CP, initiativeId: INI });
  update.mockResolvedValue({ id: CP, initiativeId: INI });
  // Árvore lida pelo ajuste de cobertura dos pais (cobrirPais).
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue({
    members: [{ id: "m1" }],
    initiative: { members: [{ id: "m1" }] },
    // Lido quando um sub nasce sem tags (herda as do pai).
    tags: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createCheckpoint — categoria", () => {
  it("grava a categoria recebida", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({
      initiativeId: INI,
      name: "Anunciar no Slack",
      dueDate: "2026-09-12",
      categoria: "COMUNICACAO",
    });
    expect(res.success).toBe(true);
    expect(create.mock.calls[0][0].data.categoria).toBe("COMUNICACAO");
  });

  it("aceita a categoria MARCO — uma data relevante do projeto", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({
      initiativeId: INI,
      name: "Go-live",
      dueDate: "2026-09-30",
      categoria: "MARCO",
    });
    expect(res.success).toBe(true);
    expect(create.mock.calls[0][0].data.categoria).toBe("MARCO");
  });

  it("recusa categoria que não existe", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({
      initiativeId: INI,
      name: "X",
      dueDate: "2026-09-30",
      // @ts-expect-error — valor fora do enum de propósito
      categoria: "INVENTADA",
    });
    expect(res.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("sem categoria grava null — nenhum checkpoint nasce categorizado por acidente", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    await createCheckpoint({ initiativeId: INI, name: "Etapa", dueDate: "2026-09-12" });
    expect(create.mock.calls[0][0].data.categoria).toBeNull();
  });

  it("recusa categoria que não existe no enum", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({
      initiativeId: INI,
      name: "Etapa",
      dueDate: "2026-09-12",
      // @ts-expect-error — o ponto do teste é o valor inválido chegando do cliente.
      categoria: "MARKETING",
    });
    expect(res.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("createCheckpoint — tags do sub", () => {
  const PAI = "33333333-3333-4333-8333-333333333333";
  const TAG = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    // O pai é lido duas vezes: subindo o ramo (responsáveis) e pelas tags.
    findUnique.mockImplementation(({ select }: { select: Record<string, unknown> }) =>
      Promise.resolve(
        select.tags
          ? { tags: [{ id: TAG }] }
          : { initiativeId: INI, parentId: null, members: [{ id: "m1" }] }
      )
    );
  });

  it("sem tags na chamada, o sub herda as do pai", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({ initiativeId: INI, parentId: PAI, name: "Sub", dueDate: "2026-09-12" });
    expect(res.success).toBe(true);
    expect(create.mock.calls[0][0].data.tags).toEqual({ connect: [{ id: TAG }] });
  });

  it("`[]` explícito é escolha: o sub nasce sem tags", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    await createCheckpoint({ initiativeId: INI, parentId: PAI, name: "Sub", dueDate: "2026-09-12", tagIds: [] });
    expect(create.mock.calls[0][0].data.tags).toEqual({ connect: [] });
  });

  it("checkpoint de topo não herda nada", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    await createCheckpoint({ initiativeId: INI, name: "Topo", dueDate: "2026-09-12" });
    expect(create.mock.calls[0][0].data.tags).toEqual({ connect: [] });
  });
});

describe("updateCheckpoint — categoria", () => {
  it("ausente NÃO mexe na coluna", async () => {
    const { updateCheckpoint } = await import("./initiative-checkpoints");
    await updateCheckpoint({ id: CP, name: "Novo nome", dueDate: "2026-09-12" });
    expect("categoria" in update.mock.calls[0][0].data).toBe(false);
  });

  it("`null` limpa a categoria", async () => {
    const { updateCheckpoint } = await import("./initiative-checkpoints");
    await updateCheckpoint({
      id: CP,
      name: "Etapa",
      dueDate: "2026-09-12",
      categoria: null,
    });
    expect(update.mock.calls[0][0].data.categoria).toBeNull();
  });

  it("define a categoria quando ela vem", async () => {
    const { updateCheckpoint } = await import("./initiative-checkpoints");
    await updateCheckpoint({
      id: CP,
      name: "Etapa",
      dueDate: "2026-09-12",
      categoria: "COMUNICACAO",
    });
    expect(update.mock.calls[0][0].data.categoria).toBe("COMUNICACAO");
  });
});

describe("bulkUpdateCheckpoints — categoria", () => {
  beforeEach(() => {
    findMany.mockResolvedValue([
      {
        id: CP,
        name: "Etapa",
        initiativeId: INI,
        members: [{ id: "m1" }],
        initiative: { members: [{ id: "m1" }] },
      },
    ]);
    updateMany.mockResolvedValue({ count: 1 });
    $transaction.mockResolvedValue([{ count: 1 }]);
  });

  it("aplica a categoria à seleção", async () => {
    const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");
    const res = await bulkUpdateCheckpoints({ ids: [CP], categoria: "COMUNICACAO" });
    expect(res.success).toBe(true);
    const escrito = updateMany.mock.calls
      .concat($transaction.mock.calls.flat().flat().map((c: unknown) => [c]))
      .map(([arg]) => arg)
      .find((arg) => arg && typeof arg === "object" && "data" in arg);
    expect(escrito?.data?.categoria).toBe("COMUNICACAO");
  });

  // Só categoria já é motivo suficiente: o guard "nenhum campo para alterar"
  // olhava apenas datas, conclusão e responsáveis.
  it("categoria sozinha não cai em 'nenhum campo para alterar'", async () => {
    const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");
    const res = await bulkUpdateCheckpoints({ ids: [CP], categoria: null });
    expect(res.success).toBe(true);
  });
});

/**
 * reorderCheckpoints confere a posse na INICIATIVA, mas os ids dos checkpoints
 * vêm do cliente. Antes o update era só `where: { id }`: um request forjado com
 * o id de checkpoint de outra iniciativa passava pela checagem da própria e
 * reordenava o alheio.
 */
describe("reorderCheckpoints — checkpoints de outra iniciativa", () => {
  const OUTRO = "33333333-3333-4333-8333-333333333333";

  it("recusa sem gravar nada quando algum id não é desta iniciativa", async () => {
    const { reorderCheckpoints } = await import("./initiative-checkpoints");
    count.mockResolvedValue(1); // só CP pertence; OUTRO não
    const res = await reorderCheckpoints(INI, [
      { id: CP, order: 0 },
      { id: OUTRO, order: 1 },
    ]);
    expect(res.success).toBe(false);
    expect($transaction).not.toHaveBeenCalled();
    expect(count.mock.calls[0][0].where).toEqual({ id: { in: [CP, OUTRO] }, initiativeId: INI });
  });

  it("grava amarrando cada checkpoint à iniciativa", async () => {
    const { reorderCheckpoints } = await import("./initiative-checkpoints");
    count.mockResolvedValue(1);
    $transaction.mockResolvedValue([]);
    const res = await reorderCheckpoints(INI, [{ id: CP, order: 3 }]);
    expect(res.success).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: CP, initiativeId: INI }, data: { order: 3 } });
  });
});

describe("ordem das datas — início não pode ficar depois do fim", () => {
  it("createCheckpoint recusa fim antes do início, sem gravar", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({
      initiativeId: INI,
      name: "X",
      startDate: "2026-09-20",
      dueDate: "2026-09-10",
    });
    expect(res).toEqual({ success: false, error: expect.stringMatching(/igual ou posterior/) });
    expect(create).not.toHaveBeenCalled();
  });

  it("updateCheckpoint recusa fim antes do início, sem gravar", async () => {
    const { updateCheckpoint } = await import("./initiative-checkpoints");
    const res = await updateCheckpoint({ id: CP, name: "X", startDate: "2026-09-20", dueDate: "2026-09-10" });
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("updateCheckpoint aceita início igual ao fim", async () => {
    const { updateCheckpoint } = await import("./initiative-checkpoints");
    const res = await updateCheckpoint({ id: CP, name: "X", startDate: "2026-09-10", dueDate: "2026-09-10" });
    expect(res.success).toBe(true);
  });

  describe("bulkUpdateCheckpoints", () => {
    const OUTRO = "33333333-3333-4333-8333-333333333333";
    beforeEach(() => {
      findMany.mockResolvedValue([
        {
          id: CP, name: "Etapa curta", initiativeId: INI,
          startDate: new Date("2026-09-01"), dueDate: new Date("2026-09-05"),
          members: [{ id: "m1" }], initiative: { members: [{ id: "m1" }] },
        },
        {
          id: OUTRO, name: "Etapa longa", initiativeId: INI,
          startDate: new Date("2026-09-01"), dueDate: new Date("2026-09-30"),
          members: [{ id: "m1" }], initiative: { members: [{ id: "m1" }] },
        },
      ]);
      updateMany.mockResolvedValue({ count: 2 });
      $transaction.mockResolvedValue([{ count: 2 }]);
    });

    it("só o início: recusa tudo se algum ficaria fora de ordem, e nomeia quem", async () => {
      const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");
      const res = await bulkUpdateCheckpoints({ ids: [CP, OUTRO], startDate: "2026-09-10" });
      expect(res.success).toBe(false);
      expect(!res.success && res.error).toMatch(/"Etapa curta"/);
      expect(!res.success && res.error).not.toMatch(/Etapa longa/);
      expect(updateMany).not.toHaveBeenCalled();
      expect($transaction).not.toHaveBeenCalled();
    });

    it("só o início, em ordem para todos: aplica", async () => {
      const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");
      const res = await bulkUpdateCheckpoints({ ids: [CP, OUTRO], startDate: "2026-09-02" });
      expect(res.success).toBe(true);
    });

    it("as duas datas juntas e invertidas: recusa pelo schema", async () => {
      const { bulkUpdateCheckpoints } = await import("./initiative-checkpoints");
      const res = await bulkUpdateCheckpoints({ ids: [CP], startDate: "2026-09-20", dueDate: "2026-09-10" });
      expect(res.success).toBe(false);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});

describe("createCheckpoint — quem responde pelo ramo cria subcheckpoint", () => {
  // Caso real: a Bia era responsável pelo checkpoint "Take over das paginas
  // INK", mas não pela iniciativa. Editava o próprio checkpoint e não conseguia
  // criar um sub dentro dele ("Permissão negada").
  const PAI = "44444444-4444-4444-8444-444444444444";
  const AVO = "55555555-5555-4555-8555-555555555555";

  async function donosPassados() {
    const { requireOwnershipPermission } = await import("@/lib/session");
    const chamadas = vi.mocked(requireOwnershipPermission).mock.calls;
    return chamadas[chamadas.length - 1][0];
  }

  it("sub: responsáveis do checkpoint pai entram como donos, além dos da iniciativa", async () => {
    findUnique.mockResolvedValueOnce({ initiativeId: INI, parentId: null, members: [{ id: "bia" }] });
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({ initiativeId: INI, parentId: PAI, name: "Estruturar pontos", dueDate: "2026-10-30" });
    expect(res.success).toBe(true);
    expect(await donosPassados()).toEqual(["m1", "bia"]);
  });

  it("sub-sub: vale também quem responde por um ancestral", async () => {
    findUnique
      .mockResolvedValueOnce({ initiativeId: INI, parentId: AVO, members: [{ id: "outra" }] })
      .mockResolvedValueOnce({ initiativeId: INI, parentId: null, members: [{ id: "bia" }] });
    const { createCheckpoint } = await import("./initiative-checkpoints");
    await createCheckpoint({ initiativeId: INI, parentId: PAI, name: "X", dueDate: "2026-10-30" });
    expect(await donosPassados()).toEqual(["m1", "outra", "bia"]);
  });

  it("checkpoint de topo: só os responsáveis da iniciativa, como antes", async () => {
    const { createCheckpoint } = await import("./initiative-checkpoints");
    await createCheckpoint({ initiativeId: INI, name: "X", dueDate: "2026-10-30" });
    expect(await donosPassados()).toEqual(["m1"]);
  });

  it("pai de outra iniciativa (request forjado) é recusado sem gravar", async () => {
    findUnique.mockResolvedValueOnce({ initiativeId: "outra-iniciativa", parentId: null, members: [{ id: "bia" }] });
    const { createCheckpoint } = await import("./initiative-checkpoints");
    const res = await createCheckpoint({ initiativeId: INI, parentId: PAI, name: "X", dueDate: "2026-10-30" });
    expect(res).toEqual({ success: false, error: "Checkpoint pai não encontrado." });
    expect(create).not.toHaveBeenCalled();
  });
});
