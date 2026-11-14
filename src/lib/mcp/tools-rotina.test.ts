import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { MemberRole } from "@/generated/prisma/enums"
import type { McpMember } from "./member-context"

// Mesmo esquema de tools.test.ts: actions mockadas, protocolo MCP de verdade.
const a = vi.hoisted(() => ({
  buscarNoApp: vi.fn(),
  getTravasDaPessoa: vi.fn(),
  getTravasDoTime: vi.fn(),
  getAguardandoProximoPasso: vi.fn(),
  getMarcosDoTime: vi.fn(),
  getPrazosVencidos: vi.fn(),
  getTeamMembers: vi.fn(),
  lerRegistroDaSemana: vi.fn(),
  getAusencias: vi.fn(),
  getConflicts: vi.fn(),
  getEventosDoCalendario: vi.fn(),
  recordMcpCall: vi.fn(),
}))

vi.mock("@/actions/busca", () => ({ buscarNoApp: a.buscarNoApp }))
vi.mock("@/actions/dashboard", () => ({
  getTravasDaPessoa: a.getTravasDaPessoa,
  getTravasDoTime: a.getTravasDoTime,
  getAguardandoProximoPasso: a.getAguardandoProximoPasso,
  getMarcosDoTime: a.getMarcosDoTime,
  getPrazosVencidos: a.getPrazosVencidos,
}))
vi.mock("@/actions/team-members", () => ({ getTeamMembers: a.getTeamMembers }))
vi.mock("@/lib/registro-semanal-db", () => ({ lerRegistroDaSemana: a.lerRegistroDaSemana }))
vi.mock("@/lib/horario-do-ritual-db", () => ({ lerVigenciasDoRitual: async () => [] }))
vi.mock("@/actions/ausencias", () => ({ getAusencias: a.getAusencias, getConflicts: a.getConflicts }))
vi.mock("@/actions/calendario", () => ({ getEventosDoCalendario: a.getEventosDoCalendario }))
vi.mock("@/actions/quarters", () => ({ getActiveQuarter: vi.fn() }))
vi.mock("./audit", () => ({ recordMcpCall: a.recordMcpCall }))
vi.mock("./app-url", () => ({ getAppUrl: () => "https://sala.exemplo" }))

import { abrirCom, registrarFerramentasDaRotina, tipoDeAusencia } from "./tools-rotina"

const ITEM = "22222222-2222-4222-8222-222222222222"
const QUARTER = "11111111-1111-4111-8111-111111111111"
const LIDER = { id: "lider", name: "Líder", email: "lider@example.com", role: MemberRole.LIDERANCA }
const COLAB = { id: "me", name: "Eu", email: "eu@example.com", role: MemberRole.COLABORADOR }

async function call(name: string, args: Record<string, unknown> = {}, member: McpMember = COLAB) {
  const server = new McpServer({ name: "t", version: "1" })
  registrarFerramentasDaRotina(server, member)
  const [c, s] = InMemoryTransport.createLinkedPair()
  await server.connect(s)
  const client = new Client({ name: "teste", version: "1" })
  await client.connect(c)
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[]
    isError?: boolean
  }
  return { result, text: result.content[0].text }
}

beforeEach(() => {
  Object.values(a).forEach((m) => m.mockReset())
})

