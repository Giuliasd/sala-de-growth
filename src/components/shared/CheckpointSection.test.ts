import { describe, expect, it } from "vitest";
import {
  collapsibleIds,
  conferirDataInline,
  larguraDaColunaDeTags,
  parseDndId,
  sortFlatTree,
  tagsAposMover,
  utcDayStart,
  type CheckpointNode,
} from "./CheckpointSection";
import { resolverTagsEfetivas, segmentarPorTag, SEM_TAG_KEY } from "@/lib/checkpoint-tag-grupos";

// A visão default da árvore de checkpoints é RECOLHIDA: ao abrir uma iniciativa
// ou experimento, só os checkpoints de topo aparecem. Quem monta esse estado
// inicial é o `collapsibleIds` — se ele devolver o conjunto errado, a tela abre
// expandida (o bug que motivou isso) ou esconde o que não devia.

function node(id: string, children: CheckpointNode[] = []): CheckpointNode {
  return {
    id,
    name: id,
    description: null,
    startDate: null,
    dueDate: "2026-08-01",
    isCompleted: false,
    completedAt: null,
    members: [],
    order: 0,
    children,
  };
}

describe("collapsibleIds — estado inicial da visão recolhida", () => {
  it("recolhe o pai que tem subcheckpoint", () => {
    const tree = [node("pai", [node("sub")])];
    expect(collapsibleIds(tree)).toEqual(["pai"]);
  });

  it("NÃO inclui folhas — estar recolhido sem ter filho sujaria o estado", () => {
    const tree = [node("folha-a"), node("folha-b")];
    expect(collapsibleIds(tree)).toEqual([]);
  });

  it("recolhe em todos os níveis da árvore (topo + 2, o máximo do produto)", () => {
    const tree = [node("pai", [node("sub", [node("neto")])])];
    // `sub` também tem filho, então também entra recolhido.
    expect(collapsibleIds(tree)).toEqual(["pai", "sub"]);
  });

  it("cobre irmãos independentes, recolhendo só quem tem filho", () => {
    const tree = [
      node("com-filho", [node("x")]),
      node("sem-filho"),
      node("outro-com-filho", [node("y"), node("z")]),
    ];
    expect(collapsibleIds(tree)).toEqual(["com-filho", "outro-com-filho"]);
  });

  it("árvore vazia não recolhe nada", () => {
    expect(collapsibleIds([])).toEqual([]);
  });

  it("recolhe o marco com necessários, mesmo sem subcheckpoint — a setinha abre a lista deles", () => {
    const marco: CheckpointNode = { ...node("marco"), categoria: "MARCO", requisitos: [{ id: "a" }] };
    expect(collapsibleIds([marco, node("a")])).toEqual(["marco"]);
  });

  it("marco sem necessários e sem filho não tem o que abrir", () => {
    const marco: CheckpointNode = { ...node("marco"), categoria: "MARCO", requisitos: [] };
    expect(collapsibleIds([marco])).toEqual([]);
  });

  it("necessários só contam em marco", () => {
    const comum: CheckpointNode = { ...node("comum"), requisitos: [{ id: "a" }] };
    expect(collapsibleIds([comum])).toEqual([]);
  });
});

// Prazo de checkpoint é date-only em UTC. Comparar com a hora local marcava
// como atrasado o item que vence AMANHÃ a partir das 21h de Brasília — a linha
// aparecia em laranja um dia antes.
describe("utcDayStart — comparação de prazo sem escorregar de fuso", () => {
  it("normaliza para a meia-noite UTC do próprio dia", () => {
    expect(utcDayStart("2026-08-21T00:00:00.000Z")).toBe(Date.UTC(2026, 7, 21));
  });

  it("ignora a hora do dia (mesmo dia, horas diferentes = mesmo valor)", () => {
    expect(utcDayStart("2026-08-21T23:59:00.000Z")).toBe(utcDayStart("2026-08-21T00:00:00.000Z"));
  });

  it("prazo de amanhã NÃO é menor que hoje — o caso do falso atraso", () => {
    const hoje = utcDayStart("2026-08-20T23:30:00.000Z");
    const amanha = utcDayStart("2026-08-21T00:00:00.000Z");
    expect(amanha < hoje).toBe(false);
  });

  it("prazo de ontem é menor que hoje", () => {
    expect(utcDayStart("2026-08-19") < utcDayStart("2026-08-20T12:00:00.000Z")).toBe(true);
  });
});

