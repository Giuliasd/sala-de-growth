import { describe, expect, it } from "vitest";
import {
  descreverNotificacao,
  destinatariosDoComentario,
  destinoDaNotificacao,
  diffDeResponsaveis,
  extrairMencoes,
  rotuloDoContador,
  trechoDoComentario,
} from "./notificacoes";

describe("diffDeResponsaveis", () => {
  it("separa quem entrou de quem saiu", () => {
    expect(diffDeResponsaveis(["a", "b"], ["b", "c"], "autor")).toEqual({
      adicionados: ["c"],
      removidos: ["a"],
    });
  });

  it("o autor nunca é avisado do que fez a si mesmo", () => {
    expect(diffDeResponsaveis([], ["autor", "c"], "autor")).toEqual({ adicionados: ["c"], removidos: [] });
    expect(diffDeResponsaveis(["autor", "a"], [], "autor")).toEqual({ adicionados: [], removidos: ["a"] });
  });

  it("nada mudou: ninguém é avisado", () => {
    expect(diffDeResponsaveis(["a", "b"], ["b", "a"], "x")).toEqual({ adicionados: [], removidos: [] });
  });

  it("ids repetidos na lista contam uma vez", () => {
    expect(diffDeResponsaveis([], ["c", "c"], "x").adicionados).toEqual(["c"]);
  });

  it("criação: antes vazio, todos os responsáveis (menos o autor) são adicionados", () => {
    expect(diffDeResponsaveis([], ["a", "b", "autor"], "autor").adicionados).toEqual(["a", "b"]);
  });
});

describe("extrairMencoes", () => {
  const time = [
    { id: "ana", name: "Ana" },
    { id: "anapaula", name: "Ana Paula" },
    { id: "jose", name: "José Silva" },
    { id: "bia", name: "Bia" },
  ];

  it("acha menção pelo nome completo, ignorando acento e caixa", () => {
    expect(extrairMencoes("oi @jose silva, olha isso", time)).toEqual(["jose"]);
    expect(extrairMencoes("@BIA pode ver?", time)).toEqual(["bia"]);
  });

  it("'@Ana Paula' não conta também como '@Ana'", () => {
    expect(extrairMencoes("@Ana Paula revisa?", time)).toEqual(["anapaula"]);
  });

  it("mas as duas aparecendo separadas contam as duas", () => {
    expect(extrairMencoes("@Ana e @Ana Paula", time).sort()).toEqual(["ana", "anapaula"]);
  });

  it("'@Ana' dentro de '@Anabela' não é menção à Ana", () => {
    expect(extrairMencoes("fala com @Anabela", time)).toEqual([]);
  });

  it("e-mail não é menção", () => {
    expect(extrairMencoes("manda para bia@empresa.com", time)).toEqual([]);
  });

  it("sem arroba, nome solto não é menção", () => {
    expect(extrairMencoes("a Bia vai ver", time)).toEqual([]);
  });

  it("menção seguida de pontuação vale", () => {
    expect(extrairMencoes("valeu, @Bia!", time)).toEqual(["bia"]);
  });

  it("a mesma pessoa mencionada duas vezes aparece uma vez", () => {
    expect(extrairMencoes("@Bia ... @Bia", time)).toEqual(["bia"]);
  });

  it("nome vazio no time não casa com nada", () => {
    expect(extrairMencoes("@ oi", [{ id: "x", name: "  " }])).toEqual([]);
  });
});

describe("destinatariosDoComentario", () => {
  it("mencionado recebe 'menção'; responsável não mencionado recebe 'comentário'", () => {
    expect(
      destinatariosDoComentario({ autorId: "z", responsaveisIds: ["a", "b"], mencionadosIds: ["b", "c"] })
    ).toEqual({ mencao: ["b", "c"], comentario: ["a"] });
  });

  it("o autor não recebe nada, nem como responsável nem como mencionado", () => {
    expect(
      destinatariosDoComentario({ autorId: "z", responsaveisIds: ["z", "a"], mencionadosIds: ["z"] })
    ).toEqual({ mencao: [], comentario: ["a"] });
  });

  it("quem é responsável E foi mencionada recebe um aviso só (o de menção)", () => {
    const r = destinatariosDoComentario({ autorId: "z", responsaveisIds: ["a"], mencionadosIds: ["a"] });
    expect(r).toEqual({ mencao: ["a"], comentario: [] });
  });
});

describe("trechoDoComentario", () => {
  it("junta linhas e espaços", () => {
    expect(trechoDoComentario("  oi\n\n  tudo   bem  ")).toBe("oi tudo bem");
  });

  it("corta o que passa de 140 caracteres com reticências", () => {
    const t = trechoDoComentario("x".repeat(500));
    expect(t.length).toBe(141);
    expect(t.endsWith("…")).toBe(true);
  });

  it("texto curto fica inteiro", () => {
    expect(trechoDoComentario("curto")).toBe("curto");
  });
});

