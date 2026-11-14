import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Os ganchos das notificações nas actions, e as actions da própria caixa de
 * entrada. O que importa fixar:
 *  - os responsáveis de ANTES são lidos antes de gravar, e o aviso sai DEPOIS;
 *  - quem avisa é o membro que passou pelo gate de permissão;
 *  - se a gravação falha, nenhum aviso sai;
 *  - cada pessoa só mexe nos PRÓPRIOS avisos.
 */
const ordem: string[] = [];

const iniciativaUpdate = vi.fn(async () => {
  ordem.push("grava");
  return { id: "i1" };
});
const iniciativaCreate = vi.fn(async () => ({ id: "novo" }));
const iniciativaFindUnique = vi.fn();
const commentCreate = vi.fn(async () => ({ id: "c1", content: "oi", member: { id: "membro-1", name: "Eu" } }));
const commentFindUnique = vi.fn();
const commentUpdate = vi.fn(async () => ({ id: "c1" }));
const acaoCreate = vi.fn(async () => ({ id: "a1" }));
const notificacaoUpdateMany = vi.fn(async () => ({ count: 1 }));
const iniciativaFindMany = vi.fn();
const teamMemberCount = vi.fn();
const teamMemberUpdate = vi.fn(async () => ({}));
const transacao = vi.fn(async (ops: unknown[]) => ops);

vi.mock("@/lib/registro-semanal-db", () => ({
  antesDeMexerNoItem: vi.fn(async () => {}),
  semanaFechadaParaEdicao: vi.fn(async () => false),
  ERRO_SEMANA_FECHADA: "semana fechada",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    iniciativa: {
      update: iniciativaUpdate, create: iniciativaCreate, findUnique: iniciativaFindUnique,
      findMany: iniciativaFindMany, updateMany: vi.fn(),
    },
    teamMember: { count: teamMemberCount, update: teamMemberUpdate },
    $transaction: transacao,
    initiativeComment: { create: commentCreate, findUnique: commentFindUnique, update: commentUpdate },
    acao: { create: acaoCreate },
    notificacao: { updateMany: notificacaoUpdateMany },
  },
  withDbRetry: (fn: () => unknown) => fn(),
}));

const membro = { id: "membro-1", role: "COLABORADOR" };
vi.mock("@/lib/session", () => ({
  getCurrentMember: vi.fn(async () => membro),
  hasOwnershipAccess: vi.fn(() => true),
  requireEditPermission: vi.fn(async () => membro),
  requireOwnershipPermission: vi.fn(async () => membro),
}));
vi.mock("@/lib/quarters-cache", () => ({ findQuarterCached: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/historico-db", () => ({
  fotoAntes: vi.fn(async () => null),
  registrarMudancas: vi.fn(async () => []),
  registrarEvento: vi.fn(async () => {}),
}));

const responsaveisAtuais = vi.fn(async () => {
  ordem.push("le-antes");
  return ["ana"];
});
const notificarResponsaveis = vi.fn(async () => {
  ordem.push("avisa");
});
const notificarComentario = vi.fn(async () => {});
const notificarEdicaoDeComentario = vi.fn(async () => {});
const notificarAcaoAtribuida = vi.fn(async () => {});
const notificarResponsaveisEmLote = vi.fn(async () => {});
const notificarConversao = vi.fn(async () => {});
const notificarDuplicacaoDeCheckpoints = vi.fn(async () => {});
vi.mock("@/lib/notificacoes-db", () => ({
  responsaveisAtuais,
  notificarResponsaveis,
  notificarComentario,
  notificarEdicaoDeComentario,
  notificarAcaoAtribuida,
  notificarResponsaveisEmLote,
  notificarConversao,
  notificarDuplicacaoDeCheckpoints,
  listarNotificacoes: vi.fn(),
}));

const ID = "3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b";
const OUTRO = "7a1d9e2c-4b3f-4c8d-8e5a-6f7081928374";

afterEach(() => {
  vi.clearAllMocks();
  ordem.length = 0;
});

describe("updateIniciativa — notificações", () => {
  it("lê os responsáveis antes → grava → avisa, em nome de quem passou pelo gate", async () => {
    iniciativaFindUnique.mockResolvedValue({ members: [{ id: "membro-1" }] });
    const { updateIniciativa } = await import("./iniciativas");

    const r = await updateIniciativa(ID, { memberIds: [OUTRO] });

    expect(r.success).toBe(true);
    expect(ordem).toEqual(["le-antes", "grava", "avisa"]);
    expect(responsaveisAtuais).toHaveBeenCalledWith("iniciativa", ID);
    expect(notificarResponsaveis).toHaveBeenCalledWith({
      fonte: "iniciativa", id: ID, autorId: "membro-1", antes: ["ana"], depois: [OUTRO],
    });
  });

  it("edição que não mexe nos responsáveis não lê nem avisa", async () => {
    iniciativaFindUnique.mockResolvedValue({ members: [{ id: "membro-1" }] });
    const { updateIniciativa } = await import("./iniciativas");

    await updateIniciativa(ID, { name: "Novo nome" });

    expect(responsaveisAtuais).not.toHaveBeenCalled();
    expect(notificarResponsaveis).not.toHaveBeenCalled();
  });

  it("se a gravação falha, ninguém é avisado", async () => {
    iniciativaFindUnique.mockResolvedValue({ members: [{ id: "membro-1" }] });
    iniciativaUpdate.mockRejectedValueOnce(new Error("falha de banco"));
    const { updateIniciativa } = await import("./iniciativas");

    const r = await updateIniciativa(ID, { memberIds: [OUTRO] });

    expect(r.success).toBe(false);
    expect(notificarResponsaveis).not.toHaveBeenCalled();
  });
});