// A lista de checkpoints é uma ÁRVORE, então ordenar não é ordenar uma lista:
// cada grupo de irmãos se ordena entre si e o pai tem de continuar imediatamente
// antes da própria subárvore. Se isso quebrar, a indentação passa a descrever
// uma hierarquia que a ordem das linhas contradiz.

type ItemPlano = {
  id: string;
  parentId: string | null;
  name: string;
  order: number;
  members: { name: string }[];
  startDate: string | null;
  dueDate: string;
};

function plano(
  id: string,
  parentId: string | null,
  dueDate: string,
  extra: Partial<ItemPlano> = {}
): ItemPlano {
  return { id, parentId, name: id, order: 0, members: [], startDate: null, dueDate, ...extra };
}

const ids = (itens: ItemPlano[]) => itens.map((i) => i.id);

describe("sortFlatTree — ordenação preservando a árvore", () => {
  // pai "b" (mais antigo) com dois filhos; pai "a" (mais novo) sem filho.
  const arvore = [
    plano("a", null, "2026-08-20"),
    plano("b", null, "2026-08-10"),
    plano("b2", "b", "2026-08-19"),
    plano("b1", "b", "2026-08-11"),
  ];

  it("por data: pais entre si e filhos dentro do pai, em pré-ordem", () => {
    expect(ids(sortFlatTree(arvore, "start", "asc"))).toEqual(["b", "b1", "b2", "a"]);
  });

  it("decrescente inverte cada nível, sem soltar o filho do pai", () => {
    expect(ids(sortFlatTree(arvore, "start", "desc"))).toEqual(["a", "b", "b2", "b1"]);
  });

  it("por nome: o filho continua sob o pai mesmo quando seu nome o levaria para o topo", () => {
    const comFilhoAlfabeticamenteAntes = [
      plano("zebra", null, "2026-08-10"),
      plano("abelha", "zebra", "2026-08-11"),
      plano("melancia", null, "2026-08-12"),
    ];
    // "abelha" vem antes de tudo no alfabeto, mas é filha de "zebra".
    expect(ids(sortFlatTree(comFilhoAlfabeticamenteAntes, "name", "asc"))).toEqual([
      "melancia",
      "zebra",
      "abelha",
    ]);
  });

  it("por nome usa localeCompare pt-BR: acento não vai para o fim do alfabeto", () => {
    const comAcento = [
      plano("Bruno", null, "2026-08-10"),
      plano("Ávila", null, "2026-08-11"),
      plano("Zeca", null, "2026-08-12"),
    ];
    expect(ids(sortFlatTree(comAcento, "name", "asc"))).toEqual(["Ávila", "Bruno", "Zeca"]);
  });

  it("por responsável: compara pelo primeiro, e quem não tem vai ao topo no crescente", () => {
    const comResponsavel = [
      plano("comBruno", null, "2026-08-10", { members: [{ name: "Bruno" }] }),
      plano("semNinguem", null, "2026-08-11"),
      plano("comAna", null, "2026-08-12", { members: [{ name: "Ana" }, { name: "Zeca" }] }),
    ];
    expect(ids(sortFlatTree(comResponsavel, "member", "asc"))).toEqual([
      "semNinguem",
      "comAna",
      "comBruno",
    ]);
  });

  it("data sem startDate cai no dueDate; com startDate, é ele que ancora", () => {
    const comInicio = [
      plano("soPrazo", null, "2026-08-05"),
      plano("comInicioAntes", null, "2026-08-30", { startDate: "2026-08-01" }),
    ];
    expect(ids(sortFlatTree(comInicio, "start", "asc"))).toEqual(["comInicioAntes", "soPrazo"]);
  });

  // O desempate é por `order`, não por nome: `order` é a sequência manual que o
  // servidor mantém (novo filho entra como max+1). Desempatando por nome, um
  // sub-checkpoint criado hoje, no mesmo dia dos irmãos, saltaria para o meio do
  // grupo em vez de entrar no fim — foi o bug relatado.
  it("irmãos da mesma data respeitam `order`: o recém-criado entra no fim", () => {
    const mesmaData = [
      plano("novo", "p", "2026-08-10", { name: "aaa-recem-criado", order: 2 }),
      plano("antigo1", "p", "2026-08-10", { name: "zzz-primeiro", order: 0 }),
      plano("antigo2", "p", "2026-08-10", { name: "mmm-segundo", order: 1 }),
      plano("p", null, "2026-08-10"),
    ];
    expect(ids(sortFlatTree(mesmaData, "start", "asc"))).toEqual([
      "p",
      "antigo1",
      "antigo2",
      "novo",
    ]);
  });

  it("por tags: usa o rótulo recebido, e sem tag vai para o topo no crescente", () => {
    const itens = [
      plano("design", null, "2026-08-10"),
      plano("sem", null, "2026-08-11"),
      plano("qa", null, "2026-08-12"),
    ];
    const rotulo = (i: ItemPlano) => ({ design: "Design", qa: "QA", sem: "" })[i.id] ?? "";
    expect(ids(sortFlatTree(itens, "tags", "asc", rotulo))).toEqual(["sem", "design", "qa"]);
    expect(ids(sortFlatTree(itens, "tags", "desc", rotulo))).toEqual(["qa", "design", "sem"]);
  });
});

