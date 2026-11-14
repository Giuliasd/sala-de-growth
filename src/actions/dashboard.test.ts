import { afterEach, describe, expect, it, vi } from "vitest";

// Mesmo arranjo de weekly-activity.test: prisma e sessão mockados, retry
// repassado direto. O que importa aqui são os filtros que as consultas montam.
const iniciativaFindMany = vi.fn().mockResolvedValue([]);
const experimentoFindMany = vi.fn().mockResolvedValue([]);
const icCount = vi.fn().mockResolvedValue(0);
const ecCount = vi.fn().mockResolvedValue(0);
const icFindMany = vi.fn().mockResolvedValue([]);
const ecFindMany = vi.fn().mockResolvedValue([]);
const getCurrentMember = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findMany: iniciativaFindMany },
    experimento: { findMany: experimentoFindMany },
    initiativeCheckpoint: { count: icCount, findMany: icFindMany },
    experimentoCheckpoint: { count: ecCount, findMany: ecFindMany },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentMember }));

const lideranca = { id: "lider", name: "Lider", role: "LIDERANCA" };
const colaborador = { id: "camila", name: "Camila", role: "COLABORADOR" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("getTravasDoTime", () => {
  it("é só da liderança", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getTravasDoTime } = await import("./dashboard");
    await expect(getTravasDoTime()).rejects.toThrow(/Acesso negado/);
    expect(iniciativaFindMany).not.toHaveBeenCalled();
  });

  it("sem próximo passo = em andamento sem nenhum checkpoint aberto", async () => {
    getCurrentMember.mockResolvedValue(lideranca);
    const { getTravasDoTime } = await import("./dashboard");
    await getTravasDoTime();

    const where = iniciativaFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("EM_ANDAMENTO");
    expect(where.deletedAt).toBeNull();
    // Atrasado aberto conta como próximo passo: não há corte por data.
    expect(where.NOT).toEqual({ checkpoints: { some: { isCompleted: false } } });
    // Visão do time: sem filtro de pessoa.
    expect(where.members).toBeUndefined();
  });

  it("parados no fluxo = análise vencida ou relatório pronto", async () => {
    getCurrentMember.mockResolvedValue(lideranca);
    const { getTravasDoTime } = await import("./dashboard");
    await getTravasDoTime();

    // Terceira consulta: experimentos parados.
    const where = experimentoFindMany.mock.calls[1][0].where;
    expect(where.OR).toEqual([
      { status: "AGUARDANDO_RESULTADOS", analysisDate: { lt: expect.any(Date) } },
      { status: "RELATORIO_PRONTO" },
    ]);
  });
});

describe("getTravasDaPessoa", () => {
  it("filtra pelos itens em que a pessoa é responsável", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getTravasDaPessoa } = await import("./dashboard");
    await getTravasDaPessoa("camila");

    expect(iniciativaFindMany.mock.calls[0][0].where.members).toEqual({ some: { id: "camila" } });
    expect(experimentoFindMany.mock.calls[1][0].where.members).toEqual({ some: { id: "camila" } });
  });

  it("marco em risco: só entra se algum necessário pendente atrasou ou vence depois dele", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const item = { id: "i1", name: "Iniciativa", status: "EM_ANDAMENTO", priority: "ALTA", members: [] };
    const req = (id: string, dueDate: string, isCompleted = false) => ({
      id, name: id, parentId: null, categoria: null, isCompleted, dueDate: new Date(dueDate),
    });
    const marco = (id: string, dueDate: string, requisitos: ReturnType<typeof req>[]) => ({
      id, name: id, parentId: null, categoria: "MARCO", isCompleted: false, dueDate: new Date(dueDate),
      requisitos, initiative: item,
    });
    icFindMany.mockResolvedValueOnce([
      // Necessário vence depois do marco: em risco.
      marco("em-risco", "2099-01-10", [req("a", "2099-01-20")]),
      // Necessário dentro do prazo: fora.
      marco("tranquilo", "2099-01-10", [req("b", "2099-01-05")]),
    ]);
    const { getTravasDaPessoa } = await import("./dashboard");
    const r = await getTravasDaPessoa("camila");

    expect(r.marcosEmRisco.map((m) => m.marco.id)).toEqual(["em-risco"]);
    expect(r.marcosEmRisco[0].resumo).toBe("1 vence depois do marco");
    expect(r.marcosEmRisco[0].item).toMatchObject({ id: "i1", kind: "iniciativa" });
    const [itemVisivel, vencidoSoDeItemVivo, daPessoa] = icFindMany.mock.calls[0][0].where.AND;
    // Da pessoa: responsável do marco, ou marco sem responsável de item dela.
    expect(daPessoa.OR).toEqual([
      { members: { some: { id: "camila" } } },
      { members: { none: {} }, initiative: { members: { some: { id: "camila" } } } },
    ]);
    // Mesma visibilidade dos "Marcos à frente": nada de item cancelado, e o
    // vencido antes da semana só de item vivo.
    expect(itemVisivel).toEqual({ initiative: { deletedAt: null, status: { notIn: ["CANCELADA"] } } });
    expect(vencidoSoDeItemVivo.OR[1].initiative.status.notIn).toEqual(["CONCLUIDA", "RELATORIO_FINALIZADO", "PAUSADA"]);
    const [expVisivel] = ecFindMany.mock.calls[0][0].where.AND;
    expect(expVisivel).toEqual({ experimento: { deletedAt: null, status: { notIn: ["ARQUIVADO"] } } });
  });

  it("colaborador não lê as travas de outra pessoa", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getTravasDaPessoa } = await import("./dashboard");
    await expect(getTravasDaPessoa("rafael")).rejects.toThrow(/Acesso negado/);
  });
});

