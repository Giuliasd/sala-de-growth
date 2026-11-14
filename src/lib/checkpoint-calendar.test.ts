import { describe, expect, it } from "vitest";
import {
  caminhoDosAncestrais,
  packWeek,
  paraCalendario,
  soltoNoCalendario,
  toSpan,
  type CalendarCheckpoint,
} from "./checkpoint-calendar";

// O calendário mensal desenha checkpoints e subcheckpoints numa grade de dias.
// Duas funções puras decidem o resultado: `toSpan` (que intervalo a barra ocupa
// e de que cor ela é) e `packWeek` (em que coluna e em que faixa ela cai dentro
// da semana). Datas de checkpoint são date-only, então tudo aqui é UTC — em
// horário local (UTC-3) a barra escorregaria um dia para trás.

const HOJE = new Date(Date.UTC(2026, 7, 20)); // 20/08/2026
// Segunda-feira: toda semana da grade começa numa segunda.
const SEMANA = new Date(Date.UTC(2026, 6, 6)); // 06/07/2026

function cp(over: Partial<CalendarCheckpoint> = {}): CalendarCheckpoint {
  return {
    id: over.name ?? "cp",
    name: "cp",
    description: null,
    startDate: null,
    dueDate: "2026-07-08",
    isCompleted: false,
    members: [],
    parentId: null,
    depth: 0,
    ...over,
  };
}

describe("toSpan — intervalo e cor da barra", () => {
  it("sem data de início, ocupa só o dia do prazo", () => {
    const span = toSpan(cp({ startDate: null, dueDate: "2026-07-08" }), HOJE)!;
    expect(span.start.toISOString()).toBe(span.end.toISOString());
    expect(span.start.getUTCDate()).toBe(8);
  });

  it("respeita o dia exato em UTC (não escorrega para o dia anterior)", () => {
    const span = toSpan(cp({ dueDate: "2026-07-08T00:00:00.000Z" }), HOJE)!;
    expect(span.end.getUTCDate()).toBe(8);
  });

  it("concluído é 'done' mesmo com prazo vencido — estado ganha do calendário", () => {
    const span = toSpan(cp({ dueDate: "2026-07-08", isCompleted: true }), HOJE)!;
    expect(span.tone).toBe("done");
  });

  it("prazo no passado e não concluído é 'late'", () => {
    expect(toSpan(cp({ dueDate: "2026-07-08" }), HOJE)!.tone).toBe("late");
  });

  it("prazo no futuro é 'open'", () => {
    expect(toSpan(cp({ dueDate: "2026-09-10" }), HOJE)!.tone).toBe("open");
  });

  it("início depois do prazo colapsa em um dia, em vez de barra invertida", () => {
    const span = toSpan(cp({ startDate: "2026-07-20", dueDate: "2026-07-10" }), HOJE)!;
    expect(span.start.getTime()).toBe(span.end.getTime());
  });
});

describe("packWeek — colunas e empilhamento na semana", () => {
  function bar(spans: CalendarCheckpoint[]) {
    return packWeek(
      spans.map((c) => toSpan(c, HOJE)!),
      SEMANA
    );
  }

  it("mapeia o dia para a coluna certa (segunda = 0, quinta = 3)", () => {
    const { bars } = bar([cp({ name: "seg", dueDate: "2026-07-06" }), cp({ name: "qui", dueDate: "2026-07-09" })]);
    expect(bars.find((b) => b.cp.name === "seg")!.startCol).toBe(0);
    expect(bars.find((b) => b.cp.name === "qui")!.startCol).toBe(3);
  });

  it("recorta a barra que começa antes da semana e termina depois dela", () => {
    // 01/07 a 15/07 atravessa a semana 06–12 inteira.
    const { bars } = bar([cp({ startDate: "2026-07-01", dueDate: "2026-07-15" })]);
    expect(bars[0].startCol).toBe(0);
    expect(bars[0].endCol).toBe(6);
  });

  it("ignora checkpoint que não toca a semana", () => {
    expect(bar([cp({ dueDate: "2026-08-20" })]).bars).toHaveLength(0);
  });

  it("barras que se sobrepõem vão para lanes diferentes", () => {
    const { bars } = bar([
      cp({ name: "a", startDate: "2026-07-06", dueDate: "2026-07-09" }),
      cp({ name: "b", startDate: "2026-07-07", dueDate: "2026-07-10" }),
    ]);
    expect(new Set(bars.map((b) => b.lane)).size).toBe(2);
  });

  it("barras que não se sobrepõem reaproveitam a mesma lane", () => {
    const { bars } = bar([
      cp({ name: "a", startDate: "2026-07-06", dueDate: "2026-07-07" }),
      cp({ name: "b", startDate: "2026-07-09", dueDate: "2026-07-10" }),
    ]);
    expect(bars.every((b) => b.lane === 0)).toBe(true);
  });

  it("acima do teto de lanes, o excedente vira contagem em vez de barra", () => {
    // 7 checkpoints no mesmo dia: 5 desenham, 2 sobram.
    const muitos = Array.from({ length: 7 }, (_, i) =>
      cp({ name: `cp-${i}`, id: `cp-${i}`, dueDate: "2026-07-08" })
    );
    const { bars, overflow } = bar(muitos);
    expect(bars).toHaveLength(5);
    expect(overflow).toBe(2);
  });

  it("subcheckpoint entra na mesma grade do pai (é o ponto da visão)", () => {
    const { bars } = bar([
      cp({ name: "pai", id: "pai", dueDate: "2026-07-08" }),
      cp({ name: "sub", id: "sub", parentId: "pai", depth: 1, dueDate: "2026-07-08" }),
    ]);
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.cp.depth).sort()).toEqual([0, 1]);
  });
});

