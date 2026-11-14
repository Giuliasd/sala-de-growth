import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aviso "Fique ligado" e foco da semana: semana fechada não se edita, nem por
 * chamada direta à action (antes a trava era só o `podeEditar` da tela).
 * Achado da auditoria de segurança de 13/11/2026.
 */

const { avisoUpsert, focoCreate, focoDelete, semanaFechada } = vi.hoisted(() => ({
  avisoUpsert: vi.fn(),
  focoCreate: vi.fn(),
  focoDelete: vi.fn(),
  semanaFechada: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weeklyAviso: { upsert: avisoUpsert, findFirst: vi.fn() },
    weeklyFocus: { findFirst: vi.fn(async () => null), create: focoCreate, delete: focoDelete, findMany: vi.fn() },
    acao: { findUnique: vi.fn() },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn(),
  requireEditPermission: vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "COLABORADOR" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/registro-semanal-db", () => ({
  semanaFechadaParaEdicao: (w: Date) => semanaFechada(w),
  ERRO_SEMANA_FECHADA: "Esta semana já fechou.",
}));

import { salvarAvisoDaSemana } from "./weekly-aviso";
import { toggleWeeklyFocus } from "./weekly-focus";

const EU = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aviso da semana", () => {
  it("semana fechada: recusa e não grava", async () => {
    semanaFechada.mockResolvedValue(true);
    const r = await salvarAvisoDaSemana({ weekOf: "2026-11-02", content: "reescrito" });
    expect(r).toMatchObject({ success: false, error: "Esta semana já fechou." });
    expect(avisoUpsert).not.toHaveBeenCalled();
    // A checagem é na segunda-feira canônica da semana pedida.
    expect(semanaFechada.mock.calls[0][0].toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("semana aberta: grava", async () => {
    semanaFechada.mockResolvedValue(false);
    const r = await salvarAvisoDaSemana({ weekOf: "2026-11-11", content: "recado" });
    expect(r.success).toBe(true);
    expect(avisoUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("foco da semana", () => {
  it("semana fechada: recusa marcar e desmarcar", async () => {
    semanaFechada.mockResolvedValue(true);
    const r = await toggleWeeklyFocus({ weekOf: "2026-11-02", memberId: EU, itemId: ITEM, kind: "iniciativa" });
    expect(r).toMatchObject({ success: false, error: "Esta semana já fechou." });
    expect(focoCreate).not.toHaveBeenCalled();
    expect(focoDelete).not.toHaveBeenCalled();
  });

  it("semana aberta: marca", async () => {
    semanaFechada.mockResolvedValue(false);
    const r = await toggleWeeklyFocus({ weekOf: "2026-11-09", memberId: EU, itemId: ITEM, kind: "iniciativa" });
    expect(r).toMatchObject({ success: true, data: { marcado: true } });
  });
});