describe("createIniciativa — notificações", () => {
  it("quem foi escolhido como responsável na criação é avisado (antes = ninguém)", async () => {
    const { createIniciativa } = await import("./iniciativas");

    const r = await createIniciativa({
      quarterId: ID, frenteId: ID, name: "Nova", status: "BACKLOG", priority: "MEDIA", memberIds: [OUTRO],
    } as never);

    expect(r.success).toBe(true);
    expect(notificarResponsaveis).toHaveBeenCalledWith({
      fonte: "iniciativa", id: "novo", autorId: "membro-1", antes: [], depois: [OUTRO],
    });
  });
});

describe("comentários — notificações", () => {
  it("comentário novo avisa pelo conteúdo, em nome do autor", async () => {
    iniciativaFindUnique.mockResolvedValue({ id: ID });
    const { createInitiativeComment } = await import("./initiative-comments");

    const r = await createInitiativeComment({ initiativeId: ID, content: "  @Bia olha isso  " });

    expect(r.success).toBe(true);
    expect(notificarComentario).toHaveBeenCalledWith({
      fonte: "iniciativa", itemId: ID, autorId: "membro-1", conteudo: "@Bia olha isso",
    });
  });

  it("comentário em item excluído não gera aviso", async () => {
    iniciativaFindUnique.mockResolvedValue(null);
    const { createInitiativeComment } = await import("./initiative-comments");

    const r = await createInitiativeComment({ initiativeId: ID, content: "oi" });

    expect(r.success).toBe(false);
    expect(notificarComentario).not.toHaveBeenCalled();
  });

  it("editar compara o texto de antes com o de depois", async () => {
    commentFindUnique.mockResolvedValue({ id: "c1", memberId: "membro-1", initiativeId: ID, content: "oi" });
    const { updateInitiativeComment } = await import("./initiative-comments");

    await updateInitiativeComment({ commentId: "c1", content: "oi @Caio" });

    expect(notificarEdicaoDeComentario).toHaveBeenCalledWith({
      fonte: "iniciativa", itemId: ID, autorId: "membro-1", antes: "oi", depois: "oi @Caio",
    });
  });

  it("editar comentário de outra pessoa é barrado e não avisa", async () => {
    commentFindUnique.mockResolvedValue({ id: "c1", memberId: "outro", initiativeId: ID, content: "oi" });
    const { updateInitiativeComment } = await import("./initiative-comments");

    const r = await updateInitiativeComment({ commentId: "c1", content: "oi @Caio" });

    expect(r.success).toBe(false);
    expect(notificarEdicaoDeComentario).not.toHaveBeenCalled();
  });
});

describe("criarAcaoDaSemana — notificações", () => {
  it("a liderança cria na semana de outra pessoa: o aviso sai com a liderança como autora", async () => {
    const { requireEditPermission } = await import("@/lib/session");
    vi.mocked(requireEditPermission).mockResolvedValueOnce({ id: "lider-1", role: "LIDERANCA" } as never);
    const { criarAcaoDaSemana } = await import("./acoes-semana");

    const r = await criarAcaoDaSemana({ weekOf: "2026-11-09", responsavelId: OUTRO, title: "1:1" });

    expect(r.success).toBe(true);
    expect(notificarAcaoAtribuida).toHaveBeenCalledWith({
      acaoId: "a1", titulo: "1:1", responsavelId: OUTRO, autorId: "lider-1",
    });
  });

  it("colaborador só cria na própria semana: criar para outra pessoa é barrado e não avisa", async () => {
    const { criarAcaoDaSemana } = await import("./acoes-semana");

    const r = await criarAcaoDaSemana({ weekOf: "2026-11-09", responsavelId: OUTRO, title: "1:1" });

    expect(r.success).toBe(false);
    expect(notificarAcaoAtribuida).not.toHaveBeenCalled();
  });
});

