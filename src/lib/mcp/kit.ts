import { getActiveQuarter } from "@/actions/quarters"
import { recordMcpCall } from "./audit"
import type { McpMember } from "./member-context"

/**
 * Utilitários comuns das ferramentas MCP (tools.ts e tools-rotina.ts): corte
 * de texto, datas, formato de resposta, erro público e a trilha de auditoria.
 * Toda ferramenta passa por `audited` — é o que garante que nenhuma chamada
 * fique fora do McpAuditLog e que detalhe de infra não vaze para o modelo.
 */

export const LIST_LIMIT = 100
// A semana do time pode ter centenas de checkpoints: 150 linhas compactas
// (~250 caracteres cada) cabem com folga em RESPONSE_MAX_CHARS.
export const SEMANA_LIMIT = 150
export const TEXT_CLIP = 2000
export const RESPONSE_MAX_CHARS = 60_000

export type ToolResult = {
  content: { type: "text"; text: string }[]
  isError?: boolean
}

export function clip(value: string | null | undefined, max = TEXT_CLIP): string | null {
  if (value == null) return null
  return value.length > max ? `${value.slice(0, max)}… [cortado]` : value
}

export function day(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function people(list: { id: string; name: string }[] | undefined) {
  return (list ?? []).map((m) => ({ id: m.id, nome: m.name }))
}

/** `compacto`: sem indentação e sem campos nulos — para respostas com muitas linhas. */
export function ok(payload: unknown, compacto = false): ToolResult {
  let text = compacto
    ? JSON.stringify(payload, (_k, v) => (v === null ? undefined : v))
    : JSON.stringify(payload, null, 1)
  if (text.length > RESPONSE_MAX_CHARS) {
    text = `${text.slice(0, RESPONSE_MAX_CHARS)}\n… [resposta cortada: use filtros (apenasAbertos, responsavelId, memberId) para ver menos]`
  }
  return { content: [{ type: "text", text }] }
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true }
}

// Mensagens de regra de negócio (permissão, acesso, "não encontrada") chegam como estão;
// qualquer outra coisa vira texto genérico — detalhe de infra não vaza para o modelo.
export function publicError(error: unknown): string {
  if (
    error instanceof Error &&
    (error.message.includes("Permissão negada") ||
      error.message.includes("Acesso negado") ||
      error.message.includes("não encontrad"))
  ) {
    return error.message
  }
  return "Erro inesperado ao consultar a Sala. Tente de novo."
}

export async function audited(
  member: McpMember,
  tool: string,
  args: unknown,
  fn: () => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    const result = await fn()
    await recordMcpCall({ memberId: member.id, tool, args, ok: !result.isError })
    return result
  } catch (error) {
    const message = publicError(error)
    if (message.startsWith("Erro inesperado")) {
      console.error(`[mcp] ${tool} falhou —`, error instanceof Error ? error.name : "erro")
    }
    await recordMcpCall({ memberId: member.id, tool, args, ok: false, error: message })
    return fail(message)
  }
}

export async function resolveQuarterId(quarterId: string | undefined): Promise<string | undefined> {
  if (quarterId) return quarterId
  return (await getActiveQuarter())?.id
}
