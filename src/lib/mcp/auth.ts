import { createHash } from "node:crypto"
import { prisma, withDbRetry } from "@/lib/prisma"
import { normalizarEmail } from "@/lib/email"
import type { McpMember } from "./member-context"
import { MemberRole } from "@/generated/prisma/enums"

/**
 * Autenticação do endpoint MCP.
 *
 * O Claude faz o login com o Google (OAuth) e manda o access token em
 * `Authorization: Bearer`. Aqui o servidor:
 *   1. valida o token no endpoint `tokeninfo` do Google;
 *   2. confere que ele foi emitido PARA O NOSSO CLIENT (`aud`) — sem isso,
 *      qualquer outro app que a pessoa autorizou com Google serviria de chave;
 *   3. exige e-mail verificado;
 *   4. liga o e-mail a um TeamMember ATIVO (mesma regra do login da Sala).
 *
 * Nada aqui cria conta: quem não é membro ativo recebe 401/403.
 *
 * O token NUNCA é logado nem guardado em claro — o cache usa só o SHA-256.
 */

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
const TOKEN_MAX_LENGTH = 2048
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/

// Cache curto do que o Google respondeu sobre o TOKEN (não sobre o membro:
// isActive/role são relidos do banco a cada chamada, então desativar alguém
// corta o acesso na hora).
const TOKEN_CACHE_TTL_MS = 60_000
const TOKEN_CACHE_MAX = 500

type TokenVerdict =
  | { valid: true; email: string; expiresAt: number }
  | { valid: false; expiresAt: number }

const tokenCache = new Map<string, TokenVerdict>()

export class McpAuthError extends Error {
  readonly status: 401 | 403 | 503
  constructor(status: 401 | 403 | 503, message: string) {
    super(message)
    this.name = "McpAuthError"
    this.status = status
  }
}

/** Kill switch: sem `MCP_ENABLED=true` a rota inteira fica desligada. */
export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === "true"
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function remember(key: string, verdict: TokenVerdict) {
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const now = Date.now()
    for (const [k, v] of tokenCache) if (v.expiresAt < now) tokenCache.delete(k)
    // Ainda cheio: descarta o mais antigo (Map preserva ordem de inserção).
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      const oldest = tokenCache.keys().next().value
      if (oldest !== undefined) tokenCache.delete(oldest)
    }
  }
  tokenCache.set(key, verdict)
}

/** Só para testes. */
export function __resetMcpAuthCache() {
  tokenCache.clear()
}

function extractBearer(header: string | null): string {
  if (!header) throw new McpAuthError(401, "Token ausente.")
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!match) throw new McpAuthError(401, "Token ausente.")
  const token = match[1]
  if (token.length > TOKEN_MAX_LENGTH || !TOKEN_PATTERN.test(token)) {
    throw new McpAuthError(401, "Token inválido.")
  }
  return token
}

async function verifyWithGoogle(token: string, clientId: string): Promise<TokenVerdict> {
  const now = Date.now()
  let res: Response
  try {
    // POST com o token no corpo: não deixa o token em URL (logs de proxy).
    res = await fetch(TOKENINFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    })
  } catch {
    // Falha de rede/timeout não é veredito sobre o token: não cacheia.
    throw new McpAuthError(503, "Não foi possível validar o token agora.")
  }

  // 400 = token inválido/expirado (veredito definitivo). Outros erros = infra.
  if (res.status === 400) return { valid: false, expiresAt: now + 30_000 }
  if (!res.ok) throw new McpAuthError(503, "Não foi possível validar o token agora.")

  const info = (await res.json().catch(() => null)) as {
    aud?: string
    email?: string
    email_verified?: string | boolean
    expires_in?: string | number
  } | null
  if (!info) throw new McpAuthError(503, "Não foi possível validar o token agora.")

  const verified = info.email_verified === true || info.email_verified === "true"
  const expiresIn = Number(info.expires_in)
  const ok =
    info.aud === clientId && // emitido para o NOSSO client
    verified &&
    typeof info.email === "string" &&
    info.email.length > 0 &&
    Number.isFinite(expiresIn) &&
    expiresIn > 0

  if (!ok) return { valid: false, expiresAt: now + 30_000 }

  return {
    valid: true,
    email: info.email!.toLowerCase(),
    // Nunca vale mais que o próprio token.
    expiresAt: now + Math.min(TOKEN_CACHE_TTL_MS, expiresIn * 1000),
  }
}

async function resolveEmail(token: string): Promise<string> {
  const clientId = process.env.MCP_GOOGLE_CLIENT_ID
  if (!clientId) throw new McpAuthError(503, "MCP não configurado.")

  const key = hashToken(token)
  let verdict = tokenCache.get(key)
  if (!verdict || verdict.expiresAt < Date.now()) {
    verdict = await verifyWithGoogle(token, clientId)
    remember(key, verdict)
  }
  if (!verdict.valid) throw new McpAuthError(401, "Token inválido.")
  return verdict.email
}

export async function authenticateMcpRequest(
  authorizationHeader: string | null
): Promise<McpMember> {
  const token = extractBearer(authorizationHeader)
  const email = await resolveEmail(token)

  // Mesma busca do login web (lib/auth.ts): igualdade exata no e-mail
  // normalizado. Antes era `mode: "insensitive"` sem orderBy — se sobrasse um
  // par legado "Maria@x" / "maria@x", o MCP podia pegar outra linha que a web,
  // inclusive uma ainda ativa depois de a da web ser desativada.
  const member = await withDbRetry(() =>
    prisma.teamMember.findUnique({
      where: { email: normalizarEmail(email) },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  )

  // Sem conta (convite é pela tela, nunca pelo MCP) ou conta desativada.
  if (!member || !member.isActive) {
    throw new McpAuthError(403, "Sem acesso à Sala de Growth.")
  }

  return {
    id: member.id,
    name: member.name,
    email: member.email ?? "",
    role: member.role as MemberRole,
  }
}
