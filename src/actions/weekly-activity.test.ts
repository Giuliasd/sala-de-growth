import { afterEach, describe, expect, it, vi } from "vitest";

// Mockamos as duas dependências externas do action:
//   - @/lib/prisma   → as queries da semana
//   - @/lib/session  → o gate de auth
//
// O `withDbRetry` é repassado direto (chama o fn uma vez): o retry em si já é
// testado em lib/prisma.test.ts. O que importa aqui é o que acontece quando ele
// desiste — é esse caminho que causava a mentira no dashboard.
const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findMany },
    experimento: { findMany },
    initiativeCheckpoint: { findMany },
    experimentoCheckpoint: { findMany },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn().mockResolvedValue({
    id: "member-self",
    name: "Fulano",
    email: "fulano@example.com",
    role: "LIDERANCA",
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

// Regressão: o action engolia o erro de banco e devolvia EMPTY_RESULT, então o
// card "Esta semana" renderizava "Nenhuma atividade esta semana". Numa ferramenta
// de planejamento isso é pior que um erro — o time conclui que não há nada
// agendado. Aconteceu 5× em produção em 03/08/2026.
describe("getWeeklyActivity — falha de banco não vira semana vazia", () => {
  it("PROPAGA o erro do banco em vez de devolver semana vazia", async () => {
    findMany.mockRejectedValue(
      new Error("Connection terminated due to connection timeout"),
    );
    const { getWeeklyActivity } = await import("./weekly-activity");
    await expect(getWeeklyActivity()).rejects.toThrow(/Connection terminated/);
  });

  it("semana genuinamente sem atividades resolve vazia — não confundir com erro", async () => {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await expect(getWeeklyActivity()).resolves.toMatchObject({
      iniciativas: [],
      experimentos: [],
    });
  });
});

// O item concluído e vencido sai da semana, mas a cláusula precisa ser um OR
// positivo. Escrita como NOT(concluído AND endDate < semana), o Postgres
// avalia UNKNOWN quando endDate é NULL e descarta a linha — todo item sem data
// de fim sumiria da Weekly sem ninguém pedir.
describe("getWeeklyActivity — item encerrado antes da semana", () => {
  async function whereDe(indice: number) {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await getWeeklyActivity(undefined, "2026-09-07");
    return findMany.mock.calls[indice][0].where as {
      AND: { OR: { status?: { notIn: string[] }; endDate?: unknown }[] }[];
    };
  }

  it("iniciativa: exclui concluída vencida, poupa quem tem relatório pendente", async () => {
    const [clausula] = (await whereDe(0)).AND;
    const statuses = clausula.OR.find((c) => c.status)?.status?.notIn;
    expect(statuses).toEqual(["CONCLUIDA", "RELATORIO_FINALIZADO"]);
    // ESCREVENDO_RELATORIO ainda é trabalho de alguém: continua na Weekly.
    expect(statuses).not.toContain("ESCREVENDO_RELATORIO");
  });

  it("experimento: relatório pronto ainda espera apresentação, então fica", async () => {
    const [clausula] = (await whereDe(1)).AND;
    const statuses = clausula.OR.find((c) => c.status)?.status?.notIn;
    expect(statuses).toEqual(["RESULTADOS_APRESENTADOS"]);
    expect(statuses).not.toContain("RELATORIO_PRONTO");
  });

  it("item sem endDate sobrevive ao corte — sem data não dá para dizer que passou", async () => {
    for (const indice of [0, 1]) {
      const [clausula] = (await whereDe(indice)).AND;
      expect(clausula.OR).toContainEqual({ endDate: null });
    }
  });

  it("o corte usa a semana EXIBIDA, não hoje — o passado não é reescrito", async () => {
    const [clausula] = (await whereDe(0)).AND;
    const porData = clausula.OR.find(
      (c) => c.endDate && typeof c.endDate === "object"
    )?.endDate as { gte: Date };
    expect(porData.gte.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });
});

// Pausado é mais estrito que concluído: só entra se for ESTA a semana em que
// o item termina. Trabalho pausado não está sendo tocado, e ficar listado toda
// semana até o endDate planejado é ruído no ritual.
describe("getWeeklyActivity — item pausado", () => {
  async function clausulaDePausa(indice: number) {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await getWeeklyActivity(undefined, "2026-09-07");
    const where = findMany.mock.calls[indice][0].where as {
      AND: { OR: { NOT?: { status: string }; endDate?: { gte: Date; lte: Date } }[] }[];
    };
    // A primeira cláusula do AND é a do concluído; a segunda, a do pausado.
    return where.AND[1];
  }

  it("iniciativa: só escapa do corte quem NÃO está pausada", async () => {
    const c = await clausulaDePausa(0);
    expect(c.OR.find((x) => x.NOT)?.NOT?.status).toBe("PAUSADA");
  });

  it("experimento: mesma regra, com o nome que o enum dele usa", async () => {
    const c = await clausulaDePausa(1);
    expect(c.OR.find((x) => x.NOT)?.NOT?.status).toBe("PAUSADO");
  });

  it("pausado aparece só quando TERMINA na semana exibida — janela fechada dos dois lados", async () => {
    for (const indice of [0, 1]) {
      const janela = (await clausulaDePausa(indice)).OR.find((x) => x.endDate)?.endDate;
      expect(janela?.gte.toISOString()).toBe("2026-09-07T00:00:00.000Z");
      // `lte` é o que diferencia do corte do concluído: lá basta não ter
      // passado, aqui precisa terminar DENTRO da semana.
      expect(janela?.lte.toISOString()).toBe("2026-09-13T23:59:59.999Z");
    }
  });
});

// Filtro por pessoa no dashboard: quem responde só por um SUBcheckpoint não é
// responsável pelo item. Filtrando só pelos responsáveis do item, o item (e o
// checkpoint pai que dá contexto ao filho) sumia da semana dessa pessoa.
describe("getWeeklyActivity — filtro por pessoa", () => {
  async function filtroDaPessoa(indice: number) {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await getWeeklyActivity("m-camila", "2026-09-07");
    const where = findMany.mock.calls[indice][0].where as {
      members?: unknown;
      AND: { OR?: Record<string, unknown>[] }[];
    };
    return where;
  }

  it("iniciativa e experimento: entram por responsável do item OU de um checkpoint da semana", async () => {
    for (const indice of [0, 1]) {
      const where = await filtroDaPessoa(indice);
      // Não pode mais existir o filtro solto só pelo item.
      expect(where.members).toBeUndefined();
      const clausula = where.AND[2];
      expect(clausula.OR).toContainEqual({ members: { some: { id: "m-camila" } } });
      const porCheckpoint = clausula.OR!.find((c) => "checkpoints" in c) as {
        checkpoints: { some: { members: unknown; OR: unknown[] } };
      };
      expect(porCheckpoint.checkpoints.some.members).toEqual({ some: { id: "m-camila" } });
      // O checkpoint tem de ser DA SEMANA — senão um combinado antigo traria o item.
      expect(porCheckpoint.checkpoints.some.OR.length).toBeGreaterThan(0);
    }
  });

  it("sem pessoa, não filtra", async () => {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await getWeeklyActivity(undefined, "2026-09-07");
    expect(findMany.mock.calls[0][0].where.AND).toHaveLength(2);
  });
});

// Concluir a iniciativa na sexta — ou pausá-la na terça — tirava o item da
// Weekly e levava junto os checkpoints que foram feitos naquela semana: a
// reunião de sexta não via o que aconteceu, e o histórico perdia a semana.
describe("getWeeklyActivity — item encerrado ou pausado com checkpoint na semana", () => {
  const d = (s: string) => new Date(s);
  function cpCru(id: string, extra: Record<string, unknown> = {}) {
    return {
      id, name: id, description: null, startDate: null, dueDate: d("2026-08-20T00:00:00Z"),
      isCompleted: false, completedAt: null, categoria: null, members: [], tags: [],
      requisitos: [], children: [], initiativeId: "I", ...extra,
    };
  }

  it("as duas regras de corte aceitam o item que teve checkpoint fechado ou vencendo na semana", async () => {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await getWeeklyActivity(undefined, "2026-09-07");
    for (const indice of [0, 1]) {
      const where = findMany.mock.calls[indice][0].where as { AND: { OR: Record<string, unknown>[] }[] };
      for (const regra of [where.AND[0], where.AND[1]]) {
        const excecao = regra.OR.find((c) => "checkpoints" in c) as {
          checkpoints: { some: { OR: Record<string, { gte: Date; lte: Date }>[] } };
        };
        const campos = excecao.checkpoints.some.OR.map((c) => Object.keys(c)[0]).sort();
        // Atrasado e em andamento NÃO seguram item pausado: ele voltaria a
        // aparecer toda semana.
        expect(campos).toEqual(["completedAt", "dueDate"]);
        for (const c of excecao.checkpoints.some.OR) {
          const janela = Object.values(c)[0];
          expect(janela.gte.toISOString()).toBe("2026-09-07T00:00:00.000Z");
          expect(janela.lte.toISOString()).toBe("2026-09-13T23:59:59.999Z");
        }
      }
    }
  });

  it("item pausado mostra só o que fechou ou vencia na semana, não o atrasado", async () => {
    findMany
      .mockResolvedValueOnce([
        {
          id: "I", name: "I", status: "PAUSADA", priority: "MEDIA", launchDate: null,
          analysisDate: null, endDate: null, frente: { id: "f", name: "f" }, members: [],
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        cpCru("fechadoNaSemana", { isCompleted: true, completedAt: d("2026-09-08T12:00:00Z") }),
        cpCru("atrasado"),
        cpCru("pai", {
          dueDate: d("2026-10-30T00:00:00Z"),
          children: [cpCru("filhoDaSemana", { dueDate: d("2026-09-10T00:00:00Z") }), cpCru("filhoDepois", { dueDate: d("2026-10-20T00:00:00Z") })],
        }),
      ]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    const r = await getWeeklyActivity(undefined, "2026-09-07");
    const ids = (cps: { id: string; children: unknown[] }[]): string[] =>
      cps.flatMap((c) => [c.id, ...ids(c.children as { id: string; children: unknown[] }[])]);
    expect(ids(r.iniciativas[0].checkpoints)).toEqual(["fechadoNaSemana", "pai", "filhoDaSemana"]);
  });

  it("item em andamento continua com a árvore inteira — o recorte é só do encerrado/pausado", async () => {
    findMany
      .mockResolvedValueOnce([
        {
          id: "I", name: "I", status: "EM_ANDAMENTO", priority: "MEDIA", launchDate: null,
          analysisDate: null, endDate: null, frente: { id: "f", name: "f" }, members: [],
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cpCru("atrasado")]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    const r = await getWeeklyActivity(undefined, "2026-09-07");
    expect(r.iniciativas[0].checkpoints.map((c) => c.id)).toEqual(["atrasado"]);
  });
});

// Checkpoint longo (começou antes da semana, vence depois) não aparecia nas
// semanas do meio: a busca olhava o início DENTRO da semana, não o período.
describe("getWeeklyActivity — checkpoint em andamento", () => {
  it("a busca de checkpoints cruza o período com a semana e ignora o concluído antes dela", async () => {
    findMany.mockResolvedValue([]);
    const { getWeeklyActivity } = await import("./weekly-activity");
    await getWeeklyActivity(undefined, "2026-09-07");
    const where = findMany.mock.calls[0][0].where as {
      OR: { checkpoints?: { some: { OR: Record<string, unknown>[] } } }[];
    };
    const porCheckpoint = where.OR.find((c) => c.checkpoints)!.checkpoints!.some.OR;
    const emAndamento = porCheckpoint.find((c) => "startDate" in c) as {
      startDate: { lte: Date };
      dueDate: { gte: Date };
      OR: unknown[];
    };
    expect(emAndamento.startDate.lte.toISOString()).toBe("2026-09-13T23:59:59.999Z");
    expect(emAndamento.dueDate.gte.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(emAndamento.OR).toEqual([
      { completedAt: null },
      { completedAt: { gte: new Date("2026-09-07T00:00:00.000Z") } },
    ]);
  });
});

// A consulta foi separada em `lib/weekly-activity-query` para o registro da
// semana não pagar um SELECT de membro a cada edição de checkpoint. O que não
// pode acontecer é o export CHAMÁVEL PELO CLIENTE perder o gate de sessão.
describe("getWeeklyActivity — gate de sessão fica no export do cliente", () => {
  it("sem sessão, rejeita ANTES de consultar o banco", async () => {
    const { getCurrentMember } = await import("@/lib/session");
    vi.mocked(getCurrentMember).mockRejectedValueOnce(new Error("Usuário não autenticado."));
    const { getWeeklyActivity } = await import("./weekly-activity");

    await expect(getWeeklyActivity()).rejects.toThrow(/não autenticado/);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("a consulta interna não consulta a sessão (o chamador já passou pelo gate)", async () => {
    findMany.mockResolvedValue([]);
    const { getCurrentMember } = await import("@/lib/session");
    const { lerWeeklyActivity } = await import("@/lib/weekly-activity-query");

    await lerWeeklyActivity(undefined, "2026-09-07");

    expect(getCurrentMember).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalled();
  });
});
