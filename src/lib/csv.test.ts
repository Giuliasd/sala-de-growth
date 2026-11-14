import { describe, expect, it } from "vitest";
import { celulaCsv, diaPtBr, montarCsv, nomeDoArquivoCsv } from "./csv";

describe("celulaCsv", () => {
  it("texto simples passa como está; null e undefined viram vazio", () => {
    expect(celulaCsv("Relatório Q3")).toBe("Relatório Q3");
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(undefined)).toBe("");
  });

  it("separador, aspas e quebra de linha vão entre aspas (aspas duplicadas)", () => {
    expect(celulaCsv("a;b")).toBe('"a;b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("neutraliza injeção de fórmula em texto digitado por usuário", () => {
    expect(celulaCsv("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celulaCsv("+1+1")).toBe("'+1+1");
    expect(celulaCsv("-2+3")).toBe("'-2+3");
    expect(celulaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celulaCsv("\t=1")).toBe("'\t=1");
  });

  it("também neutraliza fórmula com espaço na frente", () => {
    expect(celulaCsv(" =1+1")).toBe("' =1+1");
    expect(celulaCsv("   @SUM(A1)")).toBe("'   @SUM(A1)");
    // Texto comum com espaço na frente não muda.
    expect(celulaCsv(" texto")).toBe(" texto");
  });

  it("número de verdade não ganha apóstrofo (nem o negativo)", () => {
    expect(celulaCsv(-5)).toBe("-5");
    expect(celulaCsv(3.5)).toBe("3.5");
  });
});

describe("montarCsv", () => {
  it("BOM UTF-8, separador ; e fim de linha CRLF", () => {
    const csv = montarCsv(["Nome", "Status"], [["A", "Ativo"], ["B;C", "Pausado"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Nome;Status\r\nA;Ativo\r\n"B;C";Pausado\r\n');
  });

  it("sem linhas, devolve só o cabeçalho", () => {
    expect(montarCsv(["A", "B"], [])).toBe("﻿A;B\r\n");
  });
});

describe("diaPtBr", () => {
  it("formata em UTC, sem voltar um dia por fuso", () => {
    expect(diaPtBr(new Date("2026-11-09T00:00:00.000Z"))).toBe("09/11/2026");
    expect(diaPtBr("2026-01-31T00:00:00.000Z")).toBe("31/01/2026");
  });

  it("vazio e inválido viram string vazia", () => {
    expect(diaPtBr(null)).toBe("");
    expect(diaPtBr("não é data")).toBe("");
  });
});

describe("nomeDoArquivoCsv", () => {
  it("sem acento, em minúsculas, com a data", () => {
    expect(nomeDoArquivoCsv("Iniciativas Q3", new Date("2026-11-09T12:00:00Z"))).toBe("iniciativas-q3-2026-11-09.csv");
  });
});
