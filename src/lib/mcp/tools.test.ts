import { beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { MemberRole } from "@/generated/prisma/enums"

// Actions mockadas: aqui validamos o contrato das ferramentas pelo protocolo
// MCP de verdade (cliente ↔ servidor em memória) — schema de entrada, formato
// de saída, auditoria e, principalmente, que e-mail nunca sai.
const a = vi.hoisted(() => ({
  getIniciativas: vi.fn(),
  getIniciativaDetail: vi.fn(),
  getExperimentos: vi.fn(),
  getExperimentoById: vi.fn(),
  getObjetivosByQuarter: vi.fn(),
  getFrentes: vi.fn(),
  getQuarters: vi.fn(),
  getActiveQuarter: vi.fn(),
  getTeamMembers: vi.fn(),
  getWeeklyActivity: vi.fn(),
  buscarNoApp: vi.fn(),
  getTravasDaPessoa: vi.fn(),
  getTravasDoTime: vi.fn(),
  getAguardandoProximoPasso: vi.fn(),
  getMarcosDoTime: vi.fn(),
  getPrazosVencidos: vi.fn(),
  lerRegistroDaSemana: vi.fn(),
  getAusencias: vi.fn(),
  getConflicts: vi.fn(),
  recordMcpCall: vi.fn(),
}))

vi.mock("@/actions/iniciativas", () => ({
  getIniciativas: a.getIniciativas,
  getIniciativaDetail: a.getIniciativaDetail,
}))
vi.mock("@/actions/experimentos", () => ({
  getExperimentos: a.getExperimentos,
  getExperimentoById: a.getExperimentoById,
}))
vi.mock("@/actions/objetivos", () => ({ getObjetivosByQuarter: a.getObjetivosByQuarter }))
vi.mock("@/actions/frentes", () => ({ getFrentes: a.getFrentes }))
vi.mock("@/actions/quarters", () => ({
  getQuarters: a.getQuarters,
  getActiveQuarter: a.getActiveQuarter,
}))
vi.mock("@/actions/team-members", () => ({ getTeamMembers: a.getTeamMembers }))
vi.mock("@/actions/weekly-activity", () => ({ getWeeklyActivity: a.getWeeklyActivity }))
vi.mock("@/actions/busca", () => ({ buscarNoApp: a.buscarNoApp }))
vi.mock("@/actions/dashboard", () => ({
  getTravasDaPessoa: a.getTravasDaPessoa,
  getTravasDoTime: a.getTravasDoTime,
  getAguardandoProximoPasso: a.getAguardandoProximoPasso,
  getMarcosDoTime: a.getMarcosDoTime,
  getPrazosVencidos: a.getPrazosVencidos,
}))
vi.mock("@/lib/registro-semanal-db", () => ({ lerRegistroDaSemana: a.lerRegistroDaSemana }))
vi.mock("@/lib/horario-do-ritual-db", () => ({ lerVigenciasDoRitual: async () => [] }))
vi.mock("@/actions/ausencias", () => ({ getAusencias: a.getAusencias, getConflicts: a.getConflicts }))
vi.mock("@/actions/calendario", () => ({ getEventosDoCalendario: vi.fn() }))
vi.mock("./audit", () => ({ recordMcpCall: a.recordMcpCall }))

import { createMcpServer, filtrarCheckpoints } from "./tools"

const ME = { id: "me", name: "Eu", email: "eu@example.com", role: MemberRole.COLABORADOR }
const QUARTER_ID = "11111111-1111-4111-8111-111111111111"
const ITEM_ID = "22222222-2222-4222-8222-222222222222"

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const server = createMcpServer(ME)
  await server.connect(serverSide)
  const client = new Client({ name: "teste", version: "1.0.0" })
  await client.connect(clientSide)
  return client
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const client = await connect()
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[]
    isError?: boolean
  }
  return { result, text: result.content[0].text }
}

