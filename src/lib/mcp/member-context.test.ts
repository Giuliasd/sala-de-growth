import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemberRole } from "@/generated/prisma/enums"

const authMock = vi.fn()
vi.mock("../auth", () => ({ auth: () => authMock() }))
vi.mock("../prisma", () => ({
  prisma: { teamMember: { findUnique: vi.fn() } },
  withDbRetry: (fn: () => unknown) => fn(),
}))

import { getCurrentMember, requireEditPermission } from "../session"
import { runAsMcpMember } from "./member-context"

const mcpMember = {
  id: "mcp-1",
  name: "Via MCP",
  email: "mcp@example.com",
  role: MemberRole.COLABORADOR,
}

describe("getCurrentMember dentro de uma chamada MCP", () => {
  beforeEach(() => {
    authMock.mockReset()
    authMock.mockResolvedValue(null) // sem cookie de sessão
  })

  it("devolve o membro do token sem consultar a sessão do navegador", async () => {
    const result = await runAsMcpMember(mcpMember, () => getCurrentMember())
    expect(result).toEqual(mcpMember)
    expect(authMock).not.toHaveBeenCalled()
  })

  it("as regras de permissão das actions valem para o membro do MCP", async () => {
    const visitante = { ...mcpMember, role: MemberRole.VISITANTE }
    await expect(runAsMcpMember(visitante, () => requireEditPermission())).rejects.toThrow(
      "Permissão negada"
    )
    await expect(runAsMcpMember(mcpMember, () => requireEditPermission())).resolves.toEqual(mcpMember)
  })

  it("fora do contexto MCP continua exigindo a sessão (nenhuma porta nova nas páginas)", async () => {
    await expect(getCurrentMember()).rejects.toThrow("não autenticado")
    expect(authMock).toHaveBeenCalled()
  })

  it("o contexto não vaza para chamadas concorrentes", async () => {
    const other = { ...mcpMember, id: "mcp-2", name: "Outra pessoa" }
    const [a, b] = await Promise.all([
      runAsMcpMember(mcpMember, async () => {
        await new Promise((r) => setTimeout(r, 5))
        return getCurrentMember()
      }),
      runAsMcpMember(other, async () => getCurrentMember()),
    ])
    expect(a.id).toBe("mcp-1")
    expect(b.id).toBe("mcp-2")
  })
})