describe("buscar", () => {
  it("abrirCom aponta a ferramenta certa a partir do link interno", () => {
    expect(abrirCom(`/iniciativas/${ITEM}`)).toEqual({ ferramenta: "ver_iniciativa", id: ITEM })
    expect(abrirCom(`/experimentos/${ITEM}`)).toEqual({ ferramenta: "ver_experimento", id: ITEM })
    expect(abrirCom(`/okrs?quarter=${QUARTER}`)).toEqual({ ferramenta: "listar_okrs", quarterId: QUARTER })
    expect(abrirCom("/rituais")).toBeNull()
  })

  it("devolve link absoluto, a ferramenta que abre e filtra por tipo", async () => {
    a.buscarNoApp.mockResolvedValue({
      success: true,
      data: [
        { tipo: "iniciativa", id: ITEM, titulo: "Programa de indicação", detalhe: "Q4 2026 · Indicação", href: `/iniciativas/${ITEM}` },
        { tipo: "checkpoint", id: "c1", titulo: "Briefing", detalhe: "Checkpoint de Programa", href: `/experimentos/${ITEM}` },
        { tipo: "playbook", id: "p1", titulo: "Guia", detalhe: "Growth · x", href: "https://docs.exemplo/guia", externo: true },
      ],
    })
    const { text, result } = await call("buscar", { texto: "indicação" })
    expect(result.isError).toBeFalsy()
    expect(a.buscarNoApp).toHaveBeenCalledWith("indicação")
    const body = JSON.parse(text)
    expect(body.resultados[0]).toMatchObject({
      link: `https://sala.exemplo/iniciativas/${ITEM}`,
      abrirCom: { ferramenta: "ver_iniciativa", id: ITEM },
    })
    expect(body.resultados[1].abrirCom).toEqual({ ferramenta: "ver_experimento", id: ITEM })
    expect(body.resultados[2].link).toBe("https://docs.exemplo/guia")
    expect(body.resultados[2].abrirCom).toBeUndefined() // null some da resposta compacta

    const soCheckpoints = JSON.parse((await call("buscar", { texto: "indicação", tipos: ["checkpoint"] })).text)
    expect(soCheckpoints.resultados.map((r: { id: string }) => r.id)).toEqual(["c1"])
    expect(a.recordMcpCall).toHaveBeenCalledWith(expect.objectContaining({ tool: "buscar", ok: true }))
  })

  it("texto curto demais é recusado pelo schema, sem ir ao banco", async () => {
    const { result } = await call("buscar", { texto: " a " })
    expect(result.isError).toBe(true)
    expect(a.buscarNoApp).not.toHaveBeenCalled()
  })

  it("falha da busca vira erro, não lista vazia", async () => {
    a.buscarNoApp.mockResolvedValue({ success: false, error: "Não foi possível buscar agora. Tente novamente." })
    const { result, text } = await call("buscar", { texto: "indicação" })
    expect(result.isError).toBe(true)
    expect(text).toContain("Não foi possível buscar")
  })
})

