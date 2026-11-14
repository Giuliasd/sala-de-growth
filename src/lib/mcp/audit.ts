import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

const ARGS_MAX_CHARS = 4000
const ERROR_MAX_CHARS = 500

/**
 * Trunca os argumentos para caber na trilha sem virar depósito de texto
 * livre. Se estourar, guarda um marcador em vez de um JSON cortado no meio.
 */
function boundedArgs(args: unknown): Prisma.InputJsonValue | undefined {
  if (args === undefined) return undefined
  try {
    const json = JSON.stringify(args)
    if (json.length <= ARGS_MAX_CHARS) return JSON.parse(json) as Prisma.InputJsonValue
    return { truncado: true, inicio: json.slice(0, ARGS_MAX_CHARS) }
  } catch {
    return { truncado: true }
  }
}

/**
 * Registra uma chamada de ferramenta MCP.
 *
 * Nunca lança: uma falha de auditoria não pode derrubar a ferramenta (nem
 * pior: esconder o erro original). Mas ela é LOGADA — sem os argumentos, que
 * podem conter texto de pessoas, e sem token (que nem chega aqui).
 *
 * ⚠️ Só ids e argumentos da ferramenta. Nunca passe headers, o token do
 * Google nem o corpo cru da requisição.
 */
export async function recordMcpCall(entry: {
  memberId: string
  tool: string
  args?: unknown
  ok: boolean
  error?: string
}): Promise<void> {
  try {
    await prisma.mcpAuditLog.create({
      data: {
        memberId: entry.memberId,
        tool: entry.tool,
        args: boundedArgs(entry.args),
        ok: entry.ok,
        error: entry.error?.slice(0, ERROR_MAX_CHARS),
      },
    })
  } catch (error) {
    console.error(
      "[mcp] falha ao gravar auditoria —",
      error instanceof Error ? error.name : "erro desconhecido"
    )
  }
}
