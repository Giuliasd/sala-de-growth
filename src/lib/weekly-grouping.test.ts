import { describe, expect, it } from "vitest";
import {
  agruparPorFrente,
  checkpointDaWeekly,
  comAncestrais,
  ordenarPorTag,
  emAndamentoNaSemana,
  recortarParaPessoa,
  type Entrada,
  type FlatCheckpoint,
} from "@/lib/weekly-grouping";
import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";
import type { AcaoDaSemana } from "@/actions/acoes-semana";

// A Weekly é lida por pessoa e, dentro da pessoa, por frente. Desde que a ação
// pode morar numa frente, o agrupamento junta duas fontes: iniciativas e
// experimentos (que têm frente obrigatória) e ações (que podem não ter).

function item(nome: string, frenteId: string, frenteNome: string): Entrada {
  return {
    item: {
      id: nome,
      name: nome,
      status: "EM_ANDAMENTO",
      priority: null,
      launchDate: null,
      analysisDate: null,
      frente: { id: frenteId, name: frenteNome },
      members: [],
      checkpoints: [],
      kind: "iniciativa",
    } as unknown as Entrada["item"],
    checkpoints: [],
  };
}

function acao(
  titulo: string,
  frente: { id: string; name: string } | null
): AcaoDaSemana {
  return {
    id: titulo,
    title: titulo,
    responsavelId: "m1",
    recorrencia: null,
    semanaDoMes: null,
    concluida: false,
    frente,
  };
}

describe("agruparPorFrente", () => {
  it("põe a ação no grupo da frente dela, junto dos itens", () => {
    const grupos = agruparPorFrente(
      [item("Landing", "f1", "Aquisição")],
      [acao("TH", { id: "f1", name: "Aquisição" })]
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].frente).toBe("Aquisição");
    expect(grupos[0].itens.map((e) => e.item.name)).toEqual(["Landing"]);
    expect(grupos[0].acoes.map((a) => a.title)).toEqual(["TH"]);
  });

  it("ação sem frente não entra em grupo nenhum — é o balde transversal", () => {
    const grupos = agruparPorFrente([item("Landing", "f1", "Aquisição")], [acao("1:1", null)]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].acoes).toEqual([]);
  });

  // Trabalho miúdo de um tema onde não há iniciativa aberta: a frente aparece
  // mesmo assim, senão a ação sumiria da visão.
  it("cria o grupo mesmo quando a frente só tem ação", () => {
    const grupos = agruparPorFrente([], [acao("Acompanhar SEO", { id: "f2", name: "Retenção" })]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].id).toBe("f2");
    expect(grupos[0].itens).toEqual([]);
    expect(grupos[0].acoes.map((a) => a.title)).toEqual(["Acompanhar SEO"]);
  });

  it("ordena os grupos alfabeticamente, em pt-BR", () => {
    const grupos = agruparPorFrente(
      [item("B", "f2", "Retenção"), item("A", "f1", "Aquisição")],
      [acao("x", { id: "f3", name: "Ativação" })]
    );
    expect(grupos.map((g) => g.frente)).toEqual(["Aquisição", "Ativação", "Retenção"]);
  });

  // O id é o que o "+ Ação" do grupo usa para criar a ação já na frente certa;
  // agrupar pelo NOME juntaria duas frentes homônimas num grupo com um id só.
  it("agrupa por id, não por nome", () => {
    const grupos = agruparPorFrente(
      [item("A", "f1", "Growth"), item("B", "f2", "Growth")],
      []
    );
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.id).sort()).toEqual(["f1", "f2"]);
  });
});