// A ordem "manual" é a sequência que o arrasto grava em `order`. Existe porque
// arrastar para reordenar não tinha efeito visível: a lista reordenava por data
// e a linha voltava para o lugar antigo na revalidação.
describe("sortFlatTree — ordem manual", () => {
  const fora = [
    plano("c", null, "2026-08-01", { order: 2, name: "aaa" }),
    plano("a", null, "2026-08-30", { order: 0, name: "zzz" }),
    plano("b", null, "2026-08-15", { order: 1, name: "mmm" }),
  ];

  it("segue `order`, ignorando data e nome", () => {
    expect(ids(sortFlatTree(fora, "manual", "asc"))).toEqual(["a", "b", "c"]);
  });

  it("decrescente inverte a sequência manual", () => {
    expect(ids(sortFlatTree(fora, "manual", "desc"))).toEqual(["c", "b", "a"]);
  });

  it("ordena cada nível pelo próprio `order`, sem soltar o filho do pai", () => {
    const arvore = [
      plano("pai", null, "2026-08-01", { order: 0 }),
      plano("filhoB", "pai", "2026-08-02", { order: 1 }),
      plano("filhoA", "pai", "2026-08-03", { order: 0 }),
      plano("outro", null, "2026-08-04", { order: 1 }),
    ];
    expect(ids(sortFlatTree(arvore, "manual", "asc"))).toEqual([
      "pai",
      "filhoA",
      "filhoB",
      "outro",
    ]);
  });
});