describe("getProximaSemanaDaPessoa", () => {
  it("conta checkpoints abertos da semana que vem: os da pessoa e os sem dono de item dela", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    icCount.mockResolvedValueOnce(2);
    ecCount.mockResolvedValueOnce(1);
    const { getProximaSemanaDaPessoa } = await import("./dashboard");
    const r = await getProximaSemanaDaPessoa("camila");

    expect(r.checkpoints).toBe(3);
    const where = icCount.mock.calls[0][0].where;
    expect(where.isCompleted).toBe(false);
    expect(where.OR[0]).toEqual({ members: { some: { id: "camila" } } });
    expect(where.OR[1]).toEqual({
      members: { none: {} },
      initiative: { deletedAt: null, members: { some: { id: "camila" } } },
    });
    // A semana que vem começa numa segunda-feira.
    expect(new Date(where.dueDate.gte).getUTCDay()).toBe(1);
  });
});

describe("getAguardandoProximoPasso", () => {
  it("é só da liderança", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getAguardandoProximoPasso } = await import("./dashboard");
    await expect(getAguardandoProximoPasso()).rejects.toThrow(/Acesso negado/);
  });

  it("= iniciativa escrevendo relatório + experimento aguardando resultados, sem relatório pronto", async () => {
    getCurrentMember.mockResolvedValue(lideranca);
    const ini = { id: "i", name: "Ini", status: "ESCREVENDO_RELATORIO", priority: "ALTA", members: [], analysisDate: null };
    const exp = { id: "e", name: "Exp", status: "AGUARDANDO_RESULTADOS", members: [], analysisDate: new Date("2026-10-01") };
    iniciativaFindMany.mockResolvedValueOnce([ini]);
    experimentoFindMany.mockResolvedValueOnce([exp]);
    const { getAguardandoProximoPasso } = await import("./dashboard");
    const r = await getAguardandoProximoPasso();

    expect(iniciativaFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null, status: "ESCREVENDO_RELATORIO" });
    expect(experimentoFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null, status: "AGUARDANDO_RESULTADOS" });
    // Com data de análise primeiro; sem data no fim.
    expect(r.map((x) => `${x.kind}:${x.id}`)).toEqual(["experimento:e", "iniciativa:i"]);
  });
});

