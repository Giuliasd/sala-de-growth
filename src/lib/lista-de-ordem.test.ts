import { describe, expect, it, vi } from "vitest";
import {
  ERRO_LISTA_GRANDE,
  ERRO_LISTA_REPETIDA,
  MAX_ITENS_NA_ORDEM,
  erroNaListaDeOrdem,
} from "./lista-de-ordem";

const NAO_ACHOU = "Checkpoint não encontrado.";

describe("erroNaListaDeOrdem", () => {
  it("aceita lista sem repetidos, toda do item", async () => {
    const contar = vi.fn(async (ids: string[]) => ids.length);
    await expect(erroNaListaDeOrdem(["a", "b", "c"], contar, NAO_ACHOU)).resolves.toBeNull();
    expect(contar).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("recusa o mesmo id repetido — antes passava e virava N UPDATEs", async () => {
    const contar = vi.fn(async () => 1);
    const ids = Array.from({ length: 20 }, () => "a");
    await expect(erroNaListaDeOrdem(ids, contar, NAO_ACHOU)).resolves.toBe(ERRO_LISTA_REPETIDA);
    expect(contar).not.toHaveBeenCalled();
  });

  it("recusa lista acima do teto sem ir ao banco", async () => {
    const contar = vi.fn(async () => 0);
    const ids = Array.from({ length: MAX_ITENS_NA_ORDEM + 1 }, (_, i) => `id-${i}`);
    await expect(erroNaListaDeOrdem(ids, contar, NAO_ACHOU)).resolves.toBe(ERRO_LISTA_GRANDE);
    expect(contar).not.toHaveBeenCalled();
  });

  it("recusa id que não é do item", async () => {
    await expect(erroNaListaDeOrdem(["a", "x"], async () => 1, NAO_ACHOU)).resolves.toBe(NAO_ACHOU);
  });

  it("lista vazia é válida (pai sem outros filhos)", async () => {
    const contar = vi.fn();
    await expect(erroNaListaDeOrdem([], contar, NAO_ACHOU)).resolves.toBeNull();
    expect(contar).not.toHaveBeenCalled();
  });
});
