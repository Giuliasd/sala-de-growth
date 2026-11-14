import { describe, expect, it } from "vitest";
import { aplicarCoberturaDosPais, planejarCoberturaDosPais } from "./checkpoint-cobertura";

/**
 * O que estes testes protegem: o pai engloba o filho que mudou, esticando a
 * cadeia inteira, sem nunca encolher ninguém — e sem corrigir de carona o
 * que já existia fora de regra.
 */

const cp = (id: string, parentId: string | null, startDate: string | null, dueDate: string) => ({
  id,
  parentId,
  startDate,
  dueDate,
});
const d = (s: string) => new Date(s);

describe("planejarCoberturaDosPais", () => {
  it("não mexe em pai que já engloba o filho", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, "2026-10-01", "2026-10-31"), cp("f", "p", "2026-10-05", "2026-10-20")],
        ["f"]
      )
    ).toEqual([]);
  });

  it("estica o prazo do pai até o fim do filho", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, "2026-10-01", "2026-10-15"), cp("f", "p", "2026-10-05", "2026-10-20")],
        ["f"]
      )
    ).toEqual([{ id: "p", startDate: d("2026-10-01"), dueDate: d("2026-10-20") }]);
  });

  it("puxa o início do pai para o início do filho", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, "2026-10-10", "2026-10-31"), cp("f", "p", "2026-10-01", "2026-10-20")],
        ["f"]
      )
    ).toEqual([{ id: "p", startDate: d("2026-10-01"), dueDate: d("2026-10-31") }]);
  });

  it("filho sem início conta como o próprio prazo", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, "2026-10-10", "2026-10-31"), cp("f", "p", null, "2026-11-05")],
        ["f"]
      )
    ).toEqual([{ id: "p", startDate: d("2026-10-10"), dueDate: d("2026-11-05") }]);
  });

  it("pai sem início que cresce ganha o prazo antigo como início", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, null, "2026-10-10"), cp("f", "p", "2026-10-10", "2026-10-20")],
        ["f"]
      )
    ).toEqual([{ id: "p", startDate: d("2026-10-10"), dueDate: d("2026-10-20") }]);
  });

  it("propaga pela cadeia até o avô", () => {
    const ajustes = planejarCoberturaDosPais(
      [
        cp("avo", null, "2026-10-01", "2026-10-10"),
        cp("pai", "avo", "2026-10-02", "2026-10-09"),
        cp("neto", "pai", "2026-10-03", "2026-12-01"),
      ],
      ["neto"]
    );
    expect(ajustes).toEqual([
      { id: "pai", startDate: d("2026-10-02"), dueDate: d("2026-12-01") },
      { id: "avo", startDate: d("2026-10-01"), dueDate: d("2026-12-01") },
    ]);
  });

  it("nunca encolhe o pai", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, "2026-09-01", "2026-12-31"), cp("f", "p", "2026-10-01", "2026-10-02")],
        ["f"]
      )
    ).toEqual([]);
  });

  it("não corrige de carona o irmão que já estava fora do pai", () => {
    // `antigo` já passava do pai antes da regra; quem mudou foi `novo`.
    expect(
      planejarCoberturaDosPais(
        [
          cp("p", null, "2026-10-01", "2026-10-15"),
          cp("antigo", "p", "2026-10-01", "2026-12-31"),
          cp("novo", "p", "2026-10-02", "2026-10-20"),
        ],
        ["novo"]
      )
    ).toEqual([{ id: "p", startDate: d("2026-10-01"), dueDate: d("2026-10-20") }]);
  });

  it("não mexe em nada quando nada mudou", () => {
    expect(
      planejarCoberturaDosPais(
        [cp("p", null, "2026-10-01", "2026-10-15"), cp("f", "p", "2026-10-05", "2026-12-20")],
        []
      )
    ).toEqual([]);
  });

  it("ciclo não trava", () => {
    expect(() =>
      planejarCoberturaDosPais(
        [cp("a", "b", "2026-10-01", "2026-10-02"), cp("b", "a", "2026-10-05", "2026-10-06")],
        ["a", "b"]
      )
    ).not.toThrow();
  });
});

describe("aplicarCoberturaDosPais", () => {
  it("devolve a mesma lista quando nada muda", () => {
    const itens = [cp("p", null, "2026-10-01", "2026-10-31"), cp("f", "p", null, "2026-10-05")];
    expect(aplicarCoberturaDosPais(itens, ["f"])).toBe(itens);
  });

  it("mantém o formato de string das datas", () => {
    const [pai] = aplicarCoberturaDosPais(
      [cp("p", null, "2026-10-01", "2026-10-15"), cp("f", "p", "2026-10-05", "2026-10-20")],
      ["f"]
    );
    expect(pai).toMatchObject({ startDate: "2026-10-01", dueDate: "2026-10-20" });
  });
});