describe("segmentarPorTag — lista agrupada por tag", () => {
  const tags = [
    { id: "t-design", name: "Design" },
    { id: "t-qa", name: "QA" },
    { id: "t-vazia", name: "Ninguém usa" },
  ];
  const item = (id: string, parentId: string | null, tagIds: string[]) => ({ id, parentId, tagIds });
  const itens = [
    item("pai", null, []),
    item("filho", "pai", ["t-qa"]),
    item("ambas", null, ["t-qa", "t-design"]),
    item("solto", null, []),
  ];
  const grupos = segmentarPorTag(itens, tags);

  it("um grupo por tag em uso, na ordem das tags, e 'Sem tag' no fim", () => {
    expect(grupos.map((g) => g.key)).toEqual(["t-design", "t-qa", SEM_TAG_KEY]);
  });

  it("a ordem dos grupos segue a ordem das tags, não o nome", () => {
    const invertidas = segmentarPorTag(itens, [tags[1], tags[0]]);
    expect(invertidas.map((g) => g.key)).toEqual(["t-qa", "t-design", SEM_TAG_KEY]);
  });

  it("checkpoint com duas tags aparece nos dois grupos", () => {
    expect(grupos[0].items.map((i) => i.id)).toEqual(["ambas"]);
    expect(grupos[1].matched.has("ambas")).toBe(true);
  });

  it("o pai entra como contexto de quem casou, sem contar no grupo", () => {
    const qa = grupos[1];
    expect(qa.items.map((i) => i.id)).toEqual(["pai", "filho", "ambas"]);
    expect(qa.matched.has("pai")).toBe(false);
    expect(qa.matched.size).toBe(2);
  });

  it("'Sem tag' reúne quem não tem nenhuma tag", () => {
    expect([...grupos[2].matched]).toEqual(["pai", "solto"]);
  });

  it("subcheckpoint sem tag fica junto do pai, herdando as tags dele", () => {
    const g = segmentarPorTag(
      [
        item("pai", null, ["t-qa"]),
        item("filho", "pai", []),
        item("neto", "filho", []),
        item("outro", "pai", ["t-design"]),
      ],
      tags
    );
    const qa = g.find((x) => x.key === "t-qa")!;
    expect(qa.items.map((i) => i.id)).toEqual(["pai", "filho", "neto"]);
    expect([...qa.matched]).toEqual(["pai", "filho", "neto"]);
    // Quem tem tag própria segue só a própria; e ninguém cai em "Sem tag".
    expect(g.find((x) => x.key === "t-design")!.matched.has("outro")).toBe(true);
    expect(g.some((x) => x.key === SEM_TAG_KEY)).toBe(false);
  });
});

describe("larguraDaColunaDeTags — coluna do tamanho do conteúdo", () => {
  const t = (name: string) => ({ name });

  it("sem tag nenhuma, fica no mínimo (a largura do rótulo)", () => {
    expect(larguraDaColunaDeTags([[], []], 2)).toBe(48);
  });

  it("tags curtas não esticam a coluna até o máximo", () => {
    expect(larguraDaColunaDeTags([[t("QA")]], 2)).toBe(48);
    expect(larguraDaColunaDeTags([[t("Design"), t("QA"), t("Revisão")]], 2)).toBeLessThan(180);
  });

  it("nunca passa do máximo, mesmo com nomes longos", () => {
    const longas = [t("Comunicação externa"), t("Pesquisa com usuários"), t("Outra")];
    expect(larguraDaColunaDeTags([longas], 2)).toBe(180);
  });

  it("com um chip só (card apertado), fica mais estreita", () => {
    const linha = [[t("Design"), t("QA"), t("Revisão")]];
    expect(larguraDaColunaDeTags(linha, 1)).toBeLessThan(larguraDaColunaDeTags(linha, 2));
  });
});

describe("parseDndId — ids do arrastar na lista simples e na segmentada", () => {
  it("id puro é a linha da lista sem grupos", () => {
    expect(parseDndId("cp1")).toEqual({ kind: "row", group: null, itemId: "cp1" });
  });

  it("`grupo::item` é a linha dentro de um grupo", () => {
    expect(parseDndId("tagA::cp1")).toEqual({ kind: "row", group: "tagA", itemId: "cp1" });
    expect(parseDndId(`${SEM_TAG_KEY}::cp1`)).toEqual({
      kind: "row",
      group: SEM_TAG_KEY,
      itemId: "cp1",
    });
  });

  it("`header::grupo` é o cabeçalho, não uma linha", () => {
    expect(parseDndId("header::tagA")).toEqual({ kind: "header", group: "tagA" });
    expect(parseDndId(`header::${SEM_TAG_KEY}`)).toEqual({ kind: "header", group: SEM_TAG_KEY });
  });
});