describe("actions da caixa de entrada", () => {
  it("marcar como lida filtra pelo destinatário da SESSÃO (não dá para ler/limpar aviso alheio)", async () => {
    const { marcarNotificacaoComoLida } = await import("./notificacoes");

    const r = await marcarNotificacaoComoLida(ID);

    expect(r.success).toBe(true);
    expect(notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { id: ID, destinatarioId: "membro-1", lidaEm: null },
      data: { lidaEm: expect.any(Date) },
    });
  });

  it("id que não é uuid é recusado sem tocar no banco", async () => {
    const { marcarNotificacaoComoLida } = await import("./notificacoes");
    const r = await marcarNotificacaoComoLida("qualquer coisa");
    expect(r).toEqual({ success: false, error: "Notificação inválida." });
    expect(notificacaoUpdateMany).not.toHaveBeenCalled();
  });

  it("marcar todas só mexe nas da própria pessoa e ainda não lidas", async () => {
    const { marcarTodasComoLidas } = await import("./notificacoes");
    await marcarTodasComoLidas();
    expect(notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { destinatarioId: "membro-1", lidaEm: null },
      data: { lidaEm: expect.any(Date) },
    });
  });

  it("cursor inválido na paginação é recusado", async () => {
    const { carregarMaisNotificacoes } = await import("./notificacoes");
    expect(await carregarMaisNotificacoes("ontem")).toEqual({ success: false, error: "Página inválida." });
  });
});

describe("edição em massa — um aviso por pessoa", () => {
  it("lê os responsáveis de CADA item antes de gravar e manda tudo junto para o aviso agrupado", async () => {
    iniciativaFindMany.mockResolvedValue([
      { id: "i1", members: [{ id: "membro-1" }] },
      { id: "i2", members: [{ id: "membro-1" }] },
    ]);
    teamMemberCount.mockResolvedValue(1);
    responsaveisAtuais.mockImplementation(async () => {
      ordem.push("le-antes");
      return ["ana"];
    });
    const { bulkUpdateIniciativas } = await import("./iniciativas");

    const r = await bulkUpdateIniciativas(["i1", "i2"], { memberIds: [OUTRO] });

    expect(r.success).toBe(true);
    expect(responsaveisAtuais).toHaveBeenCalledTimes(2);
    expect(notificarResponsaveis).not.toHaveBeenCalled();
    expect(notificarResponsaveisEmLote).toHaveBeenCalledTimes(1);
    expect(notificarResponsaveisEmLote).toHaveBeenCalledWith({
      fonte: "iniciativa",
      autorId: "membro-1",
      itens: [{ id: "i1", antes: ["ana"] }, { id: "i2", antes: ["ana"] }],
      depois: [OUTRO],
    });
  });

  it("edição em massa que não mexe nos responsáveis não avisa ninguém", async () => {
    iniciativaFindMany.mockResolvedValue([{ id: "i1", members: [{ id: "membro-1" }] }]);
    const { bulkUpdateIniciativas } = await import("./iniciativas");

    await bulkUpdateIniciativas(["i1"], { status: "EM_ANDAMENTO" });

    expect(notificarResponsaveisEmLote).not.toHaveBeenCalled();
  });
});

describe("preferências de notificação", () => {
  it("grava os tipos desligados na conta da PRÓPRIA pessoa, sem repetidos", async () => {
    const { salvarPreferenciasDeNotificacao } = await import("./notificacoes");

    const r = await salvarPreferenciasDeNotificacao(["MENCAO", "COMENTARIO", "MENCAO"]);

    expect(r.success).toBe(true);
    expect(teamMemberUpdate).toHaveBeenCalledWith({
      where: { id: "membro-1" },
      data: { notificacoesSilenciadas: ["MENCAO", "COMENTARIO"] },
    });
  });

  it("lista vazia = recebe tudo", async () => {
    const { salvarPreferenciasDeNotificacao } = await import("./notificacoes");
    await salvarPreferenciasDeNotificacao([]);
    expect(teamMemberUpdate).toHaveBeenCalledWith({ where: { id: "membro-1" }, data: { notificacoesSilenciadas: [] } });
  });

  it("tipo desconhecido é recusado sem tocar no banco", async () => {
    const { salvarPreferenciasDeNotificacao } = await import("./notificacoes");
    const r = await salvarPreferenciasDeNotificacao(["MENCAO", "INVENTADO"]);
    expect(r).toEqual({ success: false, error: "Tipo de aviso inválido." });
    expect(teamMemberUpdate).not.toHaveBeenCalled();
  });
});

describe("marcar como não lida", () => {
  it("devolve um aviso JÁ LIDO da própria pessoa ao estado não lido (e só ele)", async () => {
    const { marcarNotificacaoComoNaoLida } = await import("./notificacoes");

    const r = await marcarNotificacaoComoNaoLida(ID);

    expect(r.success).toBe(true);
    expect(notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { id: ID, destinatarioId: "membro-1", lidaEm: { not: null } },
      data: { lidaEm: null },
    });
  });

  it("id que não é uuid é recusado sem tocar no banco", async () => {
    const { marcarNotificacaoComoNaoLida } = await import("./notificacoes");
    const r = await marcarNotificacaoComoNaoLida("x");
    expect(r).toEqual({ success: false, error: "Notificação inválida." });
    expect(notificacaoUpdateMany).not.toHaveBeenCalled();
  });
});
