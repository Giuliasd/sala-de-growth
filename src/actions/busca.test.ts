import { afterEach, describe, expect, it, vi } from "vitest";

const iniciativaFindMany = vi.fn();
const experimentoFindMany = vi.fn();
const okrFindMany = vi.fn();
// Os tipos que entraram depois: vazios por padrão, cada teste preenche o seu.
const objetivoFindMany = vi.fn(async (): Promise<unknown[]> => []);
const icFindMany = vi.fn(async (): Promise<unknown[]> => []);
const ecFindMany = vi.fn(async (): Promise<unknown[]> => []);
const acaoFindMany = vi.fn(async (): Promise<unknown[]> => []);
const icomFindMany = vi.fn(async (): Promise<unknown[]> => []);
const ecomFindMany = vi.fn(async (): Promise<unknown[]> => []);
const playbookFindMany = vi.fn(async (): Promise<unknown[]> => []);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: { findMany: iniciativaFindMany },
    experimento: { findMany: experimentoFindMany },
    oKR: { findMany: okrFindMany },
    objetivo: { findMany: objetivoFindMany },
    initiativeCheckpoint: { findMany: icFindMany },
    experimentoCheckpoint: { findMany: ecFindMany },
    acao: { findMany: acaoFindMany },
    initiativeComment: { findMany: icomFindMany },
    experimentoComment: { findMany: ecomFindMany },
    playbookLink: { findMany: playbookFindMany },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

const getCurrentMember = vi.fn();
vi.mock("@/lib/session", () => ({ getCurrentMember }));

const quarter = { quarter: 3, year: 2026 };
const frente = { name: "Aquisição" };

afterEach(() => {
  vi.clearAllMocks();
  for (const fn of [objetivoFindMany, icFindMany, ecFindMany, acaoFindMany, icomFindMany, ecomFindMany, playbookFindMany]) {
    fn.mockImplementation(async () => []);
  }
});

function semItensPrincipais() {
  getCurrentMember.mockResolvedValue({ id: "m1" });
  iniciativaFindMany.mockResolvedValue([]);
  experimentoFindMany.mockResolvedValue([]);
  okrFindMany.mockResolvedValue([]);
}

async function buscar(texto: string) {
  const { buscarNoApp } = await import("./busca");
  return buscarNoApp(texto);
}

