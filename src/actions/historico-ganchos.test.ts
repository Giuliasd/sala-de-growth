import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Os ganchos do histórico nas actions. O que importa fixar:
 *  - a foto de ANTES é tirada antes de gravar, e o registro vem DEPOIS;
 *  - quem registra é o membro que passou pelo gate de permissão;
 *  - se a gravação falha, nada é registrado (não existe mudança a contar);
 *  - excluir e criar viram eventos avulsos.
 */
const ordem: string[] = [];

const iniciativaUpdate = vi.fn(async () => {
  ordem.push("grava");
  return { id: "i1" };
});
const iniciativaCreate = vi.fn(async () => ({ id: "novo" }));

vi.mock("@/lib/registro-semanal-db", () => ({ antesDeMexerNoItem: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { iniciativa: { update: iniciativaUpdate, create: iniciativaCreate } },
}));

const membro = { id: "membro-1", role: "COLABORADOR" };
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn(),
  hasOwnershipAccess: vi.fn(),
  requireEditPermission: vi.fn(async () => membro),
  requireOwnershipPermission: vi.fn(async () => membro),
}));
vi.mock("@/lib/quarters-cache", () => ({ findQuarterCached: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

const fotoAntes = vi.fn(async () => {
  ordem.push("foto-antes");
  return { status: "Backlog" };
});
const registrarMudancas = vi.fn(async () => {
  ordem.push("registra");
  return [];
});
const registrarEvento = vi.fn(async () => {});
vi.mock("@/lib/historico-db", () => ({ fotoAntes, registrarMudancas, registrarEvento }));

// O gate de posse consulta o item; devolve um item com um responsável.
vi.mock("@/lib/prisma-gate", () => ({}));

afterEach(() => {
  vi.clearAllMocks();
  ordem.length = 0;
});

describe("updateIniciativaStatus — histórico", () => {
  it("foto antes → grava → registra, em nome de quem passou pelo gate", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.iniciativa as unknown as { findUnique: unknown }).findUnique = vi.fn().mockResolvedValue({
      members: [{ id: "membro-1" }],
    });
    const { updateIniciativaStatus } = await import("./iniciativas");

    const r = await updateIniciativaStatus("i1", "EM_ANDAMENTO" as never);

    expect(r.success).toBe(true);
    expect(ordem).toEqual(["foto-antes", "grava", "registra"]);
    expect(fotoAntes).toHaveBeenCalledWith("iniciativa", "i1");
    expect(registrarMudancas).toHaveBeenCalledWith("iniciativa", "i1", "membro-1", { status: "Backlog" });
  });

  it("se a gravação falha, nada é registrado", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.iniciativa as unknown as { findUnique: unknown }).findUnique = vi.fn().mockResolvedValue({
      members: [{ id: "membro-1" }],
    });
    iniciativaUpdate.mockRejectedValueOnce(new Error("falha de banco"));
    const { updateIniciativaStatus } = await import("./iniciativas");

    const r = await updateIniciativaStatus("i1", "EM_ANDAMENTO" as never);

    expect(r.success).toBe(false);
    expect(registrarMudancas).not.toHaveBeenCalled();
  });
});

describe("deleteIniciativa — histórico", () => {
  it("registra o evento de exclusão", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.iniciativa as unknown as { findUnique: unknown }).findUnique = vi.fn().mockResolvedValue({
      members: [{ id: "membro-1" }],
    });
    const { deleteIniciativa } = await import("./iniciativas");

    const r = await deleteIniciativa("i1");

    expect(r.success).toBe(true);
    expect(registrarEvento).toHaveBeenCalledWith("iniciativa", "i1", "membro-1", {
      campo: "excluido",
      de: null,
      para: null,
    });
  });
});