describe("ferramentas MCP (fase 1, somente leitura)", () => {
  beforeEach(() => {
    Object.values(a).forEach((m) => m.mockReset())
    a.getActiveQuarter.mockResolvedValue({ id: QUARTER_ID })
  })

  it("expõe só ferramentas de leitura, todas marcadas readOnly", async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      "buscar",
      "contexto_da_sala",
      "listar_experimentos",
      "listar_iniciativas",
      "listar_okrs",
      "o_que_esta_travado",
      "ver_ausencias",
      "ver_calendario",
      "ver_experimento",
      "ver_iniciativa",
      "ver_semana",
      "ver_semana_fechada",
    ])
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true)
  })

  it("contexto_da_sala não devolve e-mail de ninguém e só lista ativos", async () => {
    a.getQuarters.mockResolvedValue([
      { id: QUARTER_ID, year: 2026, quarter: 4, isActive: true, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31") },
    ])
    a.getFrentes.mockResolvedValue([
      { id: "f1", name: "Aquisição", isActive: true },
      { id: "f2", name: "Antiga", isActive: false },
    ])
    a.getTeamMembers.mockResolvedValue([
      { id: "p1", name: "Ana", role: "LIDERANCA", isActive: true, email: "ana@example.com" },
      { id: "p2", name: "Ex-membro", role: "COLABORADOR", isActive: false },
    ])

    const { text, result } = await call("contexto_da_sala")

    expect(result.isError).toBeFalsy()
    expect(text).not.toContain("@")
    expect(text).toContain("Aquisição")
    expect(text).not.toContain("Antiga")
    expect(text).not.toContain("Ex-membro")
    expect(a.recordMcpCall).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "me", tool: "contexto_da_sala", ok: true })
    )
  })

  it("listar_iniciativas usa o quarter ativo quando nenhum é informado", async () => {
    a.getIniciativas.mockResolvedValue([])
    await call("listar_iniciativas", { statuses: ["EM_ANDAMENTO"] })
    expect(a.getIniciativas).toHaveBeenCalledWith(
      expect.objectContaining({ quarterId: QUARTER_ID, statuses: ["EM_ANDAMENTO"] })
    )
  })

  it("listar_iniciativas mapeia o formato REAL da action (contagem de checkpoints, sem e-mail)", async () => {
    // Mesmo formato que getIniciativas devolve hoje: só a contagem de checkpoints
    // (_count) e os concluídos agregados — não a lista de checkpoints.
    a.getIniciativas.mockResolvedValue([
      {
        id: ITEM_ID,
        name: "Programa de indicação",
        status: "EM_ANDAMENTO",
        priority: "ALTA",
        frente: { id: "f1", name: "Indicação" },
        members: [{ id: "p1", name: "Camila" }],
        okr: { id: "k1", objective: "Fator K" },
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-11-30"),
        launchDate: null,
        analysisDate: null,
        resultado: null,
        _count: { checkpoints: 5, comments: 2 },
        checkpointsConcluidos: 3,
      },
    ])
    const { text, result } = await call("listar_iniciativas", {})
    expect(result.isError).toBeFalsy()
    const body = JSON.parse(text)
    expect(body.iniciativas[0].checkpoints).toEqual({ total: 5, concluidos: 3 })
    expect(text).not.toContain("@")
  })

  it("rejeita entrada inválida pelo schema (id que não é uuid, status inexistente)", async () => {
    const bad1 = await call("ver_iniciativa", { id: "1; DROP TABLE" })
    expect(bad1.result.isError).toBe(true)
    const bad2 = await call("listar_iniciativas", { statuses: ["INVENTADO"] })
    expect(bad2.result.isError).toBe(true)
    expect(a.getIniciativaDetail).not.toHaveBeenCalled()
    expect(a.getIniciativas).not.toHaveBeenCalled()
  })

  it("ver_iniciativa remove e-mail dos comentadores e corta texto longo", async () => {
    a.getIniciativaDetail.mockResolvedValue({
      id: ITEM_ID,
      name: "Teste",
      status: "EM_ANDAMENTO",
      priority: "ALTA",
      quarter: { year: 2026, quarter: 4 },
      frente: { name: "Aquisição" },
      members: [{ id: "p1", name: "Ana" }],
      okr: null,
      startDate: null,
      endDate: new Date("2026-11-30"),
      launchDate: null,
      analysisDate: null,
      resultado: null,
      precisaApresentarResultados: false,
      docLink: null,
      checkpoints: [],
      comments: [
        {
          id: "c1",
          content: "x".repeat(5000),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          member: { id: "p1", name: "Ana", email: "ana@example.com" },
        },
      ],
    })

    const { text, result } = await call("ver_iniciativa", { id: ITEM_ID })

    expect(result.isError).toBeFalsy()
    expect(text).not.toContain("ana@example.com")
    expect(text).not.toContain("@")
    expect(text).toContain("[cortado]")
    expect(text).toContain("2026-11-30")
  })

  it("ver_iniciativa de id inexistente vira erro amigável", async () => {
    a.getIniciativaDetail.mockResolvedValue(null)
    const { result, text } = await call("ver_iniciativa", { id: ITEM_ID })
    expect(result.isError).toBe(true)
    expect(text).toBe("Iniciativa não encontrada.")
    expect(a.recordMcpCall).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  })

  it("erro de infra não vaza detalhe para o modelo, mas é auditado", async () => {
    a.getExperimentos.mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:senha@host/db"))
    const { result, text } = await call("listar_experimentos", {})
    expect(result.isError).toBe(true)
    expect(text).not.toContain("senha")
    expect(text).not.toContain("postgres")
    expect(a.recordMcpCall).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "listar_experimentos", ok: false })
    )
  })

  it("mensagem de permissão das actions chega como está", async () => {
    a.getExperimentoById.mockRejectedValue(new Error("Permissão negada. Visitantes não podem realizar edições."))
    const { text } = await call("ver_experimento", { id: ITEM_ID })
    expect(text).toContain("Permissão negada")
  })

  it("limita a lista a 100 itens e avisa o total", async () => {
    a.getExperimentos.mockResolvedValue(
      Array.from({ length: 150 }, (_, i) => ({
        id: `e${i}`, name: `Exp ${i}`, status: "BACKLOG", frente: { name: "F" }, members: [], okr: null,
        impactScore: 1, confidenceScore: 1, effortScore: 1, iceScore: 1, iceAction: "BACKLOG",
        startDate: null, endDate: null, resultado: null, _count: { checkpoints: 0, comments: 0 },
      }))
    )
    const { text } = await call("listar_experimentos", {})
    const body = JSON.parse(text)
    expect(body.total).toBe(150)
    expect(body.mostrando).toBe(100)
    expect(body.experimentos).toHaveLength(100)
  })
})

