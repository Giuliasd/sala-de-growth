import { describe, expect, it } from "vitest";
import { AusenciaType } from "@/generated/prisma/enums";
import { mensagemDeTrava, travaQueBloqueia } from "./trava-ferias";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const blackFriday = { name: "Black Friday", startDate: d("2026-11-20"), endDate: d("2026-11-30") };

describe("travaQueBloqueia", () => {
  it("bloqueia férias que cruzam a trava", () => {
    expect(travaQueBloqueia([blackFriday], AusenciaType.FERIAS, d("2026-11-25"), d("2026-12-05"))).toBe(blackFriday);
  });

  it("bloqueia nas bordas (início e fim da trava contam)", () => {
    expect(travaQueBloqueia([blackFriday], AusenciaType.FERIAS, d("2026-11-10"), d("2026-11-20"))).toBe(blackFriday);
    expect(travaQueBloqueia([blackFriday], AusenciaType.FERIAS, d("2026-11-30"), d("2026-12-10"))).toBe(blackFriday);
  });

  it("bloqueia férias que engolem a trava inteira", () => {
    expect(travaQueBloqueia([blackFriday], AusenciaType.FERIAS, d("2026-11-01"), d("2026-12-31"))).toBe(blackFriday);
  });

  it("libera férias antes ou depois da trava", () => {
    expect(travaQueBloqueia([blackFriday], AusenciaType.FERIAS, d("2026-11-01"), d("2026-11-19"))).toBeNull();
    expect(travaQueBloqueia([blackFriday], AusenciaType.FERIAS, d("2026-12-01"), d("2026-12-10"))).toBeNull();
  });

  it("só férias é bloqueada — licença e day off passam", () => {
    for (const tipo of [AusenciaType.LICENCA_MEDICA, AusenciaType.LICENCA_MATERNIDADE, AusenciaType.DAY_OFF, AusenciaType.OUTROS]) {
      expect(travaQueBloqueia([blackFriday], tipo, d("2026-11-25"), d("2026-11-26"))).toBeNull();
    }
  });

  it("sem travas, nada bloqueia", () => {
    expect(travaQueBloqueia([], AusenciaType.FERIAS, d("2026-11-25"), d("2026-11-26"))).toBeNull();
  });
});

describe("mensagemDeTrava", () => {
  it("nomeia a trava e o período, sem voltar um dia por fuso", () => {
    expect(mensagemDeTrava(blackFriday)).toBe(
      'Não é possível registrar férias neste período: ele cruza a trava "Black Friday" (20/11/2026 a 30/11/2026).'
    );
  });
});
