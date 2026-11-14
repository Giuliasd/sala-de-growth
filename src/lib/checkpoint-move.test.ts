import { describe, expect, it } from "vitest";
import { moveRoots, planCheckpointMove, validMoveTargets } from "./checkpoint-move";

/**
 * O que estes testes protegem: a árvore continuar sendo árvore. Mover um
 * checkpoint para dentro da própria subárvore cria um ciclo que some da lista
 * sem erro nenhum; passar de 3 níveis gera linhas que a tela não desenha.
 */

const cp = (id: string, parentId: string | null, order = 0) => ({ id, parentId, order });

// a
// ├─ a1
// │  └─ a1x
// └─ a2
// b
// c
const tree = [
  cp("a", null, 0),
  cp("a1", "a", 0),
  cp("a1x", "a1", 0),
  cp("a2", "a", 1),
  cp("b", null, 1),
  cp("c", null, 2),
];

describe("moveRoots", () => {
  it("quem tem ancestral selecionado viaja com ele", () => {
    expect(moveRoots(tree, ["a1x", "a", "b"])).toEqual(["a", "b"]);
  });

  it("preserva a ordem recebida", () => {
    expect(moveRoots(tree, ["c", "a2"])).toEqual(["c", "a2"]);
  });
});

describe("validMoveTargets", () => {
  it("exclui a subárvore de quem vai ser movido", () => {
    const targets = validMoveTargets(tree, ["a1"]);
    expect(targets.has("a1")).toBe(false);
    expect(targets.has("a1x")).toBe(false);
    expect(targets.has("a")).toBe(true);
  });

  it("respeita o limite de 3 níveis contando a altura da subárvore movida", () => {
    // a1 tem um filho: sob b (nível 0) fica a1 no 1 e a1x no 2 — ok.
    // Sob a2 (nível 1) o a1x cairia no nível 3.
    const targets = validMoveTargets(tree, ["a1"]);
    expect(targets.has("b")).toBe(true);
    expect(targets.has("a2")).toBe(false);
  });

  it("folha pode ir para baixo de um nível 1, mas não de um nível 2", () => {
    const targets = validMoveTargets(tree, ["c"]);
    expect(targets.has("a2")).toBe(true);
    expect(targets.has("a1x")).toBe(false);
  });
});

describe("planCheckpointMove", () => {
  it("coloca as raízes no fim dos irmãos do destino, na ordem recebida", () => {
    const plan = planCheckpointMove(tree, ["c", "b"], "a");
    expect(plan).toEqual({
      ok: true,
      moves: [
        { id: "c", parentId: "a", order: 2 },
        { id: "b", parentId: "a", order: 3 },
      ],
    });
  });

  it("move para o topo", () => {
    const plan = planCheckpointMove(tree, ["a1x"], null);
    expect(plan).toEqual({ ok: true, moves: [{ id: "a1x", parentId: null, order: 3 }] });
  });

  it("filho selecionado junto com o pai não é reparentado", () => {
    const plan = planCheckpointMove(tree, ["a1", "a1x"], "b");
    expect(plan.ok && plan.moves.map((m) => m.id)).toEqual(["a1"]);
  });

  it("não ignora a ordem de quem já estava no destino e também foi selecionado", () => {
    // a2 já é filho de a; ele sai do cálculo do máximo e vai para o fim.
    const plan = planCheckpointMove(tree, ["a2"], "a");
    expect(plan).toEqual({ ok: true, moves: [{ id: "a2", parentId: "a", order: 1 }] });
  });

  it("recusa mover para dentro da própria subárvore", () => {
    expect(planCheckpointMove(tree, ["a"], "a1x").ok).toBe(false);
    expect(planCheckpointMove(tree, ["a"], "a").ok).toBe(false);
  });

  it("recusa passar do limite de níveis", () => {
    const plan = planCheckpointMove(tree, ["a1"], "a2");
    expect(plan).toEqual({ ok: false, error: expect.stringContaining("3 níveis") });
  });

  it("recusa destino que não existe na árvore (outra iniciativa ou forjado)", () => {
    expect(planCheckpointMove(tree, ["b"], "zzz").ok).toBe(false);
  });
});