// ─── ver_semana ─────────────────────────────────────────────────────────────
// Semana de 09/11 a 15/11/2026. A consulta (mockada) devolve a árvore inteira;
// o recorte por pessoa e a herança de responsável são os da Weekly.
const WEEK = {
  weekStart: new Date("2026-11-09T00:00:00Z"),
  weekEnd: new Date("2026-11-15T23:59:59.999Z"),
  nextWeekStart: new Date("2026-11-16T00:00:00Z"),
  nextWeekEnd: new Date("2026-11-22T23:59:59.999Z"),
}
const EU = { id: "me", name: "Eu" }
const ANA = { id: "p1", name: "Ana" }
const EX = { id: "p2", name: "Ex-membro" }

type Cp = {
  id: string; name: string; description: string | null; startDate: Date | null; dueDate: Date
  isCompleted: boolean; completedAt: Date | null; categoria: string | null
  members: { id: string; name: string }[]; tags: { id: string; name: string; color: string }[]
  inProgress: boolean; children: Cp[]
}
function cp(id: string, due: string, extra: Partial<Cp> = {}): Cp {
  return {
    id, name: id, description: null, startDate: null, dueDate: new Date(`${due}T00:00:00Z`),
    isCompleted: false, completedAt: null, categoria: null, members: [], tags: [],
    inProgress: false, children: [], ...extra,
  }
}
function item(id: string, members: { id: string; name: string }[], checkpoints: Cp[]) {
  return {
    id, name: id, status: "EM_ANDAMENTO", priority: null, launchDate: null, launchThisWeek: false,
    launchNextWeek: false, analysisDate: null, analysisThisWeek: false, analysisNextWeek: false,
    checkpoints, frente: { id: "f1", name: "Aquisição" }, members,
  }
}

