import { describe, expect, it } from "vitest";
import {
  datasEmOrdem,
  nomesComDatasInvertidas,
  conferirData,
  conferirOrdemDatas,
  dataOpcionalSchema,
  dataSchema,
  isDataPlausivel,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_ORDEM_DATAS,
} from "./date-validation";

describe("isDataPlausivel", () => {
  it("aceita datas normais, em yyyy-mm-dd e em ISO completo", () => {
    expect(isDataPlausivel("2026-09-24")).toBe(true);
    expect(isDataPlausivel("2026-09-24T00:00:00.000Z")).toBe(true);
    expect(isDataPlausivel("2000-01-01")).toBe(true);
    expect(isDataPlausivel("2100-12-31")).toBe(true);
  });

  it("recusa o caso real de produção: 2026 digitado como 2926", () => {
    expect(isDataPlausivel("2926-09-24")).toBe(false);
  });

  it("recusa anos fora da faixa e com mais de 4 dígitos", () => {
    expect(isDataPlausivel("1999-12-31")).toBe(false);
    expect(isDataPlausivel("2101-01-01")).toBe(false);
    expect(isDataPlausivel("0026-09-24")).toBe(false);
    expect(isDataPlausivel("20266-09-24")).toBe(false);
  });

  it("recusa dia que não existe e lixo", () => {
    expect(isDataPlausivel("2026-02-31")).toBe(false);
    expect(isDataPlausivel("2026-13-01")).toBe(false);
    expect(isDataPlausivel("24/09/2026")).toBe(false);
    expect(isDataPlausivel("")).toBe(false);
  });
});

describe("schemas", () => {
  it("dataSchema mostra a mensagem do ano", () => {
    const r = dataSchema.safeParse("2926-09-24");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(MENSAGEM_DATA_INVALIDA);
  });

  it("dataOpcionalSchema aceita ausente, null e campo limpo", () => {
    expect(dataOpcionalSchema.safeParse(undefined).success).toBe(true);
    expect(dataOpcionalSchema.safeParse(null).success).toBe(true);
    expect(dataOpcionalSchema.safeParse("").success).toBe(true);
    expect(dataOpcionalSchema.safeParse("2926-09-24").success).toBe(false);
  });
});

describe("conferirData", () => {
  it("só reclama de data preenchida e implausível", () => {
    expect(conferirData(null)).toBeNull();
    expect(conferirData("2026-09-24")).toBeNull();
    expect(conferirData("2926-09-24")).toBe(MENSAGEM_DATA_INVALIDA);
  });
});

describe("conferirOrdemDatas — edição parcial", () => {
  const salvo = { startDate: new Date("2026-09-01"), endDate: new Date("2026-09-30") };

  it("editar só o início para depois do fim salvo é recusado (o caso de produção)", () => {
    expect(conferirOrdemDatas({ startDate: "2026-10-05" }, salvo)).toBe(MENSAGEM_ORDEM_DATAS);
  });

  it("editar só o fim para antes do início salvo é recusado", () => {
    expect(conferirOrdemDatas({ endDate: "2026-08-15" }, salvo)).toBe(MENSAGEM_ORDEM_DATAS);
  });

  it("edição coerente passa, e limpar uma das datas também", () => {
    expect(conferirOrdemDatas({ startDate: "2026-09-10" }, salvo)).toBeNull();
    expect(conferirOrdemDatas({ startDate: null }, salvo)).toBeNull();
    expect(conferirOrdemDatas({ endDate: "" }, salvo)).toBeNull();
  });

  it("sem data salva do outro lado, não há o que comparar", () => {
    expect(conferirOrdemDatas({ startDate: "2026-10-05" }, { startDate: null, endDate: null })).toBeNull();
  });
});

describe("datasEmOrdem — as duas datas juntas", () => {
  it("fim depois ou igual ao início passa", () => {
    expect(datasEmOrdem({ startDate: "2026-09-01", dueDate: "2026-09-10" })).toBe(true);
    expect(datasEmOrdem({ startDate: "2026-09-10", dueDate: "2026-09-10" })).toBe(true);
  });

  it("fim antes do início não passa", () => {
    expect(datasEmOrdem({ startDate: "2026-09-11", dueDate: "2026-09-10" })).toBe(false);
  });

  it("sem início (ou com string vazia do formulário) passa", () => {
    expect(datasEmOrdem({ startDate: null, dueDate: "2026-09-10" })).toBe(true);
    expect(datasEmOrdem({ startDate: "", dueDate: "2026-09-10" })).toBe(true);
    expect(datasEmOrdem({ dueDate: "2026-09-10" })).toBe(true);
  });
});

describe("nomesComDatasInvertidas — edição em massa de uma data só", () => {
  const itens = [
    { name: "A", startDate: new Date("2026-09-01"), dueDate: new Date("2026-09-10") },
    { name: "B", startDate: new Date("2026-09-05"), dueDate: new Date("2026-09-20") },
    { name: "C", startDate: null, dueDate: new Date("2026-09-03") },
  ];

  it("novo fim: barra quem começa depois dele", () => {
    expect(nomesComDatasInvertidas({ dueDate: "2026-09-04" }, itens)).toEqual(["B"]);
  });

  it("novo início: barra quem termina antes dele, e ignora quem não tem conflito", () => {
    expect(nomesComDatasInvertidas({ startDate: "2026-09-15" }, itens)).toEqual(["A", "C"]);
  });

  it("limpar o início nunca inverte", () => {
    expect(nomesComDatasInvertidas({ startDate: null }, itens)).toEqual([]);
  });
});
