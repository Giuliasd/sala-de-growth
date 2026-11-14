/**
 * URL pública canônica do app, SEMPRE vinda de configuração.
 *
 * Nunca derive isto do header `Host`/`X-Forwarded-Host` da requisição: quem
 * controla o header controlaria o `resource` anunciado no discovery do OAuth.
 * Mesma fonte usada pelos convites (ver actions/invites.ts).
 */
export function getAppUrl(): string {
  const raw = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"
  return raw.replace(/\/+$/, "")
}

export function getMcpUrl(): string {
  return `${getAppUrl()}/api/mcp`
}

export function getProtectedResourceMetadataUrl(): string {
  return `${getAppUrl()}/.well-known/oauth-protected-resource`
}
