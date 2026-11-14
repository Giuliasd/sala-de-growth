import { describe, expect, it } from "vitest";
import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";
import {
  achatar,
  avisoDePrioridades,
  contarPorPessoa,
  krParado,
  montarPrecisaDeVoce,
  pendenciasDeTopo,
  urgenciaDoPrazo,
} from "./precisa-de-voce";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOJE = d("2026-10-13");

function cp(id: string, due: string, extra: Partial<CheckpointItem> = {}): CheckpointItem {
  return {
    id, name: id, description: null, startDate: null, dueDate: d(due),
    isCompleted: false, completedAt: null, categoria: null, members: [], tags: [],
    inProgress: false, children: [], ...extra,
  };
}

function item(id: string, checkpoints: CheckpointItem[], extra: Partial<WeeklyItem> = {}) {
  return {
    id, name: id, status: "EM_ANDAMENTO", priority: null,
    launchDate: null, launchThisWeek: false, launchNextWeek: false,
    analysisDate: null, analysisThisWeek: false, analysisNextWeek: false,
    checkpoints, frente: { id: "f", name: "Frente" }, members: [],
    kind: "iniciativa" as const, ...extra,
  };
}

describe("urgenciaDoPrazo", () => {
  it("separa ontem, hoje e o resto da semana", () => {
    expect(urgenciaDoPrazo(d("2026-10-12"), HOJE)).toBe("atrasado");
    expect(urgenciaDoPrazo(d("2026-10-13"), HOJE)).toBe("hoje");
    expect(urgenciaDoPrazo(d("2026-10-16"), HOJE)).toBe("semana");
  });
});

describe("pendenciasDeTopo", () => {
  it("conta o pai aberto uma vez, não cada subcheckpoint aberto dele", () => {
    const lista = achatar([
      cp("pai", "2026-10-13", { children: [cp("a", "2026-10-13"), cp("b", "2026-10-14")] }),
    ]);
    expect(pendenciasDeTopo(lista).map((f) => f.cp.id)).toEqual(["pai"]);
  });

  it("conta o filho aberto quando o pai já foi concluído", () => {
    const lista = achatar([
      cp("pai", "2026-10-13", { isCompleted: true, children: [cp("a", "2026-10-13")] }),
    ]);
    expect(pendenciasDeTopo(lista).map((f) => f.cp.id)).toEqual(["a"]);
  });
});

describe("montarPrecisaDeVoce", () => {
  it("põe o item no grupo do checkpoint pendente mais urgente", () => {
    const r = montarPrecisaDeVoce(
      [item("lp", [cp("sexta", "2026-10-16"), cp("ontem", "2026-10-12")])],
      { hoje: HOJE, focados: new Set() }
    );
    expect(r.atrasado.map((e) => e.item.id)).toEqual(["lp"]);
    expect(r.semana).toEqual([]);
  });

  it("checkpoint concluído não decide a urgência", () => {
    const r = montarPrecisaDeVoce(
      [item("x", [cp("velho", "2026-10-01", { isCompleted: true }), cp("sexta", "2026-10-16")])],
      { hoje: HOJE, focados: new Set() }
    );
    expect(r.semana.map((e) => e.item.id)).toEqual(["x"]);
    expect(r.contagem).toEqual({ atrasado: 0, hoje: 0, semana: 1 });
  });

  it("prioridade vai para o topo, mas o atraso dela continua no contador", () => {
    const r = montarPrecisaDeVoce([item("onb", [cp("ontem", "2026-10-12")])], {
      hoje: HOJE,
      focados: new Set(["onb"]),
    });
    expect(r.prioridades.map((e) => e.item.id)).toEqual(["onb"]);
    expect(r.atrasado).toEqual([]);
    expect(r.contagem.atrasado).toBe(1);
  });

  it("sem checkpoint pendente, o lançamento de hoje leva o item para Hoje", () => {
    const r = montarPrecisaDeVoce(
      [item("lanca", [], { launchDate: HOJE, launchThisWeek: true })],
      { hoje: HOJE, focados: new Set() }
    );
    expect(r.hoje.map((e) => e.item.id)).toEqual(["lanca"]);
  });

  it("dentro do grupo, o prazo mais cedo vem primeiro", () => {
    const r = montarPrecisaDeVoce(
      [item("b", [cp("x", "2026-10-16")]), item("a", [cp("y", "2026-10-14")])],
      { hoje: HOJE, focados: new Set() }
    );
    expect(r.semana.map((e) => e.item.id)).toEqual(["a", "b"]);
  });
});

describe("krParado", () => {
  it("parado a partir de 7 dias sem atualização, ou se nunca foi atualizado", () => {
    expect(krParado(null, HOJE)).toBe(true);
    expect(krParado(d("2026-10-07"), HOJE)).toBe(false);
    expect(krParado(d("2026-10-06"), HOJE)).toBe(true);
  });
});

describe("avisoDePrioridades", () => {
  it("segue a regra da Weekly: uma ou duas", () => {
    expect(avisoDePrioridades(0, true)).toMatch(/Sem prioridade/);
    expect(avisoDePrioridades(0, false)).toBeNull();
    expect(avisoDePrioridades(2, true)).toBeNull();
    expect(avisoDePrioridades(3, true)).toMatch(/3 prioridades/);
  });
});

describe("contarPorPessoa", () => {
  it("item dividido conta para cada responsável", () => {
    const n = contarPorPessoa([
      { members: [{ id: "ana" }, { id: "bruno" }] },
      { members: [{ id: "ana" }] },
    ]);
    expect(n.get("ana")).toBe(2);
    expect(n.get("bruno")).toBe(1);
    expect(n.get("carla")).toBeUndefined();
  });
});
