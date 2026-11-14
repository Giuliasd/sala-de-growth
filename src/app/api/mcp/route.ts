import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { rateLimit } from "@/lib/rate-limit"
import { authenticateMcpRequest, isMcpEnabled, McpAuthError } from "@/lib/mcp/auth"
import { runAsMcpMember } from "@/lib/mcp/member-context"
import { createMcpServer } from "@/lib/mcp/tools"
import { getAppUrl, getProtectedResourceMetadataUrl } from "@/lib/mcp/app-url"

/**
 * Endpoint MCP da Sala de Growth (Streamable HTTP, sem sessão).
 *
 * Esta rota é PÚBLICA para o middleware (o Claude não tem cookie) — por isso a
 * autenticação acontece aqui dentro e nada executa antes dela. Ordem:
 *   1. kill switch (MCP_ENABLED)        → 503
 *   2. rejeita requisições de navegador → 403 (o cliente MCP não manda Origin)
 *   3. limite de tamanho do corpo       → 413
 *   4. Bearer válido + membro ativo     → 401 / 403
 *   5. rate limit por MEMBRO            → 429
 *   6. executa dentro do contexto do membro (getCurrentMember() passa a
 *      devolvê-lo, então as actions aplicam as mesmas permissões das telas)
 *
 * Cookies de sessão são ignorados de propósito: só vale `Authorization: Bearer`,
 * então um site malicioso não consegue usar a sessão do navegador aqui.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 256 * 1024
const RATE_LIMIT = { limit: 120, windowMs: 60_000 }

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}) {
  return json(status, { jsonrpc: "2.0", error: { code: -32000, message }, id: null }, headers)
}

function unauthorized(message: string) {
  // RFC 9728: aponta o cliente para o discovery do OAuth, que inicia o login.
  return jsonRpcError(401, message, {
    "WWW-Authenticate": `Bearer resource_metadata="${getProtectedResourceMetadataUrl()}"`,
  })
}

export async function POST(request: Request) {
  if (!isMcpEnabled()) return jsonRpcError(503, "MCP desativado.")

  // Navegadores sempre mandam Origin em POST; clientes MCP (servidor a servidor
  // ou CLI) não. Qualquer Origin aqui é um site tentando usar este endpoint.
  if (request.headers.has("origin")) return jsonRpcError(403, "Origem não permitida.")

  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return jsonRpcError(413, "Requisição grande demais.")
  }

  let member
  try {
    member = await authenticateMcpRequest(request.headers.get("authorization"))
  } catch (error) {
    if (error instanceof McpAuthError) {
      return error.status === 401 ? unauthorized(error.message) : jsonRpcError(error.status, error.message)
    }
    console.error("[mcp] erro inesperado na autenticação —", error instanceof Error ? error.name : "erro")
    return jsonRpcError(500, "Erro interno.")
  }

  const rl = rateLimit(`mcp:${member.id}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs)
  if (!rl.ok) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
    return jsonRpcError(429, "Muitas requisições. Aguarde um instante.", {
      "Retry-After": String(retryAfter),
    })
  }

  // O corpo pode vir sem Content-Length (chunked): confere o tamanho real.
  const raw = await request.text()
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return jsonRpcError(413, "Requisição grande demais.")
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(raw)
  } catch {
    return jsonRpcError(400, "JSON inválido.")
  }
  // Uma mensagem por requisição. O SDK aceita lote JSON-RPC (array de até 100
  // mensagens), mas o rate limit acima conta requisições: com lote, 120/min
  // viravam até 12.000 chamadas de ferramenta por minuto por membro (achado da
  // auditoria de segurança de 13/11/2026). A spec do MCP (2025-06-18) não tem
  // mais lote, então nenhum cliente atual precisa dele.
  if (Array.isArray(parsedBody)) {
    return jsonRpcError(400, "Lote JSON-RPC não é aceito: envie uma mensagem por requisição.")
  }

  // Um servidor/transporte por requisição: sem sessão, sem estado compartilhado
  // entre membros (a closure carrega o membro desta chamada).
  const server = createMcpServer(member)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection: true,
    allowedHosts: [new URL(getAppUrl()).host],
  })

  try {
    await server.connect(transport)
    return await runAsMcpMember(member, () => transport.handleRequest(request, { parsedBody }))
  } catch (error) {
    console.error("[mcp] erro ao processar —", error instanceof Error ? error.name : "erro")
    return jsonRpcError(500, "Erro interno.")
  } finally {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

// Sem sessões nem streaming de servidor: só POST.
function methodNotAllowed() {
  return jsonRpcError(405, "Método não permitido.", { Allow: "POST" })
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
