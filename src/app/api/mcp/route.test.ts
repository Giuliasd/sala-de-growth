import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A rota é o portão: aqui conferimos a ORDEM das defesas (kill switch, Origin,
// tamanho, Bearer, rate limit) sem Prisma, sem Google e sem executar ferramenta.
const authenticate = vi.fn()
vi.mock("@/lib/mcp/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp/auth")>("@/lib/mcp/auth")
  return { ...actual, authenticateMcpRequest: (h: string | null) => authenticate(h) }
})
vi.mock("@/lib/mcp/tools", () => ({
  createMcpServer: vi.fn(() => {
    throw new Error("não deveria chegar nas ferramentas")
  }),
}))
const rateLimitMock = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimitMock(...a),
}))

import { McpAuthError } from "@/lib/mcp/auth"
import { POST, GET, DELETE } from "./route"

function req(init: { headers?: Record<string, string>; body?: string } = {}) {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  })
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    authenticate.mockReset()
    rateLimitMock.mockReset()
    rateLimitMock.mockReturnValue({ ok: true, remaining: 1, limit: 120, resetAt: Date.now() + 1000 })
    vi.stubEnv("MCP_ENABLED", "true")
    vi.stubEnv("AUTH_URL", "http://localhost:3000")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("503 com o kill switch desligado — sem tentar autenticar", async () => {
    vi.stubEnv("MCP_ENABLED", "")
    const res = await POST(req({ headers: { authorization: "Bearer x" } }))
    expect(res.status).toBe(503)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("403 para qualquer requisição com Origin (navegador) — antes de autenticar", async () => {
    const res = await POST(req({ headers: { origin: "https://site-malicioso.com", authorization: "Bearer x" } }))
    expect(res.status).toBe(403)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("413 quando o Content-Length declarado passa do limite", async () => {
    const res = await POST(req({ headers: { "content-length": String(10 * 1024 * 1024) } }))
    expect(res.status).toBe(413)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("401 com WWW-Authenticate apontando o discovery quando falta o token", async () => {
    authenticate.mockRejectedValue(new McpAuthError(401, "Token ausente."))
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toContain(
      "http://localhost:3000/.well-known/oauth-protected-resource"
    )
  })

  it("só cookie de sessão não autentica (só vale Bearer)", async () => {
    authenticate.mockImplementation(async (header: string | null) => {
      if (!header) throw new McpAuthError(401, "Token ausente.")
    })
    const res = await POST(req({ headers: { cookie: "authjs.session-token=abc" } }))
    expect(res.status).toBe(401)
    expect(authenticate).toHaveBeenCalledWith(null)
  })

  it("403 para membro sem acesso e 503 quando o Google não responde", async () => {
    authenticate.mockRejectedValueOnce(new McpAuthError(403, "Sem acesso à Sala de Growth."))
    expect((await POST(req({ headers: { authorization: "Bearer x" } }))).status).toBe(403)
    authenticate.mockRejectedValueOnce(new McpAuthError(503, "Não foi possível validar o token agora."))
    expect((await POST(req({ headers: { authorization: "Bearer x" } }))).status).toBe(503)
  })

  it("429 com Retry-After quando o membro passa do limite", async () => {
    authenticate.mockResolvedValue({ id: "m1", name: "F", email: "f@x", role: "COLABORADOR" })
    rateLimitMock.mockReturnValue({ ok: false, remaining: 0, limit: 120, resetAt: Date.now() + 30_000 })
    const res = await POST(req({ headers: { authorization: "Bearer x" } }))
    expect(res.status).toBe(429)
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(rateLimitMock.mock.calls[0][0]).toBe("mcp:m1")
  })

  it("400 para lote JSON-RPC: o rate limit conta requisições, não mensagens", async () => {
    authenticate.mockResolvedValue({ id: "m1", name: "F", email: "f@x", role: "COLABORADOR" })
    const lote = JSON.stringify(
      Array.from({ length: 50 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "tools/list" })),
    )
    const res = await POST(req({ headers: { authorization: "Bearer x" }, body: lote }))
    expect(res.status).toBe(400)
    // Não chega nas ferramentas (o mock de createMcpServer lançaria).
    expect(rateLimitMock).toHaveBeenCalledTimes(1)
  })

  it("400 para JSON inválido e 413 para corpo grande sem Content-Length", async () => {
    authenticate.mockResolvedValue({ id: "m1", name: "F", email: "f@x", role: "COLABORADOR" })
    expect((await POST(req({ headers: { authorization: "Bearer x" }, body: "{nao-json" }))).status).toBe(400)
    const big = JSON.stringify({ x: "a".repeat(300 * 1024) })
    expect((await POST(req({ headers: { authorization: "Bearer x" }, body: big }))).status).toBe(413)
  })

  it("GET e DELETE não existem (sem sessão nem streaming)", async () => {
    expect((await GET()).status).toBe(405)
    expect((await DELETE()).status).toBe(405)
  })
})
