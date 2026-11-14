import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  alternarTipo,
  TIPOS_DE_EVENTO,
  deslocarMes,
  estaAtrasado,
  FILTROS_PADRAO,
  filtrarEventos,
  filtrosDaUrl,
  filtrosParaUrl,
  intervaloDaGrade,
  montarEventos,
  moverEvento,
  parseMes,
  rotuloDeAusencia,
  semanasDaGrade,
  travasDoDia,
  type AusenciaDoCalendario,
  type CheckpointDoCalendario,
  type ItemComDatas,
} from "./calendario";

// O calendário de datas-chave junta, numa grade de mês, o lançamento e a análise
// de cada iniciativa/experimento e os checkpoints de comunicação e de marco.
// Datas são date-only em UTC.

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const FRENTE = { id: "f1", name: "Aquisição" };
const ANA = { id: "m1", name: "Ana Souza" };
const BIA = { id: "m2", name: "Bia Lima" };
const HOJE = "2026-11-15";

function item(over: Partial<ItemComDatas> = {}): ItemComDatas {
  return {
    id: "i1",
    name: "Item",
    status: "EM_ANDAMENTO",
    launchDate: null,
    analysisDate: null,
    frente: FRENTE,
    members: [ANA],
    ...over,
  };
}

function cp(over: Partial<CheckpointDoCalendario> = {}): CheckpointDoCalendario {
  return {
    id: "c1",
    name: "E-mail de aviso",
    startDate: null,
    dueDate: d("2026-11-20"),
    isCompleted: false,
    categoria: "COMUNICACAO",
    members: [BIA],
    item: { id: "e1", name: "Exp", status: "EM_ANDAMENTO", frente: FRENTE },
    ...over,
  };
}

const vazio = { iniciativas: [], experimentos: [], checkpointsDeIniciativa: [], checkpointsDeExperimento: [] };
const NOV = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
const montar = (entrada: Partial<Parameters<typeof montarEventos>[0]>) =>
  montarEventos({ ...vazio, ...entrada }, NOV.inicio, NOV.fim, HOJE);

describe("parseMes / deslocarMes", () => {
  it("lê YYYY-MM e rejeita lixo", () => {
    expect(parseMes("2026-11")).toEqual({ ano: 2026, mes: 10 });
    expect(parseMes("2026-13")).toBeNull();
    expect(parseMes("1999-01")).toBeNull();
    expect(parseMes("nov")).toBeNull();
    expect(parseMes(undefined)).toBeNull();
  });

  it("vira o ano nos dois sentidos", () => {
    expect(deslocarMes(2026, 11, 1)).toEqual({ ano: 2027, mes: 0 });
    expect(deslocarMes(2026, 0, -1)).toEqual({ ano: 2025, mes: 11 });
  });
});