// Cada checkpoint vai para a linha do PRÓPRIO responsável. Quem cuida só do
// filho recebia o filho solto, sem o pai que diz de que etapa ele é.
describe("comAncestrais", () => {
  const no = (id: string, depth: number) =>
    ({ cp: { id } as FlatCheckpoint["cp"], depth }) as FlatCheckpoint;
  // Pré-ordem: A > A1 > A1a, A2 ; B > B1
  const A = no("A", 0), A1 = no("A1", 1), A1a = no("A1a", 2), A2 = no("A2", 1);
  const B = no("B", 0), B1 = no("B1", 1);
  const lista = [A, A1, A1a, A2, B, B1];
  const ids = (l: FlatCheckpoint[]) => l.map((f) => f.cp.id);

  it("filho escolhido traz o pai, na ordem da árvore", () => {
    expect(ids(comAncestrais(lista, new Set([A2])))).toEqual(["A", "A2"]);
  });

  it("neto traz pai e avô, e não os irmãos", () => {
    expect(ids(comAncestrais(lista, new Set([A1a])))).toEqual(["A", "A1", "A1a"]);
  });

  it("não inventa ancestral para o que é de topo", () => {
    expect(ids(comAncestrais(lista, new Set([B, A2])))).toEqual(["A", "A2", "B"]);
  });

  it("filho de outro ramo não herda o pai do ramo anterior", () => {
    expect(ids(comAncestrais(lista, new Set([B1])))).toEqual(["B", "B1"]);
  });
});

