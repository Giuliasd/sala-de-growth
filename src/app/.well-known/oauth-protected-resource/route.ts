import { getMcpUrl } from "@/lib/mcp/app-url"
import { isMcpEnabled } from "@/lib/mcp/auth"

/**
 * Discovery do OAuth para clientes MCP (RFC 9728 — Protected Resource Metadata).
 *
 * Diz ao Claude "este recurso é protegido; faça login no Google". O servidor de
 * autorização é o próprio Google: a Sala não emite token nenhum. Público de
 * propósito (o cliente lê antes de ter token) e sem dado sensível.
 */

export const dynamic = "force-dynamic"

export function GET() {
  if (!isMcpEnabled()) return new Response("Not Found", { status: 404 })

  return Response.json(
    {
      resource: getMcpUrl(),
      authorization_servers: ["https://accounts.google.com"],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  )
}