describe("descreverNotificacao", () => {
  const base = { alvo: "INICIATIVA" as const, alvoNome: "Régua", autorNome: "Ana" };

  it("adicionada / removida", () => {
    expect(descreverNotificacao({ ...base, tipo: "RESPONSAVEL_ADICIONADO" })).toBe(
      "Ana adicionou você como responsável na iniciativa “Régua”"
    );
    expect(descreverNotificacao({ ...base, tipo: "RESPONSAVEL_REMOVIDO" })).toBe(
      "Ana removeu você dos responsáveis na iniciativa “Régua”"
    );
  });

  it("menção e comentário", () => {
    expect(descreverNotificacao({ ...base, tipo: "MENCAO" })).toBe("Ana mencionou você na iniciativa “Régua”");
    expect(descreverNotificacao({ ...base, alvo: "EXPERIMENTO", tipo: "COMENTARIO" })).toBe(
      "Ana comentou no experimento “Régua”"
    );
  });

  it("checkpoint: cita o checkpoint e o item dele", () => {
    expect(descreverNotificacao({ ...base, tipo: "RESPONSAVEL_ADICIONADO", subitem: "Briefing" })).toBe(
      "Ana adicionou você como responsável no checkpoint “Briefing” da iniciativa “Régua”"
    );
    expect(
      descreverNotificacao({ ...base, alvo: "EXPERIMENTO", tipo: "RESPONSAVEL_REMOVIDO", subitem: "Briefing" })
    ).toBe("Ana removeu você dos responsáveis no checkpoint “Briefing” do experimento “Régua”");
  });

  it("KR e ação", () => {
    expect(descreverNotificacao({ ...base, alvo: "OKR", tipo: "RESPONSAVEL_ADICIONADO" })).toContain("no KR");
    expect(descreverNotificacao({ ...base, alvo: "ACAO_SEMANA", tipo: "RESPONSAVEL_ADICIONADO" })).toContain(
      "na ação"
    );
  });

  it("autor que saiu do time não vira 'null'", () => {
    expect(descreverNotificacao({ ...base, autorNome: null, tipo: "COMENTARIO" })).toMatch(/^Alguém que saiu do time/);
  });
});

describe("destinoDaNotificacao / rotuloDoContador", () => {
  it("leva ao item, ou à lista quando não há página própria", () => {
    expect(destinoDaNotificacao("INICIATIVA", "i1")).toBe("/iniciativas/i1");
    expect(destinoDaNotificacao("EXPERIMENTO", "e1")).toBe("/experimentos/e1");
    expect(destinoDaNotificacao("OKR", "k1")).toBe("/okrs");
    expect(destinoDaNotificacao("ACAO_SEMANA", "a1")).toBe("/rituais");
  });

  it("contador passa de 99 vira '99+'", () => {
    expect(rotuloDoContador(3)).toBe("3");
    expect(rotuloDoContador(99)).toBe("99");
    expect(rotuloDoContador(100)).toBe("99+");
  });
});

// ─── Agrupamento, conversão, duplicação e preferências ───────────────────────

import {
  agruparAvisos,
  ehGrupoDeItens,
  ehTipoDeAviso,
  pessoaAceitaAviso,
  resumirNomes,
  TIPOS_DE_AVISO,
  type AvisoCandidato,
} from "./notificacoes";

const cand = (extra: Partial<AvisoCandidato> = {}): AvisoCandidato => ({
  destinatarioId: "ana",
  tipo: "RESPONSAVEL_ADICIONADO",
  alvo: "INICIATIVA",
  alvoId: "i1",
  alvoNome: "Régua",
  subitem: null,
  ...extra,
});

describe("resumirNomes", () => {
  it("poucos nomes: lista inteira", () => {
    expect(resumirNomes(["A", "B"])).toBe("A, B");
  });
  it("muitos: os três primeiros e quantos ficaram de fora", () => {
    expect(resumirNomes(["A", "B", "C", "D", "E"])).toBe("A, B, C e mais 2");
  });
  it("ignora nome vazio", () => {
    expect(resumirNomes(["A", " ", "B"])).toBe("A, B");
  });
});

