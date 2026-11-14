import { describe, expect, it } from "vitest";
import { planCheckpointDuplication } from "./checkpoint-duplication";

/**
 * O que estes testes protegem: a hierarquia das cópias. Um filho duplicado
 * junto com o pai precisa apontar para a CÓPIA do pai — apontar para o
 * original misturaria a cópia na estrutura antiga sem nenhum erro visível.
 */

const cp = (id: string, parentId: string | null, order = 0, name = id) => ({
  id, parentId, order, name,
});

function ids() {
  let n = 0;
  return () => `novo-${++n}`;
}

describe("planCheckpointDuplication", () => {
  it("filho marcado junto com o pai vai para baixo da cópia do pai", () => {
    // Filho vem antes do pai na seleção: a ordem de criação tem de corrigir.
    const plan = planCheckpointDuplication([cp("filho", "pai"), cp("pai", null)], ids());
    expect(plan.map((p) => p.source.id)).toEqual(["pai", "filho"]);
    const [pai, filho] = plan;
    expect(pai.parentId).toBeNull();
    expect(pai.parentIsCopy).toBe(false);
    expect(filho.parentId).toBe(pai.newId);
    expect(filho.parentIsCopy).toBe(true);
  });

  it("filho marcado sozinho fica sob o pai original", () => {
    const [filho] = planCheckpointDuplication([cp("filho", "pai")], ids());
    expect(filho.parentId).toBe("pai");
    expect(filho.parentIsCopy).toBe(false);
  });

  it("só as raízes da duplicação levam o sufixo de cópia", () => {
    const plan = planCheckpointDuplication(
      [cp("pai", null, 0, "Etapa"), cp("filho", "pai", 0, "Sub")],
      ids()
    );
    expect(plan.map((p) => p.name)).toEqual(["Etapa (cópia)", "Sub"]);
  });

  it("três níveis: neto aponta para a cópia do filho", () => {
    const plan = planCheckpointDuplication(
      [cp("neto", "filho"), cp("filho", "pai"), cp("pai", null)],
      ids()
    );
    const byId = new Map(plan.map((p) => [p.source.id, p]));
    expect(byId.get("filho")!.parentId).toBe(byId.get("pai")!.newId);
    expect(byId.get("neto")!.parentId).toBe(byId.get("filho")!.newId);
  });

  it("irmãos saem na ordem original", () => {
    const plan = planCheckpointDuplication(
      [cp("c", null, 2), cp("a", null, 0), cp("b", null, 1)],
      ids()
    );
    expect(plan.map((p) => p.source.id)).toEqual(["a", "b", "c"]);
  });

  it("nome no limite continua cabendo nos 200 caracteres", () => {
    const [p] = planCheckpointDuplication([cp("x", null, 0, "a".repeat(200))], ids());
    expect(p.name.length).toBe(200);
    expect(p.name.endsWith(" (cópia)")).toBe(true);
  });
});
