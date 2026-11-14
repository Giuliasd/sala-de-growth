import { describe, expect, it } from "vitest";
import {
  computeMonthlyAverage,
  progressoAtual,
  quarterWeekCount,
  weeklySeriesFromUpdates,
  computeProgress,
  daysSince,
  isStale,
  okrDirection,
  paceStatus,
  projectValue,
  projectionMeetsTarget,
  quarterElapsedPercent,
  velocityPerWeek,
} from "./okr";

// O acompanhamento de OKR vive destas contas: quanto do quarter passou, se o
// progresso acompanha esse relógio, e onde o KR termina no ritmo atual.

const INICIO = "2026-07-01";
const FIM = "2026-09-30";

describe("quarterElapsedPercent", () => {
  it("no primeiro dia o quarter mal começou", () => {
    expect(quarterElapsedPercent(INICIO, FIM, new Date("2026-07-01"))).toBe(0);
  });

  it("na metade do intervalo dá perto de 50%", () => {
    const pct = quarterElapsedPercent(INICIO, FIM, new Date("2026-08-15"));
    expect(pct).toBeGreaterThan(45);
    expect(pct).toBeLessThan(55);
  });

  it("satura em 100 depois do fim — quarter vencido não passa de 100%", () => {
    expect(quarterElapsedPercent(INICIO, FIM, new Date("2026-10-20"))).toBe(100);
  });

  it("satura em 0 antes do início", () => {
    expect(quarterElapsedPercent(INICIO, FIM, new Date("2026-06-01"))).toBe(0);
  });
});

describe("paceStatus", () => {
  it("progresso muito acima do relógio é adiantado", () => {
    expect(paceStatus(80, 50)).toBe("adiantado");
  });

  it("progresso muito abaixo é atrasado", () => {
    expect(paceStatus(20, 50)).toBe("atrasado");
  });

  it("dentro da folga de 10 pontos continua no ritmo", () => {
    expect(paceStatus(45, 50)).toBe("no-ritmo");
    expect(paceStatus(55, 50)).toBe("no-ritmo");
  });

  it("a folga é inclusiva na borda: 10 pontos de diferença já muda o estado", () => {
    expect(paceStatus(60, 50)).toBe("adiantado");
    expect(paceStatus(40, 50)).toBe("atrasado");
  });
});

describe("isStale / daysSince", () => {
  const HOJE = new Date("2026-09-04T12:00:00Z");

  it("conta os dias desde a última atualização", () => {
    expect(daysSince("2026-08-30T12:00:00Z", HOJE)).toBe(5);
  });

  it("KR atualizado ontem não está parado", () => {
    expect(isStale("2026-09-03T12:00:00Z", 14, HOJE)).toBe(false);
  });

  it("acima do limite está parado", () => {
    expect(isStale("2026-08-01T12:00:00Z", 14, HOJE)).toBe(true);
  });

  it("nunca atualizado conta como parado — é o pior caso, não um caso neutro", () => {
    expect(isStale(null, 14, HOJE)).toBe(true);
    expect(daysSince(null, HOJE)).toBeNull();
  });
});

describe("velocityPerWeek", () => {
  it("dois pontos a uma semana de distância dão a variação da semana", () => {
    const v = velocityPerWeek([
      { date: "2026-08-01", value: 100 },
      { date: "2026-08-08", value: 170 },
    ]);
    expect(v).toBeCloseTo(70, 5);
  });

  it("ordena por data: histórico fora de ordem não inverte o sinal", () => {
    const v = velocityPerWeek([
      { date: "2026-08-08", value: 170 },
      { date: "2026-08-01", value: 100 },
    ]);
    expect(v).toBeCloseTo(70, 5);
  });

  it("queda devolve velocidade negativa", () => {
    const v = velocityPerWeek([
      { date: "2026-08-01", value: 100 },
      { date: "2026-08-15", value: 86 },
    ]);
    expect(v).toBeCloseTo(-7, 5);
  });

  it("um ponto só não tem velocidade", () => {
    expect(velocityPerWeek([{ date: "2026-08-01", value: 100 }])).toBeNull();
  });

  it("pontos no mesmo dia não viram velocidade (divisão por quase zero)", () => {
    const v = velocityPerWeek([
      { date: "2026-08-01T09:00:00Z", value: 100 },
      { date: "2026-08-01T10:00:00Z", value: 140 },
    ]);
    expect(v).toBeNull();
  });
});