describe("buscarNoApp", () => {
  it("texto curto demais não vai ao banco", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    const r = await buscar("a");
    expect(r).toEqual({ success: true, data: [] });
    expect(iniciativaFindMany).not.toHaveBeenCalled();
  });

  it("exige sessão: sem ela, devolve erro e não consulta", async () => {
    getCurrentMember.mockRejectedValue(new Error("Usuário não autenticado."));
    const r = await buscar("relatório");
    expect(r.success).toBe(false);
    expect(iniciativaFindMany).not.toHaveBeenCalled();
    expect(experimentoFindMany).not.toHaveBeenCalled();
    expect(okrFindMany).not.toHaveBeenCalled();
  });

  it("não lê item excluído e traz do mais recente", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    iniciativaFindMany.mockResolvedValue([]);
    experimentoFindMany.mockResolvedValue([]);
    okrFindMany.mockResolvedValue([]);

    await buscar("  Relatório   Q3 ");

    expect(iniciativaFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
    expect(experimentoFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
    expect(iniciativaFindMany.mock.calls[0][0].orderBy).toEqual({ updatedAt: "desc" });
  });

  it("ignora acento e caixa: 'relatorio' acha 'Relatório', 'JOSE' acha 'José'", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    iniciativaFindMany.mockResolvedValue([
      { id: "i1", name: "Relatório semanal", quarter, frente },
      { id: "i2", name: "Outra coisa", quarter, frente },
    ]);
    experimentoFindMany.mockResolvedValue([
      { id: "e1", name: "Teste", objective: "Ideia do José", quarter, frente },
    ]);
    okrFindMany.mockResolvedValue([{ id: "k1", objective: "Relatórios entregues", quarterId: "q", quarter, frente }]);

    const r1 = await buscar("relatorio");
    expect(r1.success && r1.data.map((d) => d.id)).toEqual(["i1", "k1"]);

    const r2 = await buscar("JOSE");
    expect(r2.success && r2.data.map((d) => d.id)).toEqual(["e1"]);
  });

  it("limite por tipo: a paleta não despeja o app inteiro (fica com os mais recentes)", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    iniciativaFindMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, name: `Régua ${i}`, quarter, frente }))
    );
    experimentoFindMany.mockResolvedValue([]);
    okrFindMany.mockResolvedValue([]);

    const r = await buscar("regua");

    expect(r.success && r.data.map((d) => d.id)).toEqual(["i0", "i1", "i2", "i3", "i4", "i5"]);
  });

  it("monta título, contexto e destino de cada tipo", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    iniciativaFindMany.mockResolvedValue([{ id: "i1", name: "Régua de e-mail", quarter, frente }]);
    experimentoFindMany.mockResolvedValue([{ id: "e1", name: "Régua de frete", quarter, frente }]);
    okrFindMany.mockResolvedValue([{ id: "k1", objective: "Régua da conversão", quarterId: "q9", quarter, frente }]);

    const r = await buscar("régua");

    expect(r).toEqual({
      success: true,
      data: [
        { tipo: "iniciativa", id: "i1", titulo: "Régua de e-mail", detalhe: "Q3 2026 · Aquisição", href: "/iniciativas/i1" },
        { tipo: "experimento", id: "e1", titulo: "Régua de frete", detalhe: "Q3 2026 · Aquisição", href: "/experimentos/e1" },
        // KR não tem página própria: abre o quarter dele.
        { tipo: "kr", id: "k1", titulo: "Régua da conversão", detalhe: "Q3 2026 · Aquisição", href: "/okrs?quarter=q9" },
      ],
    });
  });

  it("checkpoints: só de item não excluído, das duas entidades, do mais recente, abrindo o item", async () => {
    semItensPrincipais();
    icFindMany.mockResolvedValue([
      { id: "c1", name: "Briefing da régua", description: null, updatedAt: new Date("2026-11-01"), initiative: { id: "i1", name: "Régua" } },
    ]);
    ecFindMany.mockResolvedValue([
      { id: "c2", name: "Outro", description: "revisar o briefing", updatedAt: new Date("2026-11-05"), experimento: { id: "e1", name: "Frete" } },
    ]);

    const r = await buscar("briefing");

    expect(icFindMany.mock.calls[0]).toEqual([expect.objectContaining({ where: { initiative: { deletedAt: null } } })]);
    expect(ecFindMany.mock.calls[0]).toEqual([expect.objectContaining({ where: { experimento: { deletedAt: null } } })]);
    expect(r).toEqual({
      success: true,
      data: [
        { tipo: "checkpoint", id: "c2", titulo: "Outro", detalhe: "Checkpoint de Frete", href: "/experimentos/e1" },
        { tipo: "checkpoint", id: "c1", titulo: "Briefing da régua", detalhe: "Checkpoint de Régua", href: "/iniciativas/i1" },
      ],
    });
  });

  it("checkpoints das duas entidades dividem o mesmo limite", async () => {
    semItensPrincipais();
    const cp = (id: string, dia: number) => ({ id, name: `Revisão ${id}`, description: null, updatedAt: new Date(2026, 10, dia) });
    icFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ ...cp(`i${i}`, 20 - i * 2), initiative: { id: "x", name: "X" } })));
    ecFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ ...cp(`e${i}`, 19 - i * 2), experimento: { id: "y", name: "Y" } })));

    const r = await buscar("revisao");

    expect(r.success && r.data.map((d) => d.id)).toEqual(["i0", "e0", "i1", "e1", "i2", "e2"]);
  });

  it("objetivo, ação, comentário e playbook: título, contexto e destino", async () => {
    semItensPrincipais();
    objetivoFindMany.mockResolvedValue([
      { id: "o1", title: "Crescer a base", description: "foco em retenção", quarterId: "q9", quarter },
    ]);
    acaoFindMany.mockResolvedValue([
      { id: "a1", title: "Revisar retenção", notes: null, iniciativaId: null, experimentoId: "e7", responsavel: { name: "Ana" }, frente: { name: "CRM" } },
      { id: "a2", title: "1:1", notes: "falar de retenção", iniciativaId: null, experimentoId: null, responsavel: { name: "Bia" }, frente: null },
    ]);
    icomFindMany.mockResolvedValue([
      { id: "m1", content: "A   retenção\ncaiu", updatedAt: new Date(), member: { name: "Caio" }, initiative: { id: "i3", name: "Régua" } },
    ]);
    playbookFindMany.mockResolvedValue([
      { id: "p1", title: "Painel de retenção", subtitle: "Looker", url: "https://exemplo.com/r", section: { name: "Dados" } },
    ]);

    const r = await buscar("retencao");

    expect(r).toEqual({
      success: true,
      data: [
        { tipo: "objetivo", id: "o1", titulo: "Crescer a base", detalhe: "Q3 2026", href: "/okrs?quarter=q9" },
        { tipo: "acao", id: "a1", titulo: "Revisar retenção", detalhe: "Ana · CRM", href: "/experimentos/e7" },
        // Ação solta mora na Weekly.
        { tipo: "acao", id: "a2", titulo: "1:1", detalhe: "Bia", href: "/rituais" },
        { tipo: "comentario", id: "m1", titulo: "A retenção caiu", detalhe: "Caio em Régua", href: "/iniciativas/i3" },
        { tipo: "playbook", id: "p1", titulo: "Painel de retenção", detalhe: "Dados · Looker", href: "https://exemplo.com/r", externo: true },
      ],
    });
    expect(acaoFindMany.mock.calls[0]).toEqual([expect.objectContaining({ where: { deletedAt: null } })]);
    expect(icomFindMany.mock.calls[0]).toEqual([expect.objectContaining({ where: { initiative: { deletedAt: null } } })]);
  });

  it("falha de banco vira erro — não 'nenhum resultado'", async () => {
    getCurrentMember.mockResolvedValue({ id: "m1" });
    iniciativaFindMany.mockRejectedValue(new Error("Connection terminated"));
    experimentoFindMany.mockResolvedValue([]);
    okrFindMany.mockResolvedValue([]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await buscar("relatório");

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).not.toMatch(/Connection/);
    spy.mockRestore();
  });
});
