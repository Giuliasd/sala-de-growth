import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { editavelPorTeclado } from "./InlineEdit";

// A área de edição inline era um <div onClick>: sem papel, sem foco e sem
// Enter/Espaço. O contrato abaixo é o que a torna operável por teclado.
function tecla(key: string, alvoIgualAoAtual = true) {
  const preventDefault = vi.fn();
  const el = {};
  return {
    e: { key, target: alvoIgualAoAtual ? el : {}, currentTarget: el, preventDefault } as unknown as KeyboardEvent,
    preventDefault,
  };
}

describe("editavelPorTeclado", () => {
  it("expõe papel de botão, foco por Tab e o rótulo", () => {
    const props = editavelPorTeclado(() => {}, "Editar: Nome");
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props["aria-label"]).toBe("Editar: Nome");
  });

  it("Enter e Espaço ativam a edição (e não rolam a página)", () => {
    const ativar = vi.fn();
    const { onKeyDown } = editavelPorTeclado(ativar);
    for (const key of ["Enter", " "]) {
      const { e, preventDefault } = tecla(key);
      onKeyDown(e);
      expect(preventDefault).toHaveBeenCalled();
    }
    expect(ativar).toHaveBeenCalledTimes(2);
  });

  it("outras teclas não fazem nada", () => {
    const ativar = vi.fn();
    const { onKeyDown } = editavelPorTeclado(ativar);
    onKeyDown(tecla("a").e);
    onKeyDown(tecla("Tab").e);
    expect(ativar).not.toHaveBeenCalled();
  });

  it("ignora a tecla vinda de um elemento DENTRO da área (link, botão)", () => {
    const ativar = vi.fn();
    const { onKeyDown } = editavelPorTeclado(ativar);
    onKeyDown(tecla("Enter", false).e);
    expect(ativar).not.toHaveBeenCalled();
  });

  it("o clique continua ativando", () => {
    const ativar = vi.fn();
    editavelPorTeclado(ativar).onClick();
    expect(ativar).toHaveBeenCalledOnce();
  });
});
