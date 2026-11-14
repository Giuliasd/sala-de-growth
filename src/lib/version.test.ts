import { describe, expect, it } from "vitest";
import {
  UNKNOWN,
  formatBuildLabel,
  normalizeBuiltAt,
  resolveBuildInfo,
  shortenCommit,
} from "./version";

describe("shortenCommit", () => {
  it("corta um SHA completo em 7 caracteres", () => {
    expect(shortenCommit("50f4706270772d23ed6724b713f9146a07667c57")).toBe("50f4706");
  });

  it("aceita um SHA já curto", () => {
    expect(shortenCommit("50f4706")).toBe("50f4706");
  });

  it("normaliza para minúsculas", () => {
    expect(shortenCommit("50F4706270772D23ED6724B713F9146A07667C57")).toBe("50f4706");
  });

  it("ignora whitespace ao redor (o `git rev-parse` devolve com \\n)", () => {
    expect(shortenCommit("  50f4706270772d23ed6724b713f9146a07667c57\n")).toBe("50f4706");
  });

  describe("devolve UNKNOWN quando não há SHA confiável", () => {
    const invalid: Array<string | undefined | null> = [
      undefined,
      null,
      "",
      "   ",
      // Curto demais para ser um SHA — exibir isso passaria por commit real.
      "50f470",
      // Não-hexadecimal: valor de build veio errado.
      "not-a-sha",
      "HEAD",
      "v1.0.0",
      // Longo demais.
      "50f4706270772d23ed6724b713f9146a07667c570",
    ];

    for (const value of invalid) {
      it(`rejeita ${JSON.stringify(value)}`, () => {
        expect(shortenCommit(value)).toBe(UNKNOWN);
      });
    }
  });
});

describe("normalizeBuiltAt", () => {
  it("preserva um ISO 8601 válido", () => {
    expect(normalizeBuiltAt("2026-08-05T12:00:00.000Z")).toBe("2026-08-05T12:00:00.000Z");
  });

  it("normaliza para ISO com milissegundos e UTC", () => {
    expect(normalizeBuiltAt("2026-08-05T09:00:00-03:00")).toBe("2026-08-05T12:00:00.000Z");
  });

  it("devolve null para valor ausente ou não parseável", () => {
    expect(normalizeBuiltAt(undefined)).toBeNull();
    expect(normalizeBuiltAt(null)).toBeNull();
    expect(normalizeBuiltAt("")).toBeNull();
    expect(normalizeBuiltAt("ontem")).toBeNull();
  });
});

describe("resolveBuildInfo", () => {
  it("monta o info a partir dos valores de build", () => {
    expect(
      resolveBuildInfo({
        version: "1.2.3",
        commit: "50f4706270772d23ed6724b713f9146a07667c57",
        builtAt: "2026-08-05T12:00:00.000Z",
      }),
    ).toEqual({
      version: "1.2.3",
      commit: "50f4706",
      builtAt: "2026-08-05T12:00:00.000Z",
    });
  });

  it("degrada campo por campo, sem quebrar", () => {
    // Cenário real: build fora de CI e fora de um repo git — a versão vem do
    // package.json, o commit não vem de lugar nenhum.
    expect(resolveBuildInfo({ version: "1.0.0", commit: "" })).toEqual({
      version: "1.0.0",
      commit: UNKNOWN,
      builtAt: null,
    });
  });

  it("devolve UNKNOWN na versão quando nem o package.json chegou", () => {
    expect(resolveBuildInfo({}).version).toBe(UNKNOWN);
  });
});

describe("formatBuildLabel", () => {
  it("prefixa a versão com v e separa o commit com ·", () => {
    expect(
      formatBuildLabel({
        version: "1.2.3",
        commit: "50f4706",
        builtAt: null,
      }),
    ).toBe("v1.2.3 · 50f4706");
  });

  it("omite o commit quando não se sabe, em vez de exibir 'desconhecido'", () => {
    expect(
      formatBuildLabel({ version: "1.2.3", commit: UNKNOWN, builtAt: null }),
    ).toBe("v1.2.3");
  });

  it("não prefixa com v quando a própria versão é desconhecida", () => {
    expect(
      formatBuildLabel({ version: UNKNOWN, commit: UNKNOWN, builtAt: null }),
    ).toBe(UNKNOWN);
  });
});
