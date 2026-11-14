import { beforeEach, describe, expect, it, vi } from "vitest";

const { count } = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { registroSemanal: { count } },
  withDbRetry: (fn: () => unknown) => fn(),
}));
// Sem vigências gravadas: vale o padrão (fecha sexta 14:59 de São Paulo).
vi.mock("@/lib/horario-do-ritual-db", () => ({ lerVigenciasDoRitual: vi.fn(async () => []) }));

import { semanaFechadaParaEdicao } from "./registro-semanal-db";
import { janelaDoRitual } from "./date-utils";

const SEGUNDA = new Date("2026-11-02T00:00:00Z");
const FECHA = janelaDoRitual(SEGUNDA).fecha;

describe("semanaFechadaParaEdicao", () => {
  beforeEach(() => count.mockReset());

  it("antes do fechamento: aberta, sem nem consultar o registro", async () => {
    const r = await semanaFechadaParaEdicao(SEGUNDA, new Date(FECHA.getTime() - 1));
    expect(r).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("depois do fechamento, com registro: fechada (mesmo antes do congelamento preguiçoso)", async () => {
    count.mockResolvedValue(3);
    await expect(semanaFechadaParaEdicao(SEGUNDA, FECHA)).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({ where: { weekStart: SEGUNDA } });
  });

  it("depois do fechamento, sem registro: segue editável, como na tela", async () => {
    count.mockResolvedValue(0);
    await expect(semanaFechadaParaEdicao(SEGUNDA, new Date(FECHA.getTime() + 86_400_000))).resolves.toBe(false);
  });
});
