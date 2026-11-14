import { afterEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { historicoItem: { findMany } } }));
const getCurrentMember = vi.fn();
vi.mock("@/lib/session", () => ({ getCurrentMember }));

afterEach(() => vi.clearAllMocks());

const ITEM = "11111111-1111-4111-8111-111111111111";

function linha(i: number, quando: string, campo = "status") {
  return {
    id: `l${i}`,
    campo,
    de: "Backlog",
    para: "Em andamento",
    detalhe: null,
    createdAt: new Date(quando),
    ator: { name: "Ana" },
  };
}

describe("getHistoricoDoItem", () => {
  it("exige sessão: sem ela, não consulta o banco", async () => {
    getCurrentMember.mockRejectedValue(new Error("Usuário não autenticado."));
    const { getHistoricoDoItem } = await import("./historico");
    const r = await getHistoricoDoItem({ entidade: "iniciativa", id: ITEM });
    expect(r.success).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("id inválido é recusado antes do banco", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    const { getHistoricoDoItem } = await import("./historico");
    const r = await getHistoricoDoItem({ entidade: "iniciativa", id: "nao-e-uuid" });
    expect(r.success).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("devolve texto legível, autor e instante; consulta só o item pedido, do mais recente", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    findMany.mockResolvedValue([linha(1, "2026-11-10T15:00:00Z")]);
    const { getHistoricoDoItem } = await import("./historico");

    const r = await getHistoricoDoItem({ entidade: "experimento", id: ITEM });

    expect(r).toEqual({
      success: true,
      data: {
        proximo: null,
        eventos: [{ id: "l1", quando: "2026-11-10T15:00:00.000Z", ator: "Ana", texto: "Status: Backlog → Em andamento" }],
      },
    });
    const args = findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ entidade: "EXPERIMENTO", entidadeId: ITEM });
    expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
  });

  it("a página nunca corta uma edição ao meio: o grupo que atravessa o limite vai inteiro para a próxima", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    // 38 edições de uma linha (instantes distintos) + uma edição de 3 linhas que atravessa o limite (40).
    const unicas = Array.from({ length: 38 }, (_, i) =>
      linha(i, new Date(Date.UTC(2026, 10, 10, 15, 59 - i)).toISOString())
    );
    const grupo = ["a", "b", "c"].map((x, i) => linha(100 + i, "2026-11-10T14:00:00Z", x === "a" ? "nome" : "status"));
    findMany.mockResolvedValue([...unicas, ...grupo]); // 41 linhas: o limite é 40
    const { getHistoricoDoItem } = await import("./historico");

    const r = await getHistoricoDoItem({ entidade: "iniciativa", id: ITEM });

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.eventos).toHaveLength(38); // o grupo de 3 ficou para a próxima página
    expect(r.data.eventos.some((e) => ["l100", "l101", "l102"].includes(e.id))).toBe(false);
    // O cursor é o instante da última edição inteira; a próxima busca (< cursor) traz o grupo todo.
    expect(r.data.proximo).toBe(unicas[37].createdAt.toISOString());
  });

  it("cursor vira filtro 'anterior a'", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    findMany.mockResolvedValue([]);
    const { getHistoricoDoItem } = await import("./historico");

    await getHistoricoDoItem({ entidade: "iniciativa", id: ITEM, antesDe: "2026-11-10T14:00:00.000Z" });

    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ lt: new Date("2026-11-10T14:00:00.000Z") });
  });

  it("falha de banco vira erro genérico (sem texto interno)", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    findMany.mockRejectedValue(new Error("relation HistoricoItem does not exist"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getHistoricoDoItem } = await import("./historico");

    const r = await getHistoricoDoItem({ entidade: "iniciativa", id: ITEM });

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).not.toMatch(/relation/);
    spy.mockRestore();
  });
});
