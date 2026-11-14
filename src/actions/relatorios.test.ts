import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Achado da auditoria de segurança (13/11/2026): o Relatório do quarter é aberto
 * a qualquer membro (VISITANTE incluso) e devolvia o e-mail de todo o time em
 * `membros[].email`. E-mail é contato da liderança (getTeamMembersComContato);
 * o resto do app já tinha tirado o campo de todas as telas.
 */

const prismaMock = vi.hoisted(() => ({
  oKR: { findMany: vi.fn() },
  iniciativa: { findMany: vi.fn() },
  experimento: { findMany: vi.fn() },
  ausencia: { findMany: vi.fn() },
  teamMember: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn().mockResolvedValue({
    id: "v1",
    name: "Visitante",
    email: "v@example.test",
    role: "VISITANTE",
  }),
}));
vi.mock("@/lib/quarters-cache", () => ({
  findQuarterCached: vi.fn().mockResolvedValue({
    id: "q1",
    year: 2026,
    quarter: 4,
    startDate: new Date("2026-10-01T00:00:00Z"),
    endDate: new Date("2026-12-31T23:59:59Z"),
    isActive: true,
  }),
}));

import { getQuarterReport } from "./relatorios";

describe("getQuarterReport — e-mail de membros", () => {
  beforeEach(() => {
    prismaMock.oKR.findMany.mockResolvedValue([]);
    prismaMock.iniciativa.findMany.mockResolvedValue([]);
    prismaMock.experimento.findMany.mockResolvedValue([]);
    prismaMock.ausencia.findMany.mockResolvedValue([]);
    // Devolve só o que foi pedido no select — como o Prisma faz.
    prismaMock.teamMember.findMany.mockImplementation(async ({ select }: any) =>
      [{ id: "m2", name: "Ana", email: "ana@example.test", role: "COLABORADOR" }].map((row) =>
        Object.fromEntries(Object.entries(row).filter(([k]) => select[k])),
      ),
    );
  });

  it("não consulta o e-mail no banco", async () => {
    await getQuarterReport("q1");
    const { select } = prismaMock.teamMember.findMany.mock.calls[0][0];
    expect(select.email).toBeUndefined();
  });

  it("não devolve e-mail para quem chama (VISITANTE)", async () => {
    const report = await getQuarterReport("q1");
    expect(report.membros).toHaveLength(1);
    expect(report.membros[0]).not.toHaveProperty("email");
    expect(JSON.stringify(report)).not.toContain("ana@example.test");
  });
});