describe("o_que_esta_travado", () => {
  const ANA = { id: "p1", name: "Ana" }
  const vencido = {
    id: "i9", name: "App de métricas", status: "EM_ANDAMENTO", kind: "iniciativa", priority: "ALTA",
    endDate: new Date("2026-10-30T00:00:00Z"), members: [ANA], frente: { id: "f", name: "Dados" },
    _count: { checkpoints: 4 },
  }
  const travas = {
    semProximoPasso: [
      { id: "i1", name: "Indicação", status: "EM_ANDAMENTO", kind: "iniciativa", priority: "ALTA", members: [ANA], frente: { id: "f", name: "Aquisição" } },
    ],
    parados: [
      { id: "e1", name: "Teste de preço", status: "AGUARDANDO_RESULTADOS", analysisDate: new Date("2026-11-01T00:00:00Z"), members: [ANA], frente: { id: "f", name: "Aquisição" } },
    ],
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"))
    a.getTeamMembers.mockResolvedValue([
      { id: "me", name: "Eu", email: "eu@example.com" },
      { ...ANA, email: "ana@example.com" },
    ])
    a.getPrazosVencidos.mockResolvedValue([vencido])
  })
  afterEach(() => vi.useRealTimers())

  it("a descrição usa as palavras do time e manda não cruzar por conta própria", async () => {
    const server = new McpServer({ name: "t", version: "1" })
    registrarFerramentasDaRotina(server, COLAB)
    const [c, s] = InMemoryTransport.createLinkedPair()
    await server.connect(s)
    const client = new Client({ name: "teste", version: "1" })
    await client.connect(c)
    const tool = (await client.listTools()).tools.find((t) => t.name === "o_que_esta_travado")!
    for (const palavra of ["travado", "bloqueado", "parado", "em risco", "prazo final vencido"]) {
      expect(tool.description).toContain(palavra)
    }
  })

  it("item em andamento com prazo final vencido entra, com dias de atraso e checkpoints abertos", async () => {
    a.getTravasDaPessoa.mockResolvedValue({ semProximoPasso: [], parados: [], marcosEmRisco: [] })
    const body = JSON.parse((await call("o_que_esta_travado")).text)
    expect(a.getPrazosVencidos).toHaveBeenCalledWith("me")
    expect(body.prazoFinalVencido).toEqual([
      {
        tipo: "iniciativa", id: "i9", nome: "App de métricas", status: "EM_ANDAMENTO", frente: "Dados",
        responsaveis: ["Ana"], fim: "2026-10-30", diasVencido: 11, checkpointsAbertos: 4,
      },
    ])
  })

  it("sem argumentos: as travas de quem pergunta, sem e-mail", async () => {
    a.getTravasDaPessoa.mockResolvedValue({
      ...travas,
      marcosEmRisco: [
        { marco: { id: "m1", name: "Go-live" }, resumo: "1 checkpoint atrasado", item: { id: "i1", name: "Indicação", kind: "iniciativa" } },
      ],
    })
    const { text, result } = await call("o_que_esta_travado")
    expect(result.isError).toBeFalsy()
    expect(a.getTravasDaPessoa).toHaveBeenCalledWith("me")
    const body = JSON.parse(text)
    expect(body.de).toBe("Eu")
    expect(body.semProximoPasso[0]).toMatchObject({ tipo: "iniciativa", nome: "Indicação", responsaveis: ["Ana"] })
    expect(body.analiseParada[0]).toMatchObject({ tipo: "experimento", analise: "2026-11-01" })
    expect(body.marcosEmRisco[0]).toEqual({
      marco: { id: "m1", nome: "Go-live" },
      risco: "1 checkpoint atrasado",
      item: { tipo: "iniciativa", id: "i1", nome: "Indicação" },
    })
    expect(text).not.toContain("@")
  })

  it("colaborador pedindo de outra pessoa: o 'Acesso negado' da action chega ao modelo", async () => {
    a.getTravasDaPessoa.mockRejectedValue(new Error("Acesso negado"))
    const { result, text } = await call("o_que_esta_travado", { memberId: "33333333-3333-4333-8333-333333333333" })
    expect(result.isError).toBe(true)
    expect(text).toBe("Acesso negado")
  })

  it("visão do time é só da liderança: colaborador recebe aviso e nada é consultado", async () => {
    const { result, text } = await call("o_que_esta_travado", { todoTime: true })
    expect(result.isError).toBe(true)
    expect(text).toContain("só da liderança")
    expect(a.getTravasDoTime).not.toHaveBeenCalled()
    expect(a.getMarcosDoTime).not.toHaveBeenCalled()
    expect(a.getPrazosVencidos).not.toHaveBeenCalled()
  })

  it("liderança com todoTime: travas, o que espera o ritual e os marcos com o que falta", async () => {
    a.getTravasDoTime.mockResolvedValue(travas)
    a.getAguardandoProximoPasso.mockResolvedValue([
      { id: "e2", name: "Onboarding", status: "AGUARDANDO_RESULTADOS", kind: "experimento", priority: null, analysisDate: new Date("2020-01-01T00:00:00Z"), members: [ANA] },
    ])
    a.getMarcosDoTime.mockResolvedValue([
      {
        id: "m1", name: "Go-live", dueDate: new Date("2026-11-13T00:00:00Z"), members: [ANA],
        item: { id: "i1", name: "Indicação", kind: "iniciativa", status: "EM_ANDAMENTO", members: [], priority: "ALTA" },
        progresso: {
          requisitos: [], total: 3, entregues: 1, emRisco: true,
          pendentes: [{ id: "r1", name: "Copy", dueDate: new Date("2026-11-05T00:00:00Z"), members: [ANA] }],
          riscos: [{ item: {}, motivo: "atrasado" }],
        },
        subPendentes: [],
      },
    ])
    const { text, result } = await call("o_que_esta_travado", { todoTime: true }, LIDER)
    expect(result.isError).toBeFalsy()
    const body = JSON.parse(text)
    expect(body.de).toBe("time todo")
    expect(a.getPrazosVencidos).toHaveBeenCalledWith()
    expect(body.prazoFinalVencido[0].nome).toBe("App de métricas")
    expect(body.aguardandoProximoPasso[0]).toMatchObject({ nome: "Onboarding", analiseVencida: true })
    expect(body.marcos[0]).toMatchObject({
      nome: "Go-live",
      item: { tipo: "iniciativa", nome: "Indicação" },
      necessarios: { entregues: 1, total: 3, emRisco: true, risco: "1 checkpoint atrasado" },
    })
    expect(body.marcos[0].necessarios.pendentes[0]).toEqual({ nome: "Copy", prazo: "2026-11-05", responsaveis: ["Ana"] })
    expect(a.getTravasDaPessoa).not.toHaveBeenCalled()
  })
})

