import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Paridade entre os checkpoints de iniciativa e de experimento.
 *
 * Os dois arquivos de actions são a mesma lógica com nomes trocados (dois
 * models no Prisma: InitiativeCheckpoint e ExperimentoCheckpoint). Juntá-los
 * num núcleo único exigiria abrir mão da checagem de tipos do Prisma nas
 * ~1.200 linhas — o risco de quebrar a tela mais usada sem perceber é maior que
 * o ganho. O perigo real da duplicação é DERIVA: corrigir um bug num arquivo e
 * esquecer o outro (aconteceu mais de uma vez neste projeto).
 *
 * Este teste trava a deriva: normaliza os dois arquivos (tira comentários e o
 * texto das mensagens, troca os nomes específicos por neutros) e exige que o
 * CÓDIGO seja igual linha a linha. Mudou um? Mude o outro — o erro mostra onde.
 */

function neutro(texto: string): string[] {
  let s = texto.split("\r\n").join("\n");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  // O texto das mensagens pode diferir ("da iniciativa" / "do experimento").
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const trocas: [RegExp, string][] = [
    [/\b(initiativeCheckpoint|experimentoCheckpoint)\b/g, "CP"],
    [/\b(InitiativeCheckpoint|ExperimentoCheckpoint)\b/g, "CPT"],
    [/\b(initiativeIds|experimentoIds)\b/g, "FKS"],
    [/\b(initiativeId|experimentoId|iniciativaId)\b/g, "FK"],
    [/\bprisma\.(iniciativa|experimento)\b/g, "prisma.ITEM"],
    [/\btx\.(iniciativa|experimento)\b/g, "tx.ITEM"],
    [/\b(requireInitiativeOwnership|requireExperimentoOwnership)\b/g, "OWN"],
    [/\b(initiative|experimento|iniciativa)\b/g, "ITEMVAR"],
    [/(\w*?)(Initiative|Experimento)(Checkpoints?\w*)/g, "$1$3"],
    [/\b(ICChildren|ECChildren)\b/g, "CHILDREN"],
  ];
  for (const [re, por] of trocas) s = s.replace(re, por);
  return s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Primeira linha em que os dois divergem (com o vizinho, para achar no arquivo). */
function primeiraDiferenca(a: string[], b: string[]): string | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return [
        `linha de código nº ${i + 1} (contando sem comentários):`,
        `  iniciativa : ${a[i] ?? "(fim do arquivo)"}`,
        `  experimento: ${b[i] ?? "(fim do arquivo)"}`,
        `  antes dela : ${a[i - 1] ?? ""}`,
      ].join("\n");
    }
  }
  return null;
}

const ler = (arquivo: string) => readFileSync(join(__dirname, arquivo), "utf8");

describe("checkpoints de iniciativa e de experimento", () => {
  it("têm o mesmo código (só nomes e mensagens mudam) — corrigiu um, corrija o outro", () => {
    const iniciativa = neutro(ler("initiative-checkpoints.ts"));
    const experimento = neutro(ler("experimento-checkpoints.ts"));
    expect(primeiraDiferenca(iniciativa, experimento)).toBeNull();
  });

  it("a normalização não é frouxa: uma mudança de lógica é pega", () => {
    const original = ler("initiative-checkpoints.ts");
    const alterado = original.replace("isCompleted: false", "isCompleted: true");
    expect(alterado).not.toBe(original);
    expect(primeiraDiferenca(neutro(original), neutro(alterado))).not.toBeNull();
  });
});