describe("recortarParaPessoa", () => {
  // Semana de 07/09 a 13/09/2026.
  const ini = new Date("2026-09-07T00:00:00Z");
  const fim = new Date("2026-09-13T23:59:59.999Z");
  const pessoa = (id: string) => ({ id, name: id });

  function cp(
    id: string,
    due: string,
    donos: string[] = [],
    children: CheckpointItem[] = [],
    extra: Partial<CheckpointItem> = {}
  ): CheckpointItem {
    return {
      id, name: id, description: null, startDate: null,
      dueDate: new Date(due + "T00:00:00Z"), isCompleted: false, completedAt: null,
      categoria: null, members: donos.map(pessoa), tags: [], inProgress: false, children, ...extra,
    };
  }
  function it_(donos: string[], checkpoints: CheckpointItem[], status = "EM_ANDAMENTO"): WeeklyItem {
    return {
      id: "I", name: "I", status, priority: null, launchDate: null, launchThisWeek: false,
      launchNextWeek: false, analysisDate: null, analysisThisWeek: false, analysisNextWeek: false,
      checkpoints, frente: { id: "f", name: "f" }, members: donos.map(pessoa),
    };
  }
  const ids = (cps: CheckpointItem[]): string[] => cps.flatMap((c) => [c.id, ...ids(c.children)]);

  it("mostra só os checkpoints da pessoa, não os de outros responsáveis", () => {
    const item = it_(["rafa"], [cp("daCamila", "2026-09-09", ["camila"]), cp("doRafa", "2026-09-10", ["rafa"])]);
    expect(ids(recortarParaPessoa(item, ini, fim, "rafa")!.checkpoints)).toEqual(["doRafa"]);
  });

  it("checkpoint sem responsável fica com quem responde pelo item", () => {
    const item = it_(["rafa"], [cp("semDono", "2026-09-09")]);
    expect(ids(recortarParaPessoa(item, ini, fim, "rafa")!.checkpoints)).toEqual(["semDono"]);
    expect(recortarParaPessoa(item, ini, fim, "camila")).toBeNull();
  });

  it("subcheckpoint sem responsável herda do pai, não do item", () => {
    const item = it_(["giu", "juliana"], [
      cp("encontros", "2026-09-12", ["juliana"], [cp("tecnologia", "2026-09-08"), cp("produto", "2026-09-09")]),
    ]);
    expect(recortarParaPessoa(item, ini, fim, "giu")!.checkpoints).toEqual([]);
    expect(ids(recortarParaPessoa(item, ini, fim, "juliana")!.checkpoints)).toEqual([
      "encontros", "tecnologia", "produto",
    ]);
  });

  it("quem só tem um subcheckpoint vê o item, com o pai de contexto", () => {
    const item = it_(["rafa"], [
      cp("pai", "2026-09-30", ["rafa"], [cp("filho", "2026-09-10", ["camila"]), cp("irmao", "2026-09-11", ["rafa"])]),
    ]);
    expect(ids(recortarParaPessoa(item, ini, fim, "camila")!.checkpoints)).toEqual(["pai", "filho"]);
  });

  // Mesma regra da Weekly: o checkpoint longo é trabalho desta semana.
  it("em andamento entra: começou antes do fim da semana e vence depois", () => {
    const item = it_(["rafa"], [cp("longo", "2026-09-25", ["rafa"], [], { startDate: new Date("2026-08-31T00:00:00Z") })]);
    expect(ids(recortarParaPessoa(item, ini, fim, "rafa")!.checkpoints)).toEqual(["longo"]);
    expect(ids(recortarParaPessoa(item, ini, fim)!.checkpoints)).toEqual(["longo"]);
  });

  it("sem início e vencendo depois da semana, não entra", () => {
    const item = it_(["rafa"], [cp("depois", "2026-09-25", ["rafa"])]);
    expect(recortarParaPessoa(item, ini, fim, "rafa")!.checkpoints).toEqual([]);
  });

  describe("com as pessoas visíveis da Weekly (ativas, não visitantes)", () => {
    const visiveis = new Set(["rafa", "camila"]);

    it("checkpoint só de quem saiu do time herda de quem responde pelo item", () => {
      const item = it_(["rafa"], [cp("daAna", "2026-09-09", ["ana"])]);
      expect(ids(recortarParaPessoa(item, ini, fim, "rafa", visiveis)!.checkpoints)).toEqual(["daAna"]);
      // Sem o recorte de visíveis, a Ana (inativa) segurava o checkpoint.
      expect(recortarParaPessoa(item, ini, fim, "rafa")!.checkpoints).toEqual([]);
    });

    it("responsável invisível do item não conta: quem responde é quem sobra", () => {
      const item = it_(["ana", "rafa"], [cp("semDono", "2026-09-09")]);
      expect(ids(recortarParaPessoa(item, ini, fim, "rafa", visiveis)!.checkpoints)).toEqual(["semDono"]);
      expect(recortarParaPessoa(item, ini, fim, "ana", visiveis)).toBeNull();
    });

    it("em Todos, item sem ninguém visível que responda sai, como na Weekly", () => {
      const soInvisiveis = it_(["ana"], [cp("x", "2026-09-09", ["visitante"])]);
      expect(recortarParaPessoa(soInvisiveis, ini, fim, undefined, visiveis)).toBeNull();
      // Basta um checkpoint de alguém visível para o item ter linha.
      const comCamila = it_(["ana"], [cp("x", "2026-09-09", ["camila"])]);
      expect(ids(recortarParaPessoa(comCamila, ini, fim, undefined, visiveis)!.checkpoints)).toEqual(["x"]);
    });
  });

  it("atrasado e concluído na semana entram", () => {
    const item = it_(["rafa"], [
      cp("atrasado", "2026-08-20", ["rafa"]),
      cp("fechado", "2026-08-20", ["rafa"], [], { isCompleted: true, completedAt: new Date("2026-09-08T12:00:00Z") }),
      cp("fechadoAntes", "2026-08-20", ["rafa"], [], { isCompleted: true, completedAt: new Date("2026-08-21T12:00:00Z") }),
    ]);
    expect(ids(recortarParaPessoa(item, ini, fim, "rafa")!.checkpoints)).toEqual(["atrasado", "fechado"]);
  });

  it("sem pessoa (Todos) mantém os checkpoints de todo mundo", () => {
    const item = it_(["rafa"], [cp("a", "2026-09-09", ["camila"]), cp("b", "2026-09-10", ["rafa"])]);
    expect(ids(recortarParaPessoa(item, ini, fim)!.checkpoints)).toEqual(["a", "b"]);
  });

  it("item cancelado ou arquivado sai", () => {
    expect(recortarParaPessoa(it_(["rafa"], [], "CANCELADA"), ini, fim, "rafa")).toBeNull();
  });
});

