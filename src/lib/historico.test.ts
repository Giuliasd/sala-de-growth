import { describe, expect, it } from "vitest";
import { descreverMudanca, diffDeSnapshots, juntarNomes, nomesDaLista } from "./historico";

describe("diffDeSnapshots", () => {
  it("só devolve o que mudou, na ordem fixa dos campos", () => {
    const r = diffDeSnapshots(
      { nome: "Régua", status: "Backlog", prioridade: "Média", frente: "Aquisição" },
      { nome: "Régua", status: "Em andamento", prioridade: "Alta", frente: "Aquisição" }
    );
    expect(r).toEqual([
      { campo: "status", de: "Backlog", para: "Em andamento" },
      { campo: "prioridade", de: "Média", para: "Alta" },
    ]);
  });

  it("nada mudou, nada a gravar", () => {
    const foto = { nome: "A", status: "Backlog", responsaveis: "Ana, Bia" };
    expect(diffDeSnapshots(foto, { ...foto })).toEqual([]);
  });

  it("vazio vira null nos dois sentidos (campo preenchido e limpo)", () => {
    expect(diffDeSnapshots({ okr: "" }, { okr: "Subir conversão" })).toEqual([
      { campo: "okr", de: null, para: "Subir conversão" },
    ]);
    expect(diffDeSnapshots({ fim: "30/09/2026" }, { fim: "" })).toEqual([
      { campo: "fim", de: "30/09/2026", para: null },
    ]);
  });

  it("campo que não existe em nenhuma das fotos é ignorado (iniciativa não tem ICE)", () => {
    expect(diffDeSnapshots({ nome: "A" }, { nome: "A" })).toEqual([]);
  });

  it("campo presente só numa das fotos não conta como mudança (não rastreado ≠ vazio)", () => {
    expect(diffDeSnapshots({ nome: "A" }, { nome: "A", ice: "7 (Executar agora)" })).toEqual([]);
  });

  it("texto longo grava só que mudou, não os dois textos", () => {
    expect(diffDeSnapshots({ descricao: "texto antigo enorme" }, { descricao: "texto novo enorme" })).toEqual([
      { campo: "descricao", de: null, para: null },
    ]);
  });
});

describe("nomes de responsáveis", () => {
  it("juntar ordena (a foto não varia com a ordem do banco) e separar desfaz", () => {
    expect(juntarNomes(["Bia", "Ana", "Éder"])).toBe("Ana, Bia, Éder");
    expect(nomesDaLista("Ana, Bia")).toEqual(["Ana", "Bia"]);
    expect(nomesDaLista("")).toEqual([]);
    expect(nomesDaLista(null)).toEqual([]);
  });
});

describe("descreverMudanca", () => {
  it("campo comum: de → para, com travessão para vazio", () => {
    expect(descreverMudanca({ campo: "status", de: "Backlog", para: "Em andamento" })).toBe(
      "Status: Backlog → Em andamento"
    );
    expect(descreverMudanca({ campo: "okr", de: null, para: "Subir conversão" })).toBe(
      "OKR: — → Subir conversão"
    );
  });

  it("responsáveis: quem entrou e quem saiu", () => {
    expect(descreverMudanca({ campo: "responsaveis", de: "Ana, Bia", para: "Ana, Caio" })).toBe(
      "Responsáveis: adicionou Caio; removeu Bia"
    );
    expect(descreverMudanca({ campo: "responsaveis", de: null, para: "Ana" })).toBe(
      "Responsáveis: adicionou Ana"
    );
  });

  it("eventos sem de/para", () => {
    expect(descreverMudanca({ campo: "criado", de: null, para: null })).toBe("Criou o item");
    expect(descreverMudanca({ campo: "criado", de: null, para: null, detalhe: "convertida de experimento" })).toBe(
      "Criou o item (convertida de experimento)"
    );
    expect(descreverMudanca({ campo: "excluido", de: null, para: null })).toBe("Excluiu o item");
    expect(descreverMudanca({ campo: "convertido", de: null, para: "experimento" })).toBe(
      "Converteu em experimento"
    );
    expect(descreverMudanca({ campo: "descricao", de: null, para: null })).toBe("Alterou descrição");
  });

  it("checkpoint: nome entre aspas e a ação", () => {
    expect(
      descreverMudanca({ campo: "checkpoint", de: null, para: "concluído", detalhe: "Briefing" })
    ).toBe('Checkpoint "Briefing": concluído');
  });
});

// ─── Checkpoints, ordem e tags ────────────────────────────────────────────────

import { diffDeCheckpoint, type FotoDoCheckpoint } from "./historico";

describe("diffDeCheckpoint", () => {
  const base: FotoDoCheckpoint = {
    nome: "Briefing", prazo: "01/09/2026", categoria: "", responsaveis: ["Ana"], tags: ["Design"],
    requisitos: [], marcos: [],
  };
  const textos = (a: FotoDoCheckpoint, d: FotoDoCheckpoint) => diffDeCheckpoint(a, d).map((m) => m.para);

  it("nada mudou: nenhuma linha", () => {
    expect(diffDeCheckpoint(base, { ...base })).toEqual([]);
  });

  it("cada aspecto vira uma linha, com o nome atual do checkpoint como contexto", () => {
    const d = diffDeCheckpoint(base, {
      ...base, nome: "Briefing v2", prazo: "15/09/2026", categoria: "Marco",
      responsaveis: ["Bia"], tags: ["Design", "Urgente"], requisitos: ["Layout"], marcos: ["Lançamento"],
    });
    expect(d.map((m) => m.para)).toEqual([
      "prazo 01/09/2026 → 15/09/2026",
      'renomeado (era "Briefing")',
      "categoria: comum → Marco",
      "responsáveis: adicionou Bia; removeu Ana",
      "tags: adicionou Urgente",
      "necessários: adicionou Layout",
      "marcos: adicionou Lançamento",
    ]);
    expect(d.every((m) => m.campo === "checkpoint" && m.detalhe === "Briefing v2")).toBe(true);
  });

  it("tirar a categoria e a tag", () => {
    expect(textos({ ...base, categoria: "Comunicação" }, { ...base, tags: [] })).toEqual([
      "categoria: Comunicação → comum",
      "tags: removeu Design",
    ]);
  });
});

describe("descreverMudanca — ordem e tags", () => {
  it("reordenar e mexer em tags têm frase própria", () => {
    expect(descreverMudanca({ campo: "ordem", de: null, para: null })).toBe("Reordenou os checkpoints");
    expect(descreverMudanca({ campo: "tag", de: null, para: "“Design” criada" })).toBe("Tags: “Design” criada");
  });
});