describe("ver_semana_fechada", () => {
  const ANA = { id: "p1", name: "Ana" }
  function registro(over: Record<string, unknown>) {
    return {
      id: "r", checkpointId: "c", kind: "iniciativa", itemId: "i1", origem: "PLANEJADO",
      registradoEm: new Date("2026-11-02T12:00:00Z"), nome: "cp", caminho: null, categoria: null,
      prazoAoEntrar: new Date("2026-11-05T00:00:00Z"), prazo: new Date("2026-11-05T00:00:00Z"),
      inicio: null, concluidoEm: null, responsaveisIds: ["me"], tags: [], itemNome: "Indicação",
      itemStatus: "EM_ANDAMENTO", frente: { id: "f", name: "Aquisição" }, remarcacoes: 0,
      excluidoEm: null, excluidoPor: null, desfecho: "CONCLUIDO", atual: null, ...over,
    }
  }

  beforeEach(() => {
    // Terça, 10/11/2026: a semana aberta é a de 09/11; a última fechada, a de 02/11.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"))
    a.getTeamMembers.mockResolvedValue([
      { id: "me", name: "Eu", email: "eu@example.com" },
      { ...ANA, email: "ana@example.com" },
    ])
    a.lerRegistroDaSemana.mockResolvedValue({
      fechada: true,
      registros: [
        registro({ id: "r1", nome: "Briefing", desfecho: "CONCLUIDO", concluidoEm: new Date("2026-11-04T10:00:00Z") }),
        registro({ id: "r2", nome: "Copy", caminho: "Briefing", desfecho: "REMARCADO", remarcacoes: 2, origem: "ENTROU", prazo: new Date("2026-11-12T00:00:00Z") }),
        registro({ id: "r3", nome: "Da Ana", responsaveisIds: ["p1"], desfecho: "ABERTO", itemId: "e1", kind: "experimento", itemNome: "Preço" }),
      ],
    })
  })
  afterEach(() => vi.useRealTimers())

  it("sem argumentos: a última semana fechada de quem pergunta, por item, com o desfecho", async () => {
    const { text, result } = await call("ver_semana_fechada")
    expect(result.isError).toBeFalsy()
    expect(a.lerRegistroDaSemana).toHaveBeenCalledWith(new Date("2026-11-02T00:00:00Z"), { verQuemExcluiu: false })
    const body = JSON.parse(text)
    expect(body).toMatchObject({ semana: { inicio: "2026-11-02", fim: "2026-11-08" }, de: "Eu", congelada: true })
    expect(body.resumo).toEqual({ total: 2, planejados: 1, entraramDepois: 1, CONCLUIDO: 1, REMARCADO: 1 })
    expect(body.itens).toHaveLength(1)
    expect(body.itens[0].checkpoints[1]).toMatchObject({
      nome: "Copy", caminho: "Briefing", origem: "entrou_depois", desfecho: "REMARCADO", remarcacoes: 2, prazo: "2026-11-12",
    })
    expect(text).not.toContain("@")
  })

  it("todoTime traz todo mundo; liderança vê quem excluiu", async () => {
    const lider = { id: "lider", name: "Líder", email: "l@example.com", role: MemberRole.LIDERANCA }
    const body = JSON.parse((await call("ver_semana_fechada", { todoTime: true, semana: "2026-10-28" }, lider)).text)
    expect(a.lerRegistroDaSemana).toHaveBeenCalledWith(new Date("2026-10-26T00:00:00Z"), { verQuemExcluiu: true })
    expect(body.resumo.total).toBe(3)
    expect(body.itens.map((i: { tipo: string }) => i.tipo)).toEqual(["iniciativa", "experimento"])
  })

  it("semana em andamento ou futura é recusada, apontando ver_semana", async () => {
    const { result, text } = await call("ver_semana_fechada", { semana: "2026-11-12" })
    expect(result.isError).toBe(true)
    expect(text).toContain("ver_semana")
    expect(a.lerRegistroDaSemana).not.toHaveBeenCalled()
  })

  it("semana sem registro avisa em vez de dizer que não houve nada", async () => {
    a.lerRegistroDaSemana.mockResolvedValue({ registros: [], fechada: false })
    const body = JSON.parse((await call("ver_semana_fechada", { semana: "2026-06-03" })).text)
    expect(body.aviso).toContain("não tem registro")
    expect(body.itens).toBeUndefined()
  })
})

