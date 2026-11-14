import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O que estes testes protegem: a FRENTE da ação atravessando o action até o
 * banco — o outro campo novo do card de Rituais, e da mesma classe de risco que
 * a categoria do checkpoint (formulário e tipo prontos, call site esquecido).
 *
 * O que vale travar aqui:
 *   - criar com a frente do grupo em que a pessoa clicou;
 *   - criar SEM frente (o balde transversal) grava null, não uma frente
 *     qualquer;
 *   - mover para outra frente e para "nenhuma";
 *   - recusar frente inexistente ou ARQUIVADA — frente arquivada não recebe
 *     trabalho novo, e sem essa checagem o erro que aparece é um erro de FK
 *     cru.
 */

const create = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();
const frenteFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // acaoParaEditar busca com findFirst (filtra deletedAt): mesmo mock.
    acao: { create, update, findUnique, findFirst: findUnique, findMany: vi.fn() },
    acaoSemana: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    frente: { findFirst: frenteFindFirst },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn().mockResolvedValue({ id: "m1", role: "LIDERANCA" }),
  requireEditPermission: vi.fn().mockResolvedValue({ id: "m1", role: "LIDERANCA" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const semanaFechada = vi.fn(async (_weekStart: Date) => false);
vi.mock("@/lib/registro-semanal-db", () => ({
  semanaFechadaParaEdicao: (w: Date) => semanaFechada(w),
  ERRO_SEMANA_FECHADA: "Esta semana já fechou.",
}));

const MEMBRO = "11111111-1111-4111-8111-111111111111";
const FRENTE = "22222222-2222-4222-8222-222222222222";
const ACAO = "33333333-3333-4333-8333-333333333333";
const SEMANA = "2026-09-07";

beforeEach(() => {
  create.mockResolvedValue({ id: ACAO });
  update.mockResolvedValue({ id: ACAO });
  findUnique.mockResolvedValue({ responsavelId: "m1" });
  frenteFindFirst.mockResolvedValue({ id: FRENTE });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("criarAcaoDaSemana — frente", () => {
  it("nasce na frente do grupo em que foi criada", async () => {
    const { criarAcaoDaSemana } = await import("./acoes-semana");
    const res = await criarAcaoDaSemana({
      weekOf: SEMANA,
      responsavelId: MEMBRO,
      title: "Subir alt text",
      frenteId: FRENTE,
    });
    expect(res.success).toBe(true);
    expect(create.mock.calls[0][0].data.frenteId).toBe(FRENTE);
  });

  // O balde "Também nesta semana": trabalho transversal ("TH", "1:1").
  it("sem frente grava null", async () => {
    const { criarAcaoDaSemana } = await import("./acoes-semana");
    await criarAcaoDaSemana({ weekOf: SEMANA, responsavelId: MEMBRO, title: "TH" });
    expect(create.mock.calls[0][0].data.frenteId).toBeNull();
  });
});

describe("definirFrenteDaAcao", () => {
  it("move a ação para a frente escolhida", async () => {
    const { definirFrenteDaAcao } = await import("./acoes-semana");
    const res = await definirFrenteDaAcao({ id: ACAO, frenteId: FRENTE });
    expect(res.success).toBe(true);
    expect(update.mock.calls[0][0].data.frenteId).toBe(FRENTE);
  });

  it("`null` devolve a ação ao balde transversal", async () => {
    const { definirFrenteDaAcao } = await import("./acoes-semana");
    const res = await definirFrenteDaAcao({ id: ACAO, frenteId: null });
    expect(res.success).toBe(true);
    expect(update.mock.calls[0][0].data.frenteId).toBeNull();
    // Sem frente não há o que validar: nem consulta a tabela de frentes.
    expect(frenteFindFirst).not.toHaveBeenCalled();
  });

  it("recusa frente inexistente ou arquivada, sem gravar", async () => {
    frenteFindFirst.mockResolvedValue(null);
    const { definirFrenteDaAcao } = await import("./acoes-semana");
    const res = await definirFrenteDaAcao({ id: ACAO, frenteId: FRENTE });
    expect(res).toEqual({ success: false, error: "Frente não encontrada." });
    expect(update).not.toHaveBeenCalled();
  });

  it("só aceita frente ATIVA na validação", async () => {
    const { definirFrenteDaAcao } = await import("./acoes-semana");
    await definirFrenteDaAcao({ id: ACAO, frenteId: FRENTE });
    expect(frenteFindFirst.mock.calls[0][0].where).toMatchObject({ isActive: true });
  });

  it("ação que não existe não vira update", async () => {
    findUnique.mockResolvedValue(null);
    const { definirFrenteDaAcao } = await import("./acoes-semana");
    const res = await definirFrenteDaAcao({ id: ACAO, frenteId: FRENTE });
    expect(res).toEqual({ success: false, error: "Ação não encontrada." });
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * Achado da auditoria de segurança (13/11/2026): semana fechada vira foto, mas
 * a trava existia só na interface. As actions que recebem `weekOf` agora
 * recusam semana fechada no servidor, e ação excluída não se edita mais.
 */
describe("ações — semana fechada e ação excluída", () => {
  it("recusa concluir, criar, mudar repetição e encerrar numa semana fechada, sem gravar", async () => {
    semanaFechada.mockResolvedValue(true);
    const m = await import("./acoes-semana");

    const respostas = await Promise.all([
      m.alternarAcaoNaSemana({ id: ACAO, weekOf: SEMANA }),
      m.criarAcaoDaSemana({ weekOf: SEMANA, responsavelId: MEMBRO, title: "Ligar pro cliente" }),
      m.definirRecorrenciaDaAcao({ id: ACAO, weekOf: SEMANA, recorrencia: "semanal" }),
      m.encerrarAcao({ id: ACAO, weekOf: SEMANA }),
    ]);

    for (const r of respostas) expect(r).toMatchObject({ success: false, error: "Esta semana já fechou." });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    semanaFechada.mockResolvedValue(false);
  });

  it("busca a ação só entre as não excluídas", async () => {
    const { renomearAcao } = await import("./acoes-semana");
    findUnique.mockResolvedValue(null);

    const r = await renomearAcao({ id: ACAO, title: "Novo nome" });

    expect(r).toMatchObject({ success: false, error: "Ação não encontrada." });
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: ACAO, deletedAt: null });
    expect(update).not.toHaveBeenCalled();
  });
});
