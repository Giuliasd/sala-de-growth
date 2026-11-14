import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemberRole } from "@/generated/prisma/enums"

// Mockamos o banco e o fetch do Google: os testes exercitam SÓ a lógica do
// gate (aud, e-mail verificado, membro ativo, cache), sem rede nem Postgres.
const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { teamMember: { findUnique: (...a: unknown[]) => findUnique(...a) } },
  withDbRetry: (fn: () => unknown) => fn(),
}))

import { authenticateMcpRequest, McpAuthError, __resetMcpAuthCache } from "./auth"

const CLIENT_ID = "mcp-client.apps.googleusercontent.com"
const TOKEN = "ya29.a0-TOKEN_de_teste"

function googleOk(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      aud: CLIENT_ID,
      email: "Fulano@Example.com",
      email_verified: "true",
      expires_in: "3000",
      ...overrides,
    }),
    { status: 200 }
  )
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    name: "Fulano",
    email: "fulano@example.com",
    role: MemberRole.COLABORADOR,
    isActive: true,
    ...overrides,
  }
}

async function expectAuthError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(McpAuthError)
  expect((error as McpAuthError).status).toBe(status)
  // O token nunca pode aparecer na mensagem.
  expect((error as McpAuthError).message).not.toContain(TOKEN)
}

describe("authenticateMcpRequest", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    __resetMcpAuthCache()
    fetchMock.mockReset()
    findUnique.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("MCP_GOOGLE_CLIENT_ID", CLIENT_ID)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("aceita token do nosso client de membro ativo (e-mail normalizado)", async () => {
    fetchMock.mockResolvedValue(googleOk())
    findUnique.mockResolvedValue(member())

    const result = await authenticateMcpRequest(`Bearer ${TOKEN}`)

    expect(result).toEqual({
      id: "m1",
      name: "Fulano",
      email: "fulano@example.com",
      role: MemberRole.COLABORADOR,
    })
    // Igualdade exata no e-mail normalizado — a mesma chave do login web.
    expect(findUnique.mock.calls[0][0].where).toEqual({ email: "fulano@example.com" })
  })

  it("manda o token no corpo do POST, nunca na URL", async () => {
    fetchMock.mockResolvedValue(googleOk())
    findUnique.mockResolvedValue(member())

    await authenticateMcpRequest(`Bearer ${TOKEN}`)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain(TOKEN)
    expect(init.method).toBe("POST")
    expect(String(init.body)).toContain("access_token=")
  })

  it("rejeita header ausente ou fora do formato Bearer", async () => {
    await expectAuthError(authenticateMcpRequest(null), 401)
    await expectAuthError(authenticateMcpRequest("Basic abc"), 401)
    await expectAuthError(authenticateMcpRequest("Bearer"), 401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejeita token com caracteres estranhos ou grande demais sem chamar o Google", async () => {
    await expectAuthError(authenticateMcpRequest("Bearer a b"), 401)
    await expectAuthError(authenticateMcpRequest("Bearer <script>"), 401)
    await expectAuthError(authenticateMcpRequest(`Bearer ${"a".repeat(3000)}`), 401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("503 quando MCP_GOOGLE_CLIENT_ID não está configurado", async () => {
    vi.stubEnv("MCP_GOOGLE_CLIENT_ID", "")
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejeita token emitido para OUTRO app (aud diferente)", async () => {
    fetchMock.mockResolvedValue(googleOk({ aud: "outro-app.apps.googleusercontent.com" }))
    findUnique.mockResolvedValue(member())

    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 401)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("rejeita e-mail não verificado", async () => {
    fetchMock.mockResolvedValue(googleOk({ email_verified: "false" }))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 401)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("rejeita resposta sem e-mail", async () => {
    fetchMock.mockResolvedValue(googleOk({ email: undefined }))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 401)
  })

  it("rejeita token expirado (400 do Google)", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 401)
  })

  it("falha de rede é 503 e NÃO é cacheada como token inválido", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 503)

    fetchMock.mockResolvedValueOnce(googleOk())
    findUnique.mockResolvedValue(member())
    await expect(authenticateMcpRequest(`Bearer ${TOKEN}`)).resolves.toMatchObject({ id: "m1" })
  })

  it("erro 5xx do Google é 503", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 502 }))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 503)
  })

  it("403 para membro desativado", async () => {
    fetchMock.mockResolvedValue(googleOk())
    findUnique.mockResolvedValue(member({ isActive: false }))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 403)
  })

  it("403 para e-mail sem conta (MCP não cria conta)", async () => {
    fetchMock.mockResolvedValue(googleOk())
    findUnique.mockResolvedValue(null)
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 403)
  })

  it("cacheia só o veredito do token: desativar o membro corta o acesso na hora", async () => {
    fetchMock.mockResolvedValue(googleOk())
    findUnique.mockResolvedValue(member())
    await authenticateMcpRequest(`Bearer ${TOKEN}`)

    // Mesmo token (cache hit no Google), mas o banco agora diz "inativo".
    findUnique.mockResolvedValue(member({ isActive: false }))
    await expectAuthError(authenticateMcpRequest(`Bearer ${TOKEN}`), 403)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it("não vira admin por e-mail: devolve o papel que está no banco", async () => {
    fetchMock.mockResolvedValue(googleOk())
    findUnique.mockResolvedValue(member({ role: MemberRole.VISITANTE }))
    const result = await authenticateMcpRequest(`Bearer ${TOKEN}`)
    expect(result.role).toBe(MemberRole.VISITANTE)
  })
})
