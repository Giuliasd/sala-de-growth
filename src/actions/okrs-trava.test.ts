import { describe, expect, it, vi } from "vitest";

/**
 * deleteOKRUpdate recalcula e regrava o currentValue do KR a partir do
 * histórico. Os outros três escritores do KR travam a linha (travarKR) antes de
 * ler; este não travava, e um lançamento gravado no meio era sobrescrito
 * (achado da auditoria de 13/11/2026 — bug de concorrência, não de permissão).
 * O teste fixa a ordem: trava primeiro, histórico depois.
 */

const ordem: string[] = [];

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  oKRUpdate: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
  oKR: { update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("@/lib/session", () => ({
  requireEditPermission: vi.fn().mockResolvedValue({ id: "autor", role: "COLABORADOR" }),
  hasOwnershipAccess: vi.fn().mockReturnValue(false),
  getCurrentMember: vi.fn(),
  requireOwnershipPermission: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/notificacoes-db", () => ({ notificarResponsaveis: vi.fn(), responsaveisAtuais: vi.fn() }));

import { deleteOKRUpdate } from "./okrs";

describe("deleteOKRUpdate — trava do KR", () => {
  it("trava a linha do KR antes de ler o histórico que recalcula o valor", async () => {
    tx.$queryRaw.mockImplementation(async () => {
      ordem.push("trava");
      return [];
    });
    tx.oKRUpdate.findUnique.mockResolvedValue({
      id: "u1",
      okrId: "kr-1",
      memberId: "autor",
      previousValue: 10,
      okr: {
        id: "kr-1",
        measurementType: "ACUMULADO",
        targetValue: 100,
        initialValue: 0,
        currentValue: 20,
        members: [],
      },
    });
    tx.oKRUpdate.findMany.mockImplementation(async () => {
      ordem.push("historico");
      return [{ id: "u1", newValue: 20, date: new Date() }];
    });

    const r = await deleteOKRUpdate("u1");

    expect(r.success).toBe(true);
    expect(ordem).toEqual(["trava", "historico"]);
    // A trava é na linha do KR certo.
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual(["kr-1"]);
  });
});