describe("agruparAvisos", () => {
  it("um aviso sozinho passa intacto, com quantidade 1", () => {
    expect(agruparAvisos([cand()])).toEqual([{ ...cand(), quantidade: 1, trecho: null }]);
  });

  it("a mesma pessoa em 5 iniciativas vira UM aviso, com a lista de nomes", () => {
    const itens = ["A", "B", "C", "D", "E"].map((n, i) => cand({ alvoId: `i${i}`, alvoNome: n }));
    const r = agruparAvisos(itens);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ quantidade: 5, trecho: "A, B, C e mais 2", alvoId: "i0", subitem: null });
  });

  it("pessoas diferentes não se misturam", () => {
    const r = agruparAvisos([cand({ destinatarioId: "ana" }), cand({ destinatarioId: "bia", alvoId: "i2" })]);
    expect(r.map((a) => a.destinatarioId).sort()).toEqual(["ana", "bia"]);
    expect(r.every((a) => a.quantidade === 1)).toBe(true);
  });

  it("adição e remoção da mesma pessoa ficam em avisos separados", () => {
    const r = agruparAvisos([
      cand({ alvoId: "i1" }), cand({ alvoId: "i2" }),
      cand({ tipo: "RESPONSAVEL_REMOVIDO", alvoId: "i3" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.find((a) => a.tipo === "RESPONSAVEL_ADICIONADO")?.quantidade).toBe(2);
    expect(r.find((a) => a.tipo === "RESPONSAVEL_REMOVIDO")?.quantidade).toBe(1);
  });

  it("checkpoints do mesmo item viram um aviso; o item continua sendo o alvo", () => {
    const r = agruparAvisos([
      cand({ subitem: "Briefing" }), cand({ subitem: "Layout" }), cand({ subitem: "QA" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ quantidade: 3, subitem: "Briefing, Layout, QA", alvoId: "i1", trecho: null });
  });

  it("checkpoints de itens diferentes NÃO viram um aviso só", () => {
    const r = agruparAvisos([cand({ subitem: "A", alvoId: "i1" }), cand({ subitem: "B", alvoId: "i2" })]);
    expect(r).toHaveLength(2);
  });
});

describe("ehGrupoDeItens", () => {
  it("só quando reúne vários itens (checkpoints de um item ainda abrem o item)", () => {
    expect(ehGrupoDeItens({ quantidade: 5, subitem: null })).toBe(true);
    expect(ehGrupoDeItens({ quantidade: 3, subitem: "A, B, C" })).toBe(false);
    expect(ehGrupoDeItens({ quantidade: 1, subitem: null })).toBe(false);
    expect(ehGrupoDeItens({})).toBe(false);
  });
});

describe("frases novas", () => {
  const base = { alvoNome: "Régua", autorNome: "Ana" };

  it("agrupado: adicionada/removida em N itens e em N checkpoints", () => {
    expect(
      descreverNotificacao({ ...base, tipo: "RESPONSAVEL_ADICIONADO", alvo: "INICIATIVA", quantidade: 5 })
    ).toBe("Ana adicionou você como responsável em 5 iniciativas");
    expect(
      descreverNotificacao({ ...base, tipo: "RESPONSAVEL_REMOVIDO", alvo: "EXPERIMENTO", quantidade: 2 })
    ).toBe("Ana removeu você dos responsáveis em 2 experimentos");
    expect(
      descreverNotificacao({
        ...base, tipo: "RESPONSAVEL_ADICIONADO", alvo: "INICIATIVA", quantidade: 3, subitem: "A, B, C",
      })
    ).toBe("Ana adicionou você como responsável em 3 checkpoints da iniciativa “Régua”");
  });

  it("conversão: o alvo é o item novo", () => {
    expect(descreverNotificacao({ ...base, tipo: "ITEM_CONVERTIDO", alvo: "EXPERIMENTO" })).toBe(
      "Ana converteu a iniciativa “Régua” em experimento (você é responsável)"
    );
    expect(descreverNotificacao({ ...base, tipo: "ITEM_CONVERTIDO", alvo: "INICIATIVA" })).toBe(
      "Ana converteu o experimento “Régua” em iniciativa (você é responsável)"
    );
  });

  it("duplicação: um checkpoint ou vários", () => {
    expect(
      descreverNotificacao({ ...base, tipo: "ITEM_DUPLICADO", alvo: "INICIATIVA", subitem: "Briefing" })
    ).toBe("Ana duplicou o checkpoint “Briefing” da iniciativa “Régua” (você é responsável pela cópia)");
    expect(
      descreverNotificacao({ ...base, tipo: "ITEM_DUPLICADO", alvo: "EXPERIMENTO", quantidade: 4, subitem: "A, B" })
    ).toBe("Ana duplicou 4 checkpoints do experimento “Régua” (você é responsável pelas cópias)");
  });

  it("aviso que reúne itens leva à lista; o resto, ao item", () => {
    expect(destinoDaNotificacao("INICIATIVA", "i1", true)).toBe("/iniciativas");
    expect(destinoDaNotificacao("EXPERIMENTO", "e1", true)).toBe("/experimentos");
    expect(destinoDaNotificacao("INICIATIVA", "i1", false)).toBe("/iniciativas/i1");
  });
});

describe("preferências", () => {
  it("todo tipo de aviso aparece uma vez na lista do Perfil", () => {
    const tipos = TIPOS_DE_AVISO.map((t) => t.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
    expect(tipos).toEqual(
      expect.arrayContaining(["RESPONSAVEL_ADICIONADO", "RESPONSAVEL_REMOVIDO", "MENCAO", "COMENTARIO", "ITEM_CONVERTIDO", "ITEM_DUPLICADO"])
    );
  });

  it("só tipos conhecidos são válidos", () => {
    expect(ehTipoDeAviso("MENCAO")).toBe(true);
    expect(ehTipoDeAviso("QUALQUER")).toBe(false);
    expect(ehTipoDeAviso(3)).toBe(false);
  });

  it("o que foi desligado não passa; vazio recebe tudo", () => {
    expect(pessoaAceitaAviso([], "MENCAO")).toBe(true);
    expect(pessoaAceitaAviso(["COMENTARIO"], "COMENTARIO")).toBe(false);
    expect(pessoaAceitaAviso(["COMENTARIO"], "MENCAO")).toBe(true);
  });
});
