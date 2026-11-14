import { describe, expect, it } from "vitest";
import { BUSCA_MAX, BUSCA_MIN_GLOBAL, normalizarBusca } from "./busca";

describe("normalizarBusca", () => {
  it("apara e colapsa espaços", () => {
    expect(normalizarBusca("  relatório   q3 ")).toBe("relatório q3");
  });

  it("vazio, só espaços e ausente viram null", () => {
    expect(normalizarBusca("")).toBeNull();
    expect(normalizarBusca("   ")).toBeNull();
    expect(normalizarBusca(undefined)).toBeNull();
    expect(normalizarBusca(null)).toBeNull();
  });

  it("nas listas 1 caractere já filtra; na busca global exige 2", () => {
    expect(normalizarBusca("a")).toBe("a");
    expect(normalizarBusca("a", BUSCA_MIN_GLOBAL)).toBeNull();
    expect(normalizarBusca("ab", BUSCA_MIN_GLOBAL)).toBe("ab");
  });

  it("a contagem do mínimo é depois de aparar", () => {
    expect(normalizarBusca(" a ", BUSCA_MIN_GLOBAL)).toBeNull();
  });

  it("corta no limite, sem deixar espaço na ponta", () => {
    const longo = "x".repeat(BUSCA_MAX - 1) + " " + "y".repeat(20);
    const r = normalizarBusca(longo)!;
    expect(r.length).toBeLessThanOrEqual(BUSCA_MAX);
    expect(r.endsWith(" ")).toBe(false);
  });

  it("preserva % e _ (o Prisma os trata como literais no contains)", () => {
    expect(normalizarBusca("100% _teste")).toBe("100% _teste");
  });
});

import { casaComBusca, semAcento } from "./busca";

describe("busca sem acento", () => {
  it("semAcento tira acento e caixa", () => {
    expect(semAcento("José ÁÇÃO")).toBe("jose acao");
  });

  it("casaComBusca compara sem acento nem caixa, em qualquer um dos textos", () => {
    expect(casaComBusca("relatorio", "Relatório Q3")).toBe(true);
    expect(casaComBusca("RELATÓRIO", "relatorio q3")).toBe(true);
    expect(casaComBusca("jose", null, undefined, "Ideia do José")).toBe(true);
    expect(casaComBusca("frete", "Teste A/B")).toBe(false);
  });
});
