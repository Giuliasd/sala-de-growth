import { AsyncLocalStorage } from "node:async_hooks"
import type { MemberRole } from "@/generated/prisma/enums"

export type McpMember = {
  id: string
  name: string
  email: string
  role: MemberRole
}

// Carrega o membro autenticado pelo token do MCP durante UMA chamada.
//
// As server actions descobrem quem está logado por `getCurrentMember()`, que lê
// o cookie de sessão. Uma chamada MCP chega sem cookie — chega com um token já
// validado em `lib/mcp/auth.ts`. Em vez de reescrever as ~30 actions, a rota
// MCP roda a chamada dentro de `runAsMcpMember` e `getCurrentMember()` consulta
// este contexto antes do cookie. Validação Zod, regras de posse e
// `revalidatePath` das actions continuam valendo sem duplicar nada.
//
// ⚠️ ÚNICO ponto que pode abrir este contexto é a rota /api/mcp, DEPOIS de
// `authenticateMcpRequest`. Não exporte nem chame `runAsMcpMember` de outro lugar.
const store = new AsyncLocalStorage<McpMember>()

export function runAsMcpMember<T>(member: McpMember, fn: () => Promise<T>): Promise<T> {
  return store.run(member, fn)
}

export function getMcpMember(): McpMember | undefined {
  return store.getStore()
}