describe("projectValue", () => {
  it("projeta o valor de fim de quarter mantendo o ritmo", () => {
    const v = projectValue({
      currentValue: 640,
      velocityPerWeek: 70,
      quarterEnd: "2026-09-30",
      now: new Date("2026-09-02"),
    });
    // 28 dias restantes × 10/dia
    expect(v).toBeCloseTo(920, 0);
  });

  it("sem velocidade não há projeção", () => {
    expect(
      projectValue({ currentValue: 640, velocityPerWeek: null, quarterEnd: "2026-09-30" })
    ).toBeNull();
  });

  it("quarter encerrado não projeta", () => {
    expect(
      projectValue({
        currentValue: 640,
        velocityPerWeek: 70,
        quarterEnd: "2026-09-30",
        now: new Date("2026-10-05"),
      })
    ).toBeNull();
  });
});

describe("quarterElapsedPercent — estabilidade entre servidor e cliente", () => {
  it("arredonda para uma casa: o valor vai para style e para texto, e decimais diferentes entre os dois renders quebravam a hidratação", () => {
    const pct = quarterElapsedPercent(INICIO, FIM, new Date("2026-08-20T13:47:31Z"));
    expect(pct).toBe(Math.round(pct * 10) / 10);
  });

  it("o mesmo instante dá sempre o mesmo valor — quem garante servidor e cliente iguais é passar o mesmo `now`, não o arredondamento", () => {
    const t = new Date("2026-08-20T13:47:31Z");
    expect(quarterElapsedPercent(INICIO, FIM, t)).toBe(quarterElapsedPercent(INICIO, FIM, t));
  });
});

describe("okrDirection / projectionMeetsTarget", () => {
  it("meta acima do inicial é KR de crescimento", () => {
    expect(
      okrDirection({ measurementType: "ACUMULADO", initialValue: 480, targetValue: 900 })
    ).toBe("cresce");
  });

  it("meta abaixo do inicial é KR de redução (CAC de 95 para 60)", () => {
    expect(
      okrDirection({ measurementType: "ACUMULADO", initialValue: 95, targetValue: 60 })
    ).toBe("reduz");
  });

  it("em KR de redução, projetar ABAIXO da meta é bater a meta", () => {
    expect(projectionMeetsTarget(56.7, 60, "reduz")).toBe(true);
    expect(projectionMeetsTarget(64, 60, "reduz")).toBe(false);
  });

  it("em KR de crescimento vale o inverso", () => {
    expect(projectionMeetsTarget(920, 900, "cresce")).toBe(true);
    expect(projectionMeetsTarget(840, 900, "cresce")).toBe(false);
  });
});

describe("computeProgress — média mensal com ponto de partida", () => {
  const meses = [4, 3.5, null];

  it("sem ponto de partida mantém média ÷ meta (maior é melhor)", () => {
    const r = computeProgress({
      measurementType: "MEDIA_MENSAL",
      targetValue: 5,
      initialValue: 0,
      currentValue: 0,
      monthValues: meses,
    });
    expect(r.currentValue).toBeCloseTo(3.75, 5);
    expect(r.progressPercent).toBeCloseTo(75, 5);
  });

  it("meta abaixo do ponto de partida vira KR de redução: churn de 6% para 3% com média 4,5% é metade do caminho", () => {
    const r = computeProgress({
      measurementType: "MEDIA_MENSAL",
      targetValue: 3,
      initialValue: 6,
      currentValue: 0,
      monthValues: [5, 4, null],
    });
    expect(r.currentValue).toBeCloseTo(4.5, 5);
    expect(r.progressPercent).toBeCloseTo(50, 5);
  });

  it("é o caso que dava 153%: média acima da meta em KR de redução não passa de 100% do nada", () => {
    const r = computeProgress({
      measurementType: "MEDIA_MENSAL",
      targetValue: 3,
      initialValue: 6,
      currentValue: 0,
      monthValues: [4.6, null, null],
    });
    expect(r.progressPercent).toBeLessThan(100);
  });

  it("a direção da média mensal sai do ponto de partida", () => {
    expect(
      okrDirection({ measurementType: "MEDIA_MENSAL", initialValue: 6, targetValue: 3 })
    ).toBe("reduz");
    expect(
      okrDirection({ measurementType: "MEDIA_MENSAL", initialValue: 0, targetValue: 3 })
    ).toBe("cresce");
  });
});