describe("ver_semana", () => {
  beforeEach(() => {
    Object.values(a).forEach((m) => m.mockReset())
    a.getTeamMembers.mockResolvedValue([
      { ...EU, role: "COLABORADOR", isActive: true, email: "eu@example.com" },
      { ...ANA, role: "COLABORADOR", isActive: true, email: "ana@example.com" },
      { ...EX, role: "COLABORADOR", isActive: false, email: "ex@example.com" },
    ])
    a.getWeeklyActivity.mockResolvedValue({
      ...WEEK,
      iniciativas: [
        item("I1", [EU], [
          cp("A", "2026-11-12", {
            children: [
              cp("A1", "2026-11-13", { members: [ANA] }),
              cp("A2", "2026-11-01"), // sem dono: herda de A, que herda do item (eu); atrasado
            ],
          }),
          cp("B", "2026-11-20", {
            members: [ANA],
            startDate: new Date("2026-11-01T00:00:00Z"), // da Ana, em andamento
            children: [
              cp("B1", "2026-11-14", {
                members: [EU], isCompleted: true, completedAt: new Date("2026-11-10T12:00:00Z"),
              }),
            ],
          }),
          cp("C", "2026-12-20", { members: [EU] }), // fora da semana
        ]),
        item("I2", [ANA], [cp("D", "2026-11-11", { members: [ANA] })]),
      ],
      experimentos: [
        // Dono que saiu do time não conta: sem ninguém visível, o item some da semana do time.
        item("E1", [EX], [cp("F", "2026-11-11")]),
      ],
    })
  })

  it("sem argumentos: a semana de quem pergunta, plana, com herança e caminho", async () => {
    const { text, result } = await call("ver_semana")
    expect(result.isError).toBeFalsy()
    expect(a.getWeeklyActivity).toHaveBeenCalledWith(undefined, undefined)
    const body = JSON.parse(text)
    expect(body.de).toBe("Eu")
    expect(body.semana).toEqual({ inicio: "2026-11-09", fim: "2026-11-15" })
    expect(body.itens.map((i: { id: string }) => i.id)).toEqual(["I1"])
    const cps = body.itens[0].checkpoints
    expect(cps.map((c: { id: string }) => c.id)).toEqual(["A", "A2", "B1"])
    expect(cps.map((c: { situacao: string }) => c.situacao)).toEqual(["vence_na_semana", "atrasado", "concluido"])
    expect(cps[0].caminho).toBeUndefined() // nulo some da resposta compacta
    expect(cps[1]).toMatchObject({ caminho: "A", responsaveis: ["Eu"] })
    expect(cps[2]).toMatchObject({ caminho: "B", concluidoEm: "2026-11-10" })
    expect(body.resumo).toEqual({ atrasado: 1, vence_na_semana: 1, em_andamento: 0, concluido: 1 })
    expect(text).not.toContain("@")
    expect(a.recordMcpCall).toHaveBeenCalledWith(expect.objectContaining({ tool: "ver_semana", ok: true }))
  })

  it("todoTime: todo mundo visível, sem o item de quem saiu do time", async () => {
    const { text } = await call("ver_semana", { todoTime: true, semana: "2026-11-12" })
    expect(a.getWeeklyActivity).toHaveBeenCalledWith(undefined, "2026-11-12")
    const body = JSON.parse(text)
    expect(body.de).toBe("time todo")
    expect(body.itens.map((i: { id: string }) => i.id)).toEqual(["I1", "I2"])
    expect(body.itens[0].checkpoints.map((c: { id: string }) => c.id)).toEqual(["A", "A1", "A2", "B", "B1"])
    expect(body.itens[0].checkpoints[3].situacao).toBe("em_andamento")
    expect(text).not.toContain("@")
  })

  it("memberId de outra pessoa: a semana dela", async () => {
    const { text } = await call("ver_semana", { memberId: "33333333-3333-4333-8333-333333333333" })
    expect(JSON.parse(text).de).toBe("pessoa não encontrada")
    a.getTeamMembers.mockResolvedValue([
      { ...EU, role: "COLABORADOR", isActive: true },
      { id: QUARTER_ID, name: "Ana", role: "COLABORADOR", isActive: true },
    ])
    a.getWeeklyActivity.mockResolvedValue({
      ...WEEK,
      iniciativas: [item("I2", [{ id: QUARTER_ID, name: "Ana" }], [cp("D", "2026-11-11")])],
      experimentos: [],
    })
    const r = JSON.parse((await call("ver_semana", { memberId: QUARTER_ID })).text)
    expect(r.de).toBe("Ana")
    expect(r.itens[0].checkpoints[0]).toMatchObject({ id: "D", responsaveis: ["Ana"] })
  })

  it("rejeita data fora do formato e corta listas enormes com aviso", async () => {
    expect((await call("ver_semana", { semana: "12/11/2026" })).result.isError).toBe(true)
    a.getWeeklyActivity.mockResolvedValue({
      ...WEEK,
      iniciativas: [
        item("Grande", [EU], Array.from({ length: 300 }, (_, i) => ({
          ...cp(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, "2026-11-12", { members: [EU] }),
          name: `Checkpoint com um nome comprido como os de verdade, número ${i}`,
          tags: [{ id: "t", name: "Comunicação", color: "x" }],
        }))),
      ],
      experimentos: [],
    })
    const { text } = await call("ver_semana")
    expect(text).not.toContain("[resposta cortada")
    const body = JSON.parse(text)
    expect(body.itens[0].checkpoints).toHaveLength(150)
    expect(body.resumo.vence_na_semana).toBe(300)
    expect(body.aviso).toContain("150 de 300")
  })
})

