import { describe, expect, it } from "vitest";
import {
  diasAteOMarco,
  listarNomes,
  marcosQueExigem,
  podeSerRequisito,
  progressoDoMarco,
  resumoDoRisco,
  rotuloDosDias,
  type MarcoCheckpoint,
} from "./checkpoint-marco";

/**
 * O que estes testes protegem: a pill "3/5 entregues" e o "em risco" dizerem
 * a verdade em todas as telas — e o aviso de mover nomear exatamente as
 * ligações que o servidor vai desfazer.
 */

const cp = (id: string, over: Partial<MarcoCheckpoint> = {}): MarcoCheckpoint => ({
  id,
  name: id,
  parentId: null,
  categoria: null,
  isCompleted: false,
  dueDate: "2026-11-10T00:00:00.000Z",
  ...over,
});

const hoje = new Date("2026-11-05T15:00:00.000Z");

describe("podeSerRequisito", () => {
  it("qualquer checkpoint que não é marco — inclusive subcheckpoint, que entra sozinho", () => {
    expect(podeSerRequisito(cp("a"))).toBe(true);
    expect(podeSerRequisito(cp("a", { parentId: "p" }))).toBe(true);
    expect(podeSerRequisito(cp("a", { categoria: "MARCO" }))).toBe(false);
    expect(podeSerRequisito(cp("a", { categoria: "COMUNICACAO" }))).toBe(true);
  });
});

describe("progressoDoMarco", () => {
  const marco = cp("m", { categoria: "MARCO", dueDate: "2026-11-12T00:00:00.000Z", requisitoIds: ["a", "b", "c", "d"] });
  const itens = [
    cp("a", { isCompleted: true }),
    cp("b", { dueDate: "2026-11-01T00:00:00.000Z" }), // atrasado
    cp("c", { dueDate: "2026-11-14T00:00:00.000Z" }), // depois do marco
    cp("d", { dueDate: "2026-11-12T00:00:00.000Z" }), // no dia do marco: ok
  ];
  const porId = new Map(itens.map((i) => [i.id, i]));

  it("conta entregues e pendentes", () => {
    const p = progressoDoMarco(marco, porId, hoje)!;
    expect(p.total).toBe(4);
    expect(p.entregues).toBe(1);
    expect(p.pendentes.map((x) => x.id)).toEqual(["b", "c", "d"]);
  });

  it("aponta atrasado e o que vence depois do marco", () => {
    const p = progressoDoMarco(marco, porId, hoje)!;
    expect(p.emRisco).toBe(true);
    expect(p.riscos.map((r) => [r.item.id, r.motivo])).toEqual([
      ["b", "atrasado"],
      ["c", "depois_do_marco"],
    ]);
  });

  it("marco concluído não fica em risco", () => {
    const p = progressoDoMarco({ ...marco, isCompleted: true }, porId, hoje)!;
    expect(p.emRisco).toBe(false);
    expect(p.pendentes).toHaveLength(3);
  });

  it("marco sem necessários (ou com ids que sumiram) não tem progresso", () => {
    expect(progressoDoMarco(cp("m", { categoria: "MARCO" }), porId, hoje)).toBeNull();
    expect(progressoDoMarco(cp("m", { categoria: "MARCO", requisitoIds: ["x"] }), porId, hoje)).toBeNull();
  });

  it("vencer hoje não é atraso", () => {
    const p = progressoDoMarco(
      cp("m", { categoria: "MARCO", requisitoIds: ["h"] }),
      new Map([["h", cp("h", { dueDate: "2026-11-05T00:00:00.000Z" })]]),
      hoje
    )!;
    expect(p.emRisco).toBe(false);
  });
});

describe("resumoDoRisco", () => {
  it("junta os motivos com a contagem certa", () => {
    expect(resumoDoRisco([{ motivo: "atrasado" }, { motivo: "atrasado" }, { motivo: "depois_do_marco" }])).toBe(
      "2 checkpoints atrasados · 1 vence depois do marco"
    );
    expect(resumoDoRisco([{ motivo: "depois_do_marco" }, { motivo: "depois_do_marco" }])).toBe(
      "2 vencem depois do marco"
    );
  });
});

describe("ligações", () => {
  const itens = [
    cp("m1", { categoria: "MARCO", requisitoIds: ["a", "b"] }),
    cp("m2", { categoria: "MARCO", requisitoIds: ["a"] }),
    cp("a"),
    cp("b"),
    cp("c"),
    cp("a1", { parentId: "a" }),
  ];

  it("marcosQueExigem acha todos os marcos de um checkpoint", () => {
    expect(marcosQueExigem("a", itens).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(marcosQueExigem("c", itens)).toEqual([]);
  });

  it("subcheckpoint atrelado conta sozinho — nem o pai nem o irmão entram junto", () => {
    const todos = [
      cp("m", { categoria: "MARCO", requisitoIds: ["a1"] }),
      cp("a"),
      cp("a1", { parentId: "a" }),
      cp("a2", { parentId: "a" }),
    ];
    const p = progressoDoMarco(todos[0], new Map(todos.map((i) => [i.id, i])));
    expect(p?.requisitos.map((r) => r.id)).toEqual(["a1"]);
  });
});

describe("listarNomes", () => {
  it("encurta listas longas", () => {
    expect(listarNomes(["A"])).toBe('"A"');
    expect(listarNomes(["A", "B"])).toBe('"A" e "B"');
    expect(listarNomes(["A", "B", "C", "D", "E"])).toBe('"A", "B", "C" e mais 2');
  });
});

describe("diasAteOMarco / rotuloDosDias — o quanto falta, no card de marcos", () => {
  const hoje = new Date("2026-10-20T00:00:00Z");

  it("conta dias de calendário, não 24h corridas", () => {
    expect(diasAteOMarco("2026-10-20T00:00:00Z", hoje)).toBe(0);
    expect(diasAteOMarco("2026-10-21T00:00:00Z", new Date("2026-10-20T23:00:00Z"))).toBe(1);
    expect(diasAteOMarco("2026-10-27T00:00:00Z", hoje)).toBe(7);
    expect(diasAteOMarco("2026-10-17T00:00:00Z", hoje)).toBe(-3);
  });

  it("diz hoje, amanhã, faltam N e vencido", () => {
    expect(rotuloDosDias(0)).toBe("hoje");
    expect(rotuloDosDias(1)).toBe("amanhã");
    expect(rotuloDosDias(5)).toBe("faltam 5 dias");
    expect(rotuloDosDias(-1)).toBe("venceu ontem");
    expect(rotuloDosDias(-3)).toBe("venceu há 3 dias");
  });
});
