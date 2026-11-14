import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { teamMember: { findMany } } }));

import { chaveDoNome, nomeEmUso } from "./nome-membro";
import { extrairMencoes } from "./notificacoes";

describe("chaveDoNome", () => {
  it("ignora acento, caixa e espaços repetidos — como as menções", () => {
    expect(chaveDoNome("  Ána   SOUZA ")).toBe("ana souza");
    expect(chaveDoNome("Ana Souza")).toBe(chaveDoNome("ANA  SÓUZA"));
  });

  it("dois nomes com a mesma chave são a mesma menção", () => {
    // Por isso a chave tem de ser única: só um dos dois recebe a menção.
    const ids = extrairMencoes("oi @Ana Souza", [
      { id: "impostor", name: "ANA SÓUZA" },
      { id: "ana", name: "Ana Souza" },
    ]);
    expect(ids).toHaveLength(1);
  });
});

describe("nomeEmUso", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("acusa colisão com outro membro ativo, mesmo com acento/caixa diferentes", async () => {
    findMany.mockResolvedValue([{ name: "Ana Souza" }]);
    await expect(nomeEmUso("ANA SÓUZA", "eu")).resolves.toBe(true);
  });

  it("libera nome diferente", async () => {
    findMany.mockResolvedValue([{ name: "Ana Souza" }]);
    await expect(nomeEmUso("Ana Paula Souza", "eu")).resolves.toBe(false);
  });

  it("consulta só ativos e exclui o próprio membro (renomear para o mesmo nome vale)", async () => {
    findMany.mockResolvedValue([]);
    await nomeEmUso("Qualquer", "eu");
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true, id: { not: "eu" } },
      select: { name: true },
    });
  });
});
