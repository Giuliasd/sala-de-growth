// RFC 9728 §3: para um recurso com caminho (/api/mcp) alguns clientes buscam o
// metadata em /.well-known/oauth-protected-resource/api/mcp. Mesmo conteúdo.
// `dynamic` é literal aqui: o Next não analisa configuração de segmento re-exportada.
export const dynamic = "force-dynamic"
export { GET } from "../../route"