describe("intervaloDaGrade", () => {
  it("vai da segunda da semana do dia 1 ao domingo da semana do último dia", () => {
    // Novembro/2026: dia 1 é domingo, dia 30 é segunda.
    const { inicio, fim } = intervaloDaGrade(2026, 10);
    expect(inicio.toISOString().slice(0, 10)).toBe("2026-10-26");
    expect(fim.toISOString().slice(0, 10)).toBe("2026-12-06");
  });

  it("não acrescenta semana quando o mês já começa na segunda e termina no domingo", () => {
    // Fevereiro/2027: dia 1 é segunda, dia 28 é domingo.
    const { inicio, fim } = intervaloDaGrade(2027, 1);
    expect(inicio.toISOString().slice(0, 10)).toBe("2027-02-01");
    expect(fim.toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(semanasDaGrade(2027, 1)).toHaveLength(4);
  });

  it("semanas têm 7 dias começando na segunda", () => {
    const semanas = semanasDaGrade(2026, 10);
    expect(semanas).toHaveLength(6);
    for (const s of semanas) {
      expect(s).toHaveLength(7);
      expect(s[0].getUTCDay()).toBe(1);
    }
  });
});

describe("montarEventos", () => {
  it("gera lançamento e análise do item, cada um no seu dia", () => {
    const eventos = montar({ iniciativas: [item({ launchDate: d("2026-11-05"), analysisDate: d("2026-11-20") })] });
    expect(eventos.map((e) => [e.tipo, e.data, e.item.tipo, e.checkpointId])).toEqual([
      ["LANCAMENTO", "2026-11-05", "iniciativa", null],
      ["ANALISE", "2026-11-20", "iniciativa", null],
    ]);
    expect(eventos[0].concluido).toBeNull();
  });

  it("deixa de fora a data do item que cai fora do período", () => {
    const eventos = montar({ experimentos: [item({ launchDate: d("2026-11-05"), analysisDate: d("2026-12-20") })] });
    expect(eventos.map((e) => e.tipo)).toEqual(["LANCAMENTO"]);
  });

  it("checkpoint de comunicação e de marco viram evento; checkpoint comum não", () => {
    const eventos = montar({
      checkpointsDeExperimento: [
        cp({ id: "a", categoria: "COMUNICACAO", startDate: d("2026-11-18") }),
        cp({ id: "b", categoria: "MARCO", name: "Go/no-go", isCompleted: true }),
        cp({ id: "c", categoria: null }),
      ],
    });
    expect(eventos.map((e) => [e.id, e.tipo, e.concluido, e.checkpointId, e.inicio])).toEqual([
      ["COMUNICACAO:a", "COMUNICACAO", false, "a", "2026-11-18"],
      ["MARCO:b", "MARCO", true, "b", null],
    ]);
    // Responsáveis são os do checkpoint, não os do item.
    expect(eventos[0].members).toEqual([BIA]);
    expect(eventos[0].item).toEqual({ id: "e1", nome: "Exp", tipo: "experimento" });
  });

  it("ordena por dia e, no mesmo dia, lançamento antes de análise, comunicação e marco", () => {
    const eventos = montar({
      iniciativas: [item({ launchDate: d("2026-11-10"), analysisDate: d("2026-11-10") })],
      checkpointsDeIniciativa: [
        cp({ id: "m", categoria: "MARCO", dueDate: d("2026-11-10") }),
        cp({ id: "x", categoria: "COMUNICACAO", dueDate: d("2026-11-03") }),
        cp({ id: "y", categoria: "COMUNICACAO", dueDate: d("2026-11-10") }),
      ],
    });
    expect(eventos.map((e) => `${e.data} ${e.tipo}`)).toEqual([
      "2026-11-03 COMUNICACAO",
      "2026-11-10 LANCAMENTO",
      "2026-11-10 ANALISE",
      "2026-11-10 COMUNICACAO",
      "2026-11-10 MARCO",
    ]);
  });
});

describe("estaAtrasado", () => {
  const ontem = "2026-11-14";
  const exp = (status: string) => ({ tipo: "experimento" as const, status });
  const ini = (status: string) => ({ tipo: "iniciativa" as const, status });

  it("nada que cai hoje ou depois está atrasado", () => {
    expect(estaAtrasado({ tipo: "COMUNICACAO", data: HOJE, concluido: false }, exp("EM_ANDAMENTO"), HOJE)).toBe(false);
    expect(estaAtrasado({ tipo: "LANCAMENTO", data: "2026-12-01", concluido: null }, exp("BACKLOG"), HOJE)).toBe(false);
  });

  it("comunicação e marco: atrasados só se não concluídos", () => {
    expect(estaAtrasado({ tipo: "COMUNICACAO", data: ontem, concluido: false }, exp("EM_ANDAMENTO"), HOJE)).toBe(true);
    expect(estaAtrasado({ tipo: "MARCO", data: ontem, concluido: true }, exp("EM_ANDAMENTO"), HOJE)).toBe(false);
  });

  it("análise: atrasada enquanto o item não chegou ao relatório; pausado não conta", () => {
    const analise = { tipo: "ANALISE" as const, data: ontem, concluido: null };
    expect(estaAtrasado(analise, exp("AGUARDANDO_RESULTADOS"), HOJE)).toBe(true);
    expect(estaAtrasado(analise, exp("EM_ANDAMENTO"), HOJE)).toBe(true);
    expect(estaAtrasado(analise, exp("RELATORIO_PRONTO"), HOJE)).toBe(false);
    expect(estaAtrasado(analise, exp("PAUSADO"), HOJE)).toBe(false);
    expect(estaAtrasado(analise, ini("CONCLUIDA"), HOJE)).toBe(true);
    expect(estaAtrasado(analise, ini("ESCREVENDO_RELATORIO"), HOJE)).toBe(false);
  });

  it("lançamento: atrasado só se o item nem começou", () => {
    const lanc = { tipo: "LANCAMENTO" as const, data: ontem, concluido: null };
    expect(estaAtrasado(lanc, ini("BACKLOG"), HOJE)).toBe(true);
    expect(estaAtrasado(lanc, ini("EM_ANDAMENTO"), HOJE)).toBe(false);
  });

  it("chega no evento montado", () => {
    const eventos = montar({
      checkpointsDeIniciativa: [cp({ id: "velho", dueDate: d("2026-11-02") })],
      experimentos: [item({ status: "AGUARDANDO_RESULTADOS", analysisDate: d("2026-11-03") })],
    });
    expect(eventos.map((e) => [e.id, e.atrasado])).toEqual([
      ["COMUNICACAO:velho", true],
      ["ANALISE:i1", true],
    ]);
  });
});

describe("conflitos com ausência", () => {
  const ferias: AusenciaDoCalendario = {
    memberId: BIA.id,
    memberName: BIA.name,
    type: "FERIAS",
    startDate: d("2026-11-16"),
    endDate: d("2026-11-25"),
  };

  it("marca o responsável fora no dia, só com o tipo genérico", () => {
    const eventos = montar({
      checkpointsDeExperimento: [cp({ dueDate: d("2026-11-20") }), cp({ id: "c2", dueDate: d("2026-11-26") })],
      ausencias: [ferias, { ...ferias, memberId: ANA.id, memberName: ANA.name, type: "LICENCA_MEDICA" }],
    });
    expect(eventos.map((e) => [e.id, e.conflitos])).toEqual([
      ["COMUNICACAO:c1", [{ pessoa: "Bia Lima", tipo: "férias" }]],
      ["COMUNICACAO:c2", []],
    ]);
  });

  it("lançamento e análise olham os responsáveis do item; licença sai só como licença", () => {
    const eventos = montar({
      iniciativas: [item({ launchDate: d("2026-11-20") })],
      ausencias: [{ ...ferias, memberId: ANA.id, memberName: ANA.name, type: "LICENCA_MATERNIDADE" }],
    });
    expect(eventos[0].conflitos).toEqual([{ pessoa: "Ana Souza", tipo: "licença" }]);
  });

  it("rotuloDeAusencia nunca expõe o tipo de licença", () => {
    expect(rotuloDeAusencia("LICENCA_MEDICA")).toBe("licença");
    expect(rotuloDeAusencia("DAY_OFF")).toBe("day off");
    expect(rotuloDeAusencia("OUTROS")).toBe("ausência");
  });

  it("travasDoDia acha a trava que cobre o dia", () => {
    const bf = { nome: "Black Friday", inicio: "2026-11-20", fim: "2026-11-30" };
    expect(travasDoDia([bf], "2026-11-25")).toEqual([bf]);
    expect(travasDoDia([bf], "2026-11-19")).toEqual([]);
  });
});

describe("moverEvento", () => {
  it("desloca início e prazo do checkpoint o mesmo tanto", () => {
    const [e] = montar({ checkpointsDeIniciativa: [cp({ startDate: d("2026-11-18"), dueDate: d("2026-11-20") })] });
    const movido = moverEvento(e, "2026-11-27", HOJE);
    expect([movido.inicio, movido.data]).toEqual(["2026-11-25", "2026-11-27"]);
  });

  it("para o futuro deixa de estar atrasado; checkpoint aberto para o passado fica atrasado", () => {
    const [e] = montar({ checkpointsDeIniciativa: [cp({ dueDate: d("2026-11-02") })] });
    expect(e.atrasado).toBe(true);
    expect(moverEvento(e, "2026-11-20", HOJE).atrasado).toBe(false);
    const [futuro] = montar({ checkpointsDeIniciativa: [cp()] });
    expect(moverEvento(futuro, "2026-11-10", HOJE).atrasado).toBe(true);
  });
});

describe("filtros", () => {
  const eventos = montar({
    iniciativas: [item({ id: "i1", launchDate: d("2026-11-05") })],
    experimentos: [item({ id: "e1", launchDate: d("2026-11-05"), frente: { id: "f2", name: "Retenção" } })],
    checkpointsDeExperimento: [cp({ id: "c1", members: [ANA, BIA], dueDate: d("2026-11-10") })],
  });

  it("sem filtro devolve tudo", () => {
    expect(filtrarEventos(eventos, FILTROS_PADRAO)).toHaveLength(3);
  });

  it("filtra por tipo de evento, tipo de item, frente, responsável e atraso", () => {
    const f = FILTROS_PADRAO;
    expect(filtrarEventos(eventos, { ...f, tipos: new Set(["COMUNICACAO"] as const) })).toHaveLength(1);
    expect(filtrarEventos(eventos, { ...f, tipoDeItem: "iniciativa" }).map((e) => e.item.id)).toEqual(["i1"]);
    expect(filtrarEventos(eventos, { ...f, frenteId: "f2" }).map((e) => e.item.id)).toEqual(["e1"]);
    // Bia é responsável só da comunicação (dividida com a Ana).
    expect(filtrarEventos(eventos, { ...f, memberId: BIA.id }).map((e) => e.tipo)).toEqual(["COMUNICACAO"]);
    // A comunicação de 10/11, aberta, é a única atrasada (hoje é 15/11).
    expect(filtrarEventos(eventos, { ...f, soAtrasados: true }).map((e) => e.id)).toEqual(["COMUNICACAO:c1"]);
  });

  it("agrupa por dia mantendo a ordem", () => {
    const porDia = agruparPorDia(eventos);
    expect([...porDia.keys()]).toEqual(["2026-11-05", "2026-11-10"]);
    expect(porDia.get("2026-11-05")).toHaveLength(2);
  });

  it("vão e voltam pela URL, e o padrão não suja o link", () => {
    const params = new URLSearchParams();
    filtrosParaUrl(FILTROS_PADRAO, params);
    expect(params.toString()).toBe("");

    const ligados = {
      tipos: new Set(["MARCO", "LANCAMENTO"] as const),
      tipoDeItem: "experimento" as const,
      frenteId: "f2",
      memberId: "m1",
      soAtrasados: true,
    };
    const url = new URLSearchParams();
    filtrosParaUrl(ligados, url);
    // Ordem canônica dos tipos, não a de clique.
    expect(url.get("tipos")).toBe("LANCAMENTO,MARCO");
    const volta = filtrosDaUrl(Object.fromEntries(url.entries()));
    expect({ ...volta, tipos: [...volta.tipos].sort() }).toEqual({ ...ligados, tipos: ["LANCAMENTO", "MARCO"] });
  });

  it("ignora lixo na URL", () => {
    const f = filtrosDaUrl({ tipos: "FOO,BAR", item: "x", atrasados: "sim" });
    expect(f.tipos.size).toBe(4);
    expect(f.tipoDeItem).toBe("todos");
    expect(f.soAtrasados).toBe(false);
  });
});

describe("alternarTipo (clique na pill de tipo)", () => {
  const todos = new Set(TIPOS_DE_EVENTO);
  const lista = (s: Set<string>) => [...s].sort();

  it("com todos à vista, o clique isola o tipo clicado", () => {
    expect(lista(alternarTipo(todos, "COMUNICACAO"))).toEqual(["COMUNICACAO"]);
  });

  it("com o filtro ligado, o clique soma ou tira o tipo", () => {
    const so = new Set(["COMUNICACAO"] as const);
    expect(lista(alternarTipo(so, "MARCO"))).toEqual(["COMUNICACAO", "MARCO"]);
    expect(lista(alternarTipo(new Set(["COMUNICACAO", "MARCO"] as const), "MARCO"))).toEqual(["COMUNICACAO"]);
  });

  it("tirar o último tipo volta a mostrar todos", () => {
    expect(alternarTipo(new Set(["COMUNICACAO"] as const), "COMUNICACAO").size).toBe(TIPOS_DE_EVENTO.length);
  });

  it("não altera o conjunto recebido", () => {
    const so = new Set(["MARCO"] as const);
    alternarTipo(so, "LANCAMENTO");
    expect(lista(so)).toEqual(["MARCO"]);
  });
});