describe("computeMonthlyAverage", () => {
  it("arredonda em 2 casas — a média crua imprimia 4.199999999999999 no card", () => {
    expect(computeMonthlyAverage([4.6, 3.8, null])).toBe(4.2);
  });

  it("sem mês preenchido não há média", () => {
    expect(computeMonthlyAverage([null, null, null])).toBeNull();
  });
});

describe("weeklySeriesFromUpdates", () => {
  const Q = "2026-07-01";

  it("plota o valor do MÊS mexido, não a média — é o ponto da série semanal", () => {
    const s = weeklySeriesFromUpdates(
      [
        { date: "2026-07-08", newValue: 4.6, monthValue1: 4.6, monthValue2: null, monthValue3: null },
        { date: "2026-08-12", newValue: 4.2, monthValue1: 4.6, monthValue2: 3.8, monthValue3: null },
      ],
      Q
    );
    expect(s.map((p) => [p.week, p.value, p.month])).toEqual([
      [2, 4.6, 1],
      [7, 3.8, 2],
    ]);
  });

  it("duas atualizações na mesma semana viram um ponto — vale a última", () => {
    const s = weeklySeriesFromUpdates(
      [
        { date: "2026-07-08", newValue: 5, monthValue1: 5, monthValue2: null, monthValue3: null },
        { date: "2026-07-10", newValue: 4, monthValue1: 4, monthValue2: null, monthValue3: null },
      ],
      Q
    );
    expect(s).toHaveLength(1);
    expect(s[0].value).toBe(4);
  });

  it("histórico fora de ordem não inverte a série", () => {
    const s = weeklySeriesFromUpdates(
      [
        { date: "2026-08-12", newValue: 4.2, monthValue1: 4.6, monthValue2: 3.8, monthValue3: null },
        { date: "2026-07-08", newValue: 4.6, monthValue1: 4.6, monthValue2: null, monthValue3: null },
      ],
      Q
    );
    expect(s.map((p) => p.week)).toEqual([2, 7]);
    expect(s[1].month).toBe(2);
  });

  it("linha antiga sem snapshot cai para o valor registrado (a média)", () => {
    const s = weeklySeriesFromUpdates(
      [{ date: "2026-07-08", newValue: 4.4, monthValue1: null, monthValue2: null, monthValue3: null }],
      Q
    );
    expect(s[0]).toMatchObject({ value: 4.4, month: null });
  });

  it("o quarter tem 13 semanas", () => {
    expect(quarterWeekCount("2026-07-01", "2026-09-30")).toBe(13);
  });

  it("quarter que termina às 23h59 ainda tem 13 semanas — sem S14 vazia no eixo", () => {
    expect(quarterWeekCount("2026-07-01T00:00:00Z", "2026-09-30T23:59:59Z")).toBe(13);
  });
});

describe("progressoAtual (fonte única para dashboard, relatório e gestão)", () => {
  it("KR de redução em média mensal ignora o progressPercent gravado e recalcula", () => {
    // Churn de 5% para 3%, com abril em 4,6%: 20% do caminho — não 153%.
    const r = progressoAtual({
      measurementType: "MEDIA_MENSAL",
      targetValue: 3,
      initialValue: 5,
      currentValue: 4.6,
      monthValue1: 4.6,
      monthValue2: null,
      monthValue3: null,
    });
    expect(r.currentValue).toBe(4.6);
    expect(r.progressPercent).toBeCloseTo(20, 5);
  });

  it("acumulado usa o valor atual", () => {
    const r = progressoAtual({
      measurementType: "ACUMULADO",
      targetValue: 200,
      initialValue: 0,
      currentValue: 50,
      monthValue1: null,
      monthValue2: null,
      monthValue3: null,
    });
    expect(r.progressPercent).toBe(25);
  });
});