describe("tagsAposMover — troca de tag ao soltar em outro grupo", () => {
  it("tira a tag de origem e põe a de destino", () => {
    expect(tagsAposMover(["A"], "A", "B")).toEqual(["B"]);
  });

  it("mantém as outras tags do checkpoint", () => {
    expect(tagsAposMover(["A", "C"], "A", "B")).toEqual(["C", "B"]);
  });

  it("não duplica quando já tem a tag de destino", () => {
    expect(tagsAposMover(["A", "B"], "A", "B")).toEqual(["B"]);
  });

  it("de 'Sem tag' só acrescenta o destino", () => {
    expect(tagsAposMover([], SEM_TAG_KEY, "B")).toEqual(["B"]);
  });

  it("soltar em 'Sem tag' limpa todas as tags", () => {
    expect(tagsAposMover(["A", "C"], "A", SEM_TAG_KEY)).toEqual([]);
  });
});

describe("resolverTagsEfetivas — tag própria ou herdada do pai", () => {
  const item = (id: string, parentId: string | null, tagIds: string[] = []) => ({ id, parentId, tagIds });
  const arvore = [
    item("raiz", null, ["A"]),
    item("sub", "raiz"),
    item("subsub", "sub"),
    item("propria", "raiz", ["B"]),
    item("solta", null),
  ];
  const resolver = resolverTagsEfetivas(arvore, new Set(["A", "B"]));
  const por = (id: string) => resolver(arvore.find((i) => i.id === id)!);

  it("com tag própria usa a própria, sem marcar herança", () => {
    expect(por("raiz")).toEqual({ ids: ["A"], herdadas: false });
    expect(por("propria")).toEqual({ ids: ["B"], herdadas: false });
  });

  it("sem tag própria herda a do pai — e a do avô, em cascata", () => {
    expect(por("sub")).toEqual({ ids: ["A"], herdadas: true });
    expect(por("subsub")).toEqual({ ids: ["A"], herdadas: true });
  });

  it("raiz sem tag fica sem tag, e não é herança", () => {
    expect(por("solta")).toEqual({ ids: [], herdadas: false });
  });

  it("tag excluída no gerenciador não conta — nem para herdar", () => {
    const so = resolverTagsEfetivas(arvore, new Set(["B"]));
    expect(so(arvore[1])).toEqual({ ids: [], herdadas: false });
  });

  it("ciclo nos dados não trava", () => {
    const ciclo = [item("a", "b"), item("b", "a")];
    expect(resolverTagsEfetivas(ciclo, new Set())(ciclo[0])).toEqual({ ids: [], herdadas: false });
  });
});

describe("conferirDataInline — data editada na linha antes de gravar", () => {
  const cp = { startDate: "2026-09-01T00:00:00.000Z", dueDate: "2026-09-10T00:00:00.000Z" };
  const semInicio = { startDate: null, dueDate: "2026-09-10T00:00:00.000Z" };

  it("aceita início antes do fim e fim depois do início", () => {
    expect(conferirDataInline(cp, "startDate", "2026-09-05")).toBeNull();
    expect(conferirDataInline(cp, "dueDate", "2026-09-20")).toBeNull();
  });

  it("aceita início igual ao fim (checkpoint de um dia)", () => {
    expect(conferirDataInline(cp, "startDate", "2026-09-10")).toBeNull();
  });

  it("recusa início depois do fim salvo", () => {
    expect(conferirDataInline(cp, "startDate", "2026-09-11")).toMatch(/igual ou posterior/);
  });

  it("recusa fim antes do início salvo", () => {
    expect(conferirDataInline(cp, "dueDate", "2026-08-31")).toMatch(/igual ou posterior/);
  });

  it("sem início, qualquer fim plausível passa", () => {
    expect(conferirDataInline(semInicio, "dueDate", "2026-01-01")).toBeNull();
  });

  it("limpar o início sempre pode", () => {
    expect(conferirDataInline(cp, "startDate", null)).toBeNull();
  });

  it("recusa ano implausível (digitação pela metade)", () => {
    expect(conferirDataInline(cp, "dueDate", "0202-09-10")).toMatch(/ano/);
  });
});
