import { describe, it, expect } from "vitest";
import { hojeUTC, parseISODateUTC, semanaDoMesUTC, weekRangeUTC } from "./date-utils";

const semana = (iso: string) => semanaDoMesUTC(parseISODateUTC(iso)!);

describe("semanaDoMesUTC", () => {
  it("conta a partir da primeira semana cuja quinta cai no mês", () => {
    // 31/08 a 06/09 tem a quinta em 03/09 → é a semana 1 de setembro.
    expect(semana("2026-08-31")).toBe(1);
    expect(semana("2026-09-07")).toBe(2);
    expect(semana("2026-09-14")).toBe(3);
    expect(semana("2026-09-21")).toBe(4);
  });

  it("vira o mês pela quinta-feira, não pela segunda", () => {
    // 28/09 a 04/10 tem a quinta em 01/10 → semana 1 de OUTUBRO.
    expect(semana("2026-09-28")).toBe(1);
    expect(semana("2026-10-05")).toBe(2);
  });

  it("mês que começa numa quinta-feira também fecha em 1", () => {
    // 01/10/2026 é quinta: a semana que a contém (28/09) é a 1 de outubro.
    expect(semana("2026-09-28")).toBe(1);
  });

  it("mês de cinco semanas chega a 5", () => {
    // Dezembro de 2026: quintas em 03, 10, 17, 24 e 31.
    expect(semana("2026-11-30")).toBe(1);
    expect(semana("2026-12-28")).toBe(5);
  });
});

describe("hojeUTC", () => {
  it("usa a data de São Paulo, não a do servidor em UTC", () => {
    // 22h de domingo em São Paulo = 01h de segunda em UTC.
    const agora = new Date("2026-10-19T01:00:00.000Z");
    expect(hojeUTC(agora).toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });

  it("domingo à noite ainda está na semana que começou na segunda", () => {
    const hoje = hojeUTC(new Date("2026-10-19T01:00:00.000Z"));
    expect(weekRangeUTC(hoje).weekStart.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
});