// O checkpoint longo — começou numa semana, vence semanas depois — só existia
// na Weekly da semana do início e na do prazo. Nas do meio, quando o trabalho
// acontece, ele não aparecia.
describe("emAndamentoNaSemana / checkpointDaWeekly", () => {
  // Semana de 07/09 a 13/09/2026.
  const ini = new Date("2026-09-07T00:00:00Z");
  const fim = new Date("2026-09-13T23:59:59.999Z");
  const d = (s: string) => new Date(s + "T00:00:00Z");
  const cp = (start: string | null, due: string, extra: Partial<CheckpointItem> = {}): CheckpointItem => ({
    id: "c", name: "c", description: null, startDate: start ? d(start) : null, dueDate: d(due),
    isCompleted: false, completedAt: null, categoria: null, members: [], tags: [],
    inProgress: false, children: [], ...extra,
  });

  it("começou antes e vence depois: em andamento, entra na Weekly", () => {
    const longo = cp("2026-08-24", "2026-09-30");
    expect(emAndamentoNaSemana(longo, ini, fim)).toBe(true);
    expect(checkpointDaWeekly(longo, ini, fim)).toBe(true);
  });

  it("começa na semana e vence depois: também em andamento", () => {
    expect(emAndamentoNaSemana(cp("2026-09-10", "2026-09-30"), ini, fim)).toBe(true);
  });

  it("sem data de início é pontual: só o prazo conta", () => {
    const pontual = cp(null, "2026-09-30");
    expect(emAndamentoNaSemana(pontual, ini, fim)).toBe(false);
    expect(checkpointDaWeekly(pontual, ini, fim)).toBe(false);
  });

  it("começa depois da semana: ainda não está em andamento", () => {
    expect(emAndamentoNaSemana(cp("2026-09-14", "2026-09-30"), ini, fim)).toBe(false);
  });

  // Vencer dentro da semana já é "da semana" — o "até dd/mm" é só para o
  // prazo que cai depois dela.
  it("vence dentro da semana: é da semana, não 'em andamento'", () => {
    const vence = cp("2026-08-24", "2026-09-10");
    expect(emAndamentoNaSemana(vence, ini, fim)).toBe(false);
    expect(checkpointDaWeekly(vence, ini, fim)).toBe(true);
  });

  it("concluído antes da semana não está mais em andamento nela", () => {
    const fechado = cp("2026-08-24", "2026-09-30", { isCompleted: true, completedAt: d("2026-09-02") });
    expect(checkpointDaWeekly(fechado, ini, fim)).toBe(false);
  });

  // Olhando uma semana passada: o que foi concluído depois dela estava em
  // andamento naquela semana — o histórico não pode perdê-lo.
  it("concluído depois da semana continua em andamento nela", () => {
    const depois = cp("2026-08-24", "2026-09-30", { isCompleted: true, completedAt: d("2026-09-20") });
    expect(emAndamentoNaSemana(depois, ini, fim)).toBe(true);
  });
});

// Na Weekly de Rituais o card se lê por tema: os checkpoints vêm em ordem
// alfabética de tag.
describe("ordenarPorTag", () => {
  const tag = (name: string) => ({ id: name, name, color: "sky" });
  const cp = (id: string, tags: string[], children: CheckpointItem[] = []): CheckpointItem => ({
    id, name: id, description: null, startDate: null, dueDate: new Date("2026-10-21T00:00:00Z"),
    isCompleted: false, completedAt: null, categoria: null, members: [], tags: tags.map(tag),
    inProgress: false, children,
  });
  const ids = (cps: CheckpointItem[]) => cps.map((c) => c.id);

  it("ordena pelo nome da tag, sem diferenciar maiúscula nem acento", () => {
    expect(ids(ordenarPorTag([cp("q", ["QA"]), cp("d", ["design"]), cp("a", ["Análise"])]))).toEqual(["a", "d", "q"]);
  });

  it("sem tag vai para o fim", () => {
    expect(ids(ordenarPorTag([cp("sem", []), cp("t", ["Tracking"])]))).toEqual(["t", "sem"]);
  });

  it("com várias tags, vale a primeira em ordem alfabética", () => {
    expect(ids(ordenarPorTag([cp("q", ["QA"]), cp("multi", ["Tracking", "Design"])]))).toEqual(["multi", "q"]);
  });

  // A consulta já entrega por prazo: empate não pode embaralhar.
  it("mesma tag mantém a ordem de chegada", () => {
    expect(ids(ordenarPorTag([cp("1", ["QA"]), cp("2", ["QA"]), cp("3", ["QA"])]))).toEqual(["1", "2", "3"]);
  });

  it("ordena cada nível entre irmãos, com o filho embaixo do pai", () => {
    const r = ordenarPorTag([cp("pai", ["Z"], [cp("f-qa", ["QA"]), cp("f-design", ["Design"])]), cp("outro", ["A"])]);
    expect(ids(r)).toEqual(["outro", "pai"]);
    expect(ids(r[1].children)).toEqual(["f-design", "f-qa"]);
  });
});