describe("ver_ausencias", () => {
  const ANA = { id: "p1", name: "Ana" }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"))
    a.getAusencias.mockResolvedValue([
      { id: "a2", type: "LICENCA_MEDICA", startDate: new Date("2026-11-16T00:00:00Z"), endDate: new Date("2026-11-20T00:00:00Z"), notes: "cirurgia no joelho", member: { id: "me", name: "Eu" } },
      { id: "a1", type: "FERIAS", startDate: new Date("2026-11-09T00:00:00Z"), endDate: new Date("2026-11-13T00:00:00Z"), notes: null, member: ANA },
    ])
    a.getConflicts.mockResolvedValue([
      {
        iniciativa: { id: "i1", name: "Indicação", status: "EM_ANDAMENTO", endDate: new Date("2026-11-12T00:00:00Z"), member: ANA, frente: { name: "F" } },
        ausencia: { id: "a1", type: "FERIAS", startDate: new Date("2026-11-09T00:00:00Z"), endDate: new Date("2026-11-13T00:00:00Z"), member: ANA },
      },
    ])
  })
  afterEach(() => vi.useRealTimers())

  it("licença não revela o motivo", () => {
    expect(tipoDeAusencia("LICENCA_MEDICA")).toBe("licença")
    expect(tipoDeAusencia("LICENCA_MATERNIDADE")).toBe("licença")
    expect(tipoDeAusencia("FERIAS")).toBe("férias")
    expect(tipoDeAusencia("DAY_OFF")).toBe("day off")
    expect(tipoDeAusencia("OUTROS")).toBe("outro")
  })

  it("sem argumentos: esta semana e a próxima, em ordem, sem observações nem tipo de licença", async () => {
    const { text, result } = await call("ver_ausencias")
    expect(result.isError).toBeFalsy()
    const [filtro] = a.getAusencias.mock.calls[0]
    expect(filtro.rangeStart).toEqual(new Date("2026-11-09T00:00:00Z"))
    expect(filtro.rangeEnd).toEqual(new Date("2026-11-22T23:59:59.999Z"))
    const body = JSON.parse(text)
    expect(body.periodo).toEqual({ inicio: "2026-11-09", fim: "2026-11-22" })
    expect(body.ausencias.map((x: { pessoa: { nome: string } }) => x.pessoa.nome)).toEqual(["Ana", "Eu"])
    expect(body.ausencias[1].tipo).toBe("licença")
    expect(text).not.toContain("joelho")
    expect(text).not.toContain("MEDICA")
    expect(body.conflitos[0]).toEqual({
      iniciativa: { id: "i1", nome: "Indicação", prazo: "2026-11-12" },
      pessoa: "Ana",
      ausencia: { tipo: "férias", inicio: "2026-11-09", fim: "2026-11-13" },
    })
  })

  it("período invertido ou longo demais é recusado sem consultar", async () => {
    expect((await call("ver_ausencias", { de: "2026-12-10", ate: "2026-12-01" })).result.isError).toBe(true)
    expect((await call("ver_ausencias", { de: "2026-01-01", ate: "2026-12-31" })).text).toContain("120 dias")
    expect(a.getAusencias).not.toHaveBeenCalled()
  })
})