describe("packWeek — cortes na borda da semana e teto de lanes", () => {
  function bar(spans: CalendarCheckpoint[], maxLanes?: number) {
    return packWeek(
      spans.map((c) => toSpan(c, HOJE)!),
      SEMANA,
      maxLanes
    );
  }

  it("marca as duas pontas como corte quando a barra atravessa a semana inteira", () => {
    // 01/07 a 15/07 entra antes da segunda 06/07 e sai depois do domingo 12/07.
    const { bars } = bar([cp({ startDate: "2026-07-01", dueDate: "2026-07-15" })]);
    expect(bars[0].cutStart).toBe(true);
    expect(bars[0].cutEnd).toBe(true);
  });

  it("barra que começa e termina dentro da semana não tem corte nenhum", () => {
    const { bars } = bar([cp({ startDate: "2026-07-07", dueDate: "2026-07-09" })]);
    expect(bars[0].cutStart).toBe(false);
    expect(bars[0].cutEnd).toBe(false);
  });

  it("corte só do lado que estoura: começa na semana e termina depois dela", () => {
    const { bars } = bar([cp({ startDate: "2026-07-08", dueDate: "2026-07-20" })]);
    expect(bars[0].cutStart).toBe(false);
    expect(bars[0].cutEnd).toBe(true);
  });

  it("semana expandida (maxLanes infinito) desenha tudo, sem excedente", () => {
    const muitos = Array.from({ length: 7 }, (_, i) =>
      cp({ name: `cp-${i}`, id: `cp-${i}`, dueDate: "2026-07-08" })
    );
    const { bars, overflow } = bar(muitos, Infinity);
    expect(bars).toHaveLength(7);
    expect(overflow).toBe(0);
  });
});

describe("paraCalendario — comunicação solta do pai", () => {
  it("subcheckpoint de comunicação vira nível 0, mas guarda o pai", () => {
    const [sub] = paraCalendario([cp({ name: "aviso", parentId: "pai", depth: 1, categoria: "COMUNICACAO" })]);
    expect(sub.depth).toBe(0);
    expect(sub.parentId).toBe("pai");
  });

  it("subcheckpoint comum continua subordinado", () => {
    const [sub] = paraCalendario([cp({ name: "etapa", parentId: "pai", depth: 1 })]);
    expect(sub.depth).toBe(1);
  });

  it("marco também vira nível 0 e guarda o pai", () => {
    const [marco] = paraCalendario([cp({ name: "go-live", parentId: "pai", depth: 2, categoria: "MARCO" })]);
    expect(marco.depth).toBe(0);
    expect(marco.parentId).toBe("pai");
  });
});

describe("soltoNoCalendario — quais categorias saem da hierarquia", () => {
  it("comunicação e marco são soltos", () => {
    expect(soltoNoCalendario({ categoria: "COMUNICACAO" })).toBe(true);
    expect(soltoNoCalendario({ categoria: "MARCO" })).toBe(true);
  });

  it("sem categoria (ou categoria desconhecida) segue na hierarquia", () => {
    expect(soltoNoCalendario({})).toBe(false);
    expect(soltoNoCalendario({ categoria: null })).toBe(false);
    expect(soltoNoCalendario({ categoria: "OUTRA" })).toBe(false);
  });
});

describe("caminhoDosAncestrais — de que etapa o checkpoint faz parte", () => {
  const arvore = new Map([
    ["avo", { name: "Lançamento", parentId: null }],
    ["pai", { name: "Preparação", parentId: "avo" }],
  ]);

  it("lista do ancestral mais alto até o pai direto", () => {
    expect(caminhoDosAncestrais("pai", arvore)).toEqual(["Lançamento", "Preparação"]);
  });

  it("pai de topo devolve só ele", () => {
    expect(caminhoDosAncestrais("avo", arvore)).toEqual(["Lançamento"]);
  });

  it("sem pai devolve vazio", () => {
    expect(caminhoDosAncestrais(null, arvore)).toEqual([]);
  });

  it("ancestral desconhecido interrompe o caminho sem quebrar", () => {
    const parcial = new Map([["pai", { name: "Preparação", parentId: "sumiu" }]]);
    expect(caminhoDosAncestrais("pai", parcial)).toEqual(["Preparação"]);
    expect(caminhoDosAncestrais("nunca-existiu", arvore)).toEqual([]);
  });

  it("ciclo nos dados não trava", () => {
    const ciclo = new Map([
      ["a", { name: "A", parentId: "b" }],
      ["b", { name: "B", parentId: "a" }],
    ]);
    expect(caminhoDosAncestrais("a", ciclo)).toEqual(["B", "A"]);
  });
});
