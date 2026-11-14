import { describe, it, expect, beforeEach } from "vitest";
import { desfazerUltima, registrarEdicao, temUndo } from "./undo";

// A pilha é estado de módulo: cada teste esvazia o que sobrou do anterior.
async function esvaziar() {
  while (temUndo()) await desfazerUltima();
}

beforeEach(esvaziar);

describe("pilha de desfazer", () => {
  it("desfaz a última edição e devolve o rótulo", async () => {
    const aplicados: string[] = [];
    registrarEdicao("status", () => {
      aplicados.push("status anterior");
    });

    expect(temUndo()).toBe(true);
    await expect(desfazerUltima()).resolves.toBe("status");
    expect(aplicados).toEqual(["status anterior"]);
    expect(temUndo()).toBe(false);
  });

  it("volta na ordem inversa (LIFO)", async () => {
    const ordem: string[] = [];
    registrarEdicao("primeira", () => {
      ordem.push("primeira");
    });
    registrarEdicao("segunda", () => {
      ordem.push("segunda");
    });

    await desfazerUltima();
    await desfazerUltima();

    expect(ordem).toEqual(["segunda", "primeira"]);
  });

  it("sem nada na pilha, devolve null em vez de estourar", async () => {
    await expect(desfazerUltima()).resolves.toBeNull();
  });

  it("a reversão não entra na pilha — senão o Ctrl+Z seguinte refaria a edição", async () => {
    // É o caso do ping-pong: reverter chama o mesmo caminho de salvar, que
    // registraria de novo se o módulo não se protegesse.
    registrarEdicao("status", () => {
      registrarEdicao("status", () => {
        throw new Error("a reversão foi registrada como nova edição");
      });
    });

    await desfazerUltima();
    expect(temUndo()).toBe(false);
  });

  it("aguarda reversão assíncrona antes de dar por desfeito", async () => {
    let gravou = false;
    registrarEdicao("prazo", async () => {
      await new Promise((r) => setTimeout(r, 10));
      gravou = true;
    });

    await desfazerUltima();
    expect(gravou).toBe(true);
  });

  it("reversão que falha não volta para a pilha", async () => {
    registrarEdicao("prazo", () => {
      throw new Error("banco fora");
    });

    await expect(desfazerUltima()).rejects.toThrow("banco fora");
    // Repetir o Ctrl+Z repetiria o mesmo erro; a entrada sai de cena.
    expect(temUndo()).toBe(false);
  });

  it("guarda no máximo 20 edições, descartando as mais antigas", async () => {
    const desfeitas: number[] = [];
    for (let i = 1; i <= 25; i++) {
      registrarEdicao(String(i), () => {
        desfeitas.push(i);
      });
    }

    const rotulos: string[] = [];
    while (temUndo()) {
      const r = await desfazerUltima();
      if (r) rotulos.push(r);
    }

    expect(rotulos).toHaveLength(20);
    expect(rotulos[0]).toBe("25");
    // As cinco primeiras caíram fora do teto.
    expect(rotulos.at(-1)).toBe("6");
  });
});