describe("ver_calendario", () => {
  const evento = (over: Record<string, unknown>) => ({
    id: "LANCAMENTO:i1",
    tipo: "LANCAMENTO",
    data: "2026-11-20",
    titulo: "Indicação",
    item: { id: "i1", nome: "Indicação", tipo: "iniciativa" },
    frente: { id: "f1", name: "Aquisição" },
    members: [{ id: "p1", name: "Ana" }],
    checkpointId: null,
    inicio: null,
    concluido: null,
    atrasado: false,
    conflitos: [],
    ...over,
  })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"))
    a.getEventosDoCalendario.mockResolvedValue({
      eventos: [
        // Borda da grade (mês anterior): não entra.
        evento({ id: "MARCO:x", tipo: "MARCO", data: "2026-10-30", titulo: "Go/no-go", checkpointId: "x", concluido: false }),
        evento({}),
        evento({
          id: "COMUNICACAO:c1",
          tipo: "COMUNICACAO",
          data: "2026-11-05",
          titulo: "E-mail aos lojistas",
          item: { id: "e1", nome: "Paywall", tipo: "experimento" },
          members: [{ id: "p2", name: "Bia" }],
          checkpointId: "c1",
          concluido: false,
          atrasado: true,
          conflitos: [{ pessoa: "Bia", tipo: "licença" }],
        }),
      ],
      travas: [{ nome: "Black Friday", inicio: "2026-11-20", fim: "2026-11-30" }],
    })
  })
  afterEach(() => vi.useRealTimers())

  it("sem argumentos: o mês atual, só os dias do mês, com atraso e quem está fora", async () => {
    const { text, result } = await call("ver_calendario")
    expect(result.isError).toBeFalsy()
    expect(a.getEventosDoCalendario).toHaveBeenCalledWith("2026-11")
    const body = JSON.parse(text)
    expect(body.mes).toBe("2026-11")
    expect(body.datas.map((d: { tipo: string }) => d.tipo)).toEqual(["LANCAMENTO", "COMUNICACAO"])
    expect(body.datas[1]).toMatchObject({
      atrasado: true,
      concluido: false,
      foraNoDia: [{ pessoa: "Bia", tipo: "licença" }],
      item: { tipo: "experimento", id: "e1", abrirCom: "ver_experimento" },
    })
    expect(body.travasDeFerias).toEqual([{ nome: "Black Friday", inicio: "2026-11-20", fim: "2026-11-30" }])
  })

  it("filtra por tipo, responsável e atraso", async () => {
    const tipo = JSON.parse((await call("ver_calendario", { mes: "2026-11", tipos: ["COMUNICACAO"] })).text)
    expect(tipo.total).toBe(1)
    const pessoa = JSON.parse((await call("ver_calendario", { responsavelId: "00000000-0000-4000-8000-000000000001" })).text)
    expect(pessoa.total).toBe(0)
    const atrasados = JSON.parse((await call("ver_calendario", { apenasAtrasados: true })).text)
    expect(atrasados.datas.map((d: { titulo: string }) => d.titulo)).toEqual(["E-mail aos lojistas"])
  })

  it("mês inválido é recusado sem consultar", async () => {
    expect((await call("ver_calendario", { mes: "2026-13" })).result.isError).toBe(true)
    expect(a.getEventosDoCalendario).not.toHaveBeenCalled()
  })
})