describe("filtro de checkpoints do detalhe", () => {
  const ANA = { id: "p1", name: "Ana" }
  const no = (id: string, isCompleted: boolean, members: { id: string; name: string }[] = [], children: unknown[] = []) => ({
    id, name: id, dueDate: new Date("2026-11-12T00:00:00Z"), isCompleted, members, children,
  })
  // Pai concluído com um filho aberto; filho sem dono herda do pai (Ana).
  const arvore = [
    no("pai", true, [ANA], [no("filho-aberto", false), no("filho-feito", true)]),
    no("solto-feito", true),
    no("meu-aberto", false, [{ id: "me", name: "Eu" }]),
  ] as Parameters<typeof filtrarCheckpoints>[0]
  const ids = (cps: { id: string; children?: unknown[] }[]): string[] =>
    cps.flatMap((c) => [c.id, ...ids((c.children ?? []) as { id: string }[])])

  it("sem filtro devolve a árvore como está", () => {
    expect(filtrarCheckpoints(arvore, [], {})).toBe(arvore)
  })

  it("apenasAbertos mantém o pai concluído como contexto do filho aberto", () => {
    expect(ids(filtrarCheckpoints(arvore, [], { apenasAbertos: true }))).toEqual(["pai", "filho-aberto", "meu-aberto"])
  })

  it("responsavelId usa a herança: o filho sem dono é de quem responde pelo pai", () => {
    expect(ids(filtrarCheckpoints(arvore, [], { responsavelId: "p1" }))).toEqual(["pai", "filho-aberto", "filho-feito"])
    // Sem dono em lugar nenhum, vale o do item.
    expect(ids(filtrarCheckpoints(arvore, [{ id: "me" }], { responsavelId: "me" }))).toEqual(["solto-feito", "meu-aberto"])
  })

  it("ver_iniciativa informa o total e quantos ficaram no filtro", async () => {
    a.getIniciativaDetail.mockResolvedValue({
      id: ITEM_ID, name: "Black Friday", status: "EM_ANDAMENTO", priority: "ALTA",
      quarter: { year: 2026, quarter: 4 }, frente: { name: "F" }, members: [ANA], okr: null,
      startDate: null, endDate: null, launchDate: null, analysisDate: null, resultado: null,
      precisaApresentarResultados: false, docLink: null, checkpoints: arvore, comments: [],
    })
    const body = JSON.parse((await call("ver_iniciativa", { id: ITEM_ID, apenasAbertos: true })).text)
    expect(body.totalDeCheckpoints).toBe(5)
    expect(body.checkpointsNoFiltro).toBe(3)
    expect(body.checkpoints.map((c: { id: string }) => c.id)).toEqual(["pai", "meu-aberto"])
    const semFiltro = JSON.parse((await call("ver_iniciativa", { id: ITEM_ID })).text)
    expect(semFiltro.checkpointsNoFiltro).toBeUndefined()
  })
})
