import { afterEach, describe, expect, it, vi } from "vitest";
import { safeHttpUrl } from "@/lib/url";

/**
 * Limites de tamanho nos textos: um nome de 1 MB enviado direto para a action
 * (as actions são chamáveis do cliente) não pode ir para o banco nem quebrar as
 * telas que mostram o texto inteiro.
 */
const iniciativaCreate = vi.fn(async () => ({ id: "novo" }));
vi.mock("@/lib/prisma", () => ({
  prisma: { iniciativa: { create: iniciativaCreate } },
  withDbRetry: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn(),
  hasOwnershipAccess: vi.fn(),
  requireEditPermission: vi.fn(async () => ({ id: "m1", role: "LIDERANCA" })),
  requireOwnershipPermission: vi.fn(),
}));
vi.mock("@/lib/quarters-cache", () => ({ findQuarterCached: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/registro-semanal-db", () => ({ antesDeMexerNoItem: vi.fn(async () => {}) }));
vi.mock("@/lib/historico-db", () => ({
  fotoAntes: vi.fn(), registrarMudancas: vi.fn(), registrarEvento: vi.fn(async () => {}),
}));
vi.mock("@/lib/notificacoes-db", () => ({
  notificarResponsaveis: vi.fn(async () => {}),
  notificarResponsaveisEmLote: vi.fn(), notificarConversao: vi.fn(), responsaveisAtuais: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const UUID = "3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b";
const base = { quarterId: UUID, frenteId: UUID, status: "BACKLOG", priority: "MEDIA" };

describe("limites de tamanho", () => {
  it("nome de iniciativa com mais de 200 caracteres é recusado antes do banco", async () => {
    const { createIniciativa } = await import("./iniciativas");

    const r = await createIniciativa({ ...base, name: "x".repeat(201) } as never);

    expect(r).toEqual({ success: false, error: "O nome é muito longo." });
    expect(iniciativaCreate).not.toHaveBeenCalled();
  });

  it("200 caracteres ainda passa", async () => {
    const { createIniciativa } = await import("./iniciativas");
    const r = await createIniciativa({ ...base, name: "x".repeat(200) } as never);
    expect(r.success).toBe(true);
  });

  it("URL gigante é recusada; URL normal passa", () => {
    expect(safeHttpUrl.safeParse(`https://x.com/${"a".repeat(2100)}`).success).toBe(false);
    expect(safeHttpUrl.safeParse("https://docs.google.com/d/abc").success).toBe(true);
  });
});
