import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As tags entram na foto da semana. Renomear ou excluir tag sem congelar antes
 * a semana vencida fazia a foto da semana passada sair com o nome novo (achado
 * da auditoria de 13/11/2026). Regra do AGENTS.md: congelar ANTES de gravar.
 */

const { ordem, tag } = vi.hoisted(() => ({
  ordem: [] as string[],
  tag: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    checkpointTag: tag,
    iniciativa: { findUnique: vi.fn(async () => ({ members: [{ id: "m1" }] })) },
  },
}));
vi.mock("@/lib/session", () => ({
  requireEditPermission: vi.fn(async () => ({ id: "m1", role: "COLABORADOR" })),
  requireOwnershipPermission: vi.fn(async () => ({ id: "m1", role: "COLABORADOR" })),
}));
vi.mock("@/lib/historico-db", () => ({ registrarEvento: vi.fn(), registrarEventos: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/registro-semanal-db", () => ({
  antesDeMexerNoItem: vi.fn(async (kind: string, id: string) => {
    ordem.push(`congela:${kind}:${id}`);
  }),
}));

import { deleteCheckpointTag, updateCheckpointTag } from "./checkpoint-tags";

const TAG = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  ordem.length = 0;
  tag.findUnique.mockResolvedValue({ iniciativaId: ITEM, experimentoId: null, name: "Antigo", color: "sage" });
  tag.findFirst.mockResolvedValue(null);
  tag.update.mockImplementation(async () => ordem.push("grava"));
  tag.delete.mockImplementation(async () => ordem.push("grava"));
});

describe("tags de checkpoint e a foto da semana", () => {
  it("renomear congela a semana do item antes de gravar", async () => {
    const r = await updateCheckpointTag({ id: TAG, name: "Novo" });
    expect(r.success).toBe(true);
    expect(ordem).toEqual([`congela:iniciativa:${ITEM}`, "grava"]);
  });

  it("excluir congela a semana do item antes de gravar", async () => {
    const r = await deleteCheckpointTag(TAG);
    expect(r.success).toBe(true);
    expect(ordem).toEqual([`congela:iniciativa:${ITEM}`, "grava"]);
  });
});