describe("getMarcosDoTime", () => {
  it("é só da liderança", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getMarcosDoTime } = await import("./dashboard");
    await expect(getMarcosDoTime()).rejects.toThrow(/Acesso negado/);
  });

  it("visibilidade da Weekly: sem item cancelado/arquivado; atrasado antigo só de item vivo", async () => {
    getCurrentMember.mockResolvedValue(lideranca);
    icFindMany.mockResolvedValueOnce([]);
    const { getMarcosDoTime } = await import("./dashboard");
    await getMarcosDoTime();

    const ini = icFindMany.mock.calls[0][0].where;
    const exp = ecFindMany.mock.calls[0][0].where;
    // Sem limite para trás: o atrasado entra.
    expect(ini.dueDate.gte).toBeUndefined();
    expect(ini.AND[0]).toEqual({ initiative: { deletedAt: null, status: { notIn: ["CANCELADA"] } } });
    expect(exp.AND[0]).toEqual({ experimento: { deletedAt: null, status: { notIn: ["ARQUIVADO"] } } });
    // Venceu antes desta semana? Só de item que não acabou nem parou.
    const [daSemana, deItemVivo] = ini.AND[1].OR;
    expect(new Date(daSemana.dueDate.gte).getUTCDay()).toBe(1);
    expect(deItemVivo.initiative.status.notIn).toEqual(["CONCLUIDA", "RELATORIO_FINALIZADO", "PAUSADA"]);
    expect(exp.AND[1].OR[1].experimento.status.notIn).toEqual(["RESULTADOS_APRESENTADOS", "PAUSADO"]);
  });

  it("marcos abertos desta semana e da próxima; sem necessários, o que falta são os filhos abertos", async () => {
    getCurrentMember.mockResolvedValue(lideranca);
    const item = { id: "i1", name: "Iniciativa", status: "EM_ANDAMENTO", priority: "ALTA", members: [] };
    const filho = { id: "f", name: "f", parentId: "m2", categoria: null, isCompleted: false, dueDate: new Date("2099-01-01"), members: [] };
    const req = { id: "r", name: "r", parentId: null, categoria: null, isCompleted: false, dueDate: new Date("2099-01-01"), members: [] };
    const marco = (id: string, requisitos: unknown[], children: unknown[]) => ({
      id, name: id, parentId: null, categoria: "MARCO", isCompleted: false, dueDate: new Date("2099-01-02"),
      members: [], requisitos, children, initiative: item,
    });
    icFindMany.mockResolvedValueOnce([marco("m1", [req], [filho]), marco("m2", [], [filho])]);
    const { getMarcosDoTime } = await import("./dashboard");
    const r = await getMarcosDoTime();

    const where = icFindMany.mock.calls[0][0].where;
    expect(where.categoria).toBe("MARCO");
    expect(where.isCompleted).toBe(false);
    const m1 = r.find((m) => m.id === "m1")!;
    const m2 = r.find((m) => m.id === "m2")!;
    expect(m1.progresso?.pendentes.map((p) => p.id)).toEqual(["r"]);
    expect(m1.subPendentes).toEqual([]);
    expect(m2.progresso).toBeNull();
    expect(m2.subPendentes.map((p) => p.id)).toEqual(["f"]);
  });
});

describe("getPrazosVencidos", () => {
  it("visão do time é só da liderança", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getPrazosVencidos } = await import("./dashboard");
    await expect(getPrazosVencidos()).rejects.toThrow(/Acesso negado/);
    expect(iniciativaFindMany).not.toHaveBeenCalled();
  });

  it("colaborador não lê os prazos vencidos de outra pessoa, mas lê os seus", async () => {
    getCurrentMember.mockResolvedValue(colaborador);
    const { getPrazosVencidos } = await import("./dashboard");
    await expect(getPrazosVencidos("outra")).rejects.toThrow(/Acesso negado/);
    await getPrazosVencidos("camila");
    expect(iniciativaFindMany.mock.calls[0][0].where.members).toEqual({ some: { id: "camila" } });
  });

  it("= em andamento, não excluído, com o prazo final antes de hoje; conta os checkpoints abertos", async () => {
    getCurrentMember.mockResolvedValue(lideranca);
    iniciativaFindMany.mockResolvedValueOnce([
      { id: "i2", name: "B", status: "EM_ANDAMENTO", endDate: new Date("2026-10-30"), members: [], frente: null, _count: { checkpoints: 1 }, priority: null },
    ]);
    experimentoFindMany.mockResolvedValueOnce([
      { id: "e1", name: "A", status: "EM_ANDAMENTO", endDate: new Date("2026-08-28"), members: [], frente: null, _count: { checkpoints: 0 } },
    ]);
    const { getPrazosVencidos } = await import("./dashboard");
    const itens = await getPrazosVencidos();

    for (const call of [iniciativaFindMany.mock.calls[0][0], experimentoFindMany.mock.calls[0][0]]) {
      expect(call.where.status).toBe("EM_ANDAMENTO");
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.endDate.lt).toBeInstanceOf(Date);
      expect(call.where.members).toBeUndefined();
      expect(call.select._count).toEqual({ select: { checkpoints: { where: { isCompleted: false } } } });
    }
    // Uma lista só, do prazo mais antigo para o mais recente.
    expect(itens.map((i) => `${i.kind}:${i.id}`)).toEqual(["experimento:e1", "iniciativa:i2"]);
  });
});
