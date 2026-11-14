import { describe, expect, it } from "vitest";
import { planejarConversao, type CheckpointFonte, type TagFonte } from "@/lib/checkpoint-conversion";

// A conversão iniciativa ↔ experimento deixava os checkpoints no item apagado.
// O plano é a parte que decide a cópia: ordem de criação, ids novos e as
// referências (pai, tags, necessários do marco) remapeadas para eles.

function cp(id: string, extra: Partial<CheckpointFonte> = {}): CheckpointFonte {
  return {
    id, parentId: null, name: id, description: null, startDate: null,
    dueDate: new Date("2026-09-10T00:00:00Z"), isCompleted: false, completedAt: null,
    categoria: null, order: 0, createdAt: new Date("2026-08-01T00:00:00Z"),
    members: [], tags: [], requisitos: [], ...extra,
  };
}
const tag = (id: string): TagFonte => ({
  id, name: id, color: "sky", order: 0, createdAt: new Date("2026-08-01T00:00:00Z"),
});

function idsSequenciais() {
  let n = 0;
  return () => `novo-${++n}`;
}

describe("planejarConversao", () => {
  it("cria pai antes do filho e aponta o filho para o pai NOVO", () => {
    // Lista fora de ordem de propósito: o neto vem antes do avô.
    const plano = planejarConversao(
      [cp("neto", { parentId: "filho" }), cp("filho", { parentId: "avo" }), cp("avo")],
      [],
      idsSequenciais()
    );
    expect(plano.checkpoints.map((p) => p.fonte.id)).toEqual(["avo", "filho", "neto"]);
    const novo = Object.fromEntries(plano.checkpoints.map((p) => [p.fonte.id, p]));
    expect(novo.avo.parentId).toBeNull();
    expect(novo.filho.parentId).toBe(novo.avo.novoId);
    expect(novo.neto.parentId).toBe(novo.filho.novoId);
  });

  it("mantém a ordem dos irmãos", () => {
    const plano = planejarConversao(
      [cp("c", { order: 2 }), cp("a", { order: 0 }), cp("b", { order: 1 })],
      []
    );
    expect(plano.checkpoints.map((p) => p.fonte.id)).toEqual(["a", "b", "c"]);
  });

  // É o mesmo trabalho trocando de casa: o andamento vem junto. Quem concluiu
  // na semana não pode ver o checkpoint reaberto depois da conversão.
  it("preserva o andamento — a fonte vai inteira para a criação", () => {
    const concluido = cp("feito", {
      isCompleted: true,
      completedAt: new Date("2026-09-08T12:00:00Z"),
      members: [{ id: "m1" }],
    });
    const [p] = planejarConversao([concluido], []).checkpoints;
    expect(p.fonte).toBe(concluido);
  });

  it("copia as tags do item e religa cada checkpoint às cópias", () => {
    const plano = planejarConversao(
      [cp("a", { tags: [{ id: "t1" }, { id: "t2" }] })],
      [tag("t1"), tag("t2")],
      idsSequenciais()
    );
    const novasTags = plano.tags.map((t) => t.novoId);
    expect(plano.checkpoints[0].tagIds).toEqual(novasTags);
    expect(novasTags).not.toContain("t1");
  });

  it("religa o marco aos necessários copiados", () => {
    const plano = planejarConversao(
      [
        cp("marco", { categoria: "MARCO", requisitos: [{ id: "r1" }, { id: "r2" }] }),
        cp("r1"),
        cp("r2"),
      ],
      []
    );
    const novo = Object.fromEntries(plano.checkpoints.map((p) => [p.fonte.id, p.novoId]));
    expect(plano.requisitos).toEqual([{ marcoId: novo.marco, requisitoIds: [novo.r1, novo.r2] }]);
  });

  // Referência para fora do item não deveria existir, mas o banco não impede.
  // Ela cai em vez de derrubar a conversão inteira.
  it("referência para fora da lista cai em vez de quebrar", () => {
    const plano = planejarConversao(
      [
        cp("orfao", { parentId: "de-outro-item", tags: [{ id: "tag-de-outro" }] }),
        cp("marco", { categoria: "MARCO", requisitos: [{ id: "de-outro-item" }] }),
      ],
      []
    );
    const orfao = plano.checkpoints.find((p) => p.fonte.id === "orfao")!;
    expect(orfao.parentId).toBeNull();
    expect(orfao.tagIds).toEqual([]);
    expect(plano.requisitos).toEqual([]);
  });

  it("item sem checkpoints gera plano vazio", () => {
    expect(planejarConversao([], [])).toEqual({ tags: [], checkpoints: [], requisitos: [] });
  });
});
