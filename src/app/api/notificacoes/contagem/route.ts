import { NextResponse } from "next/server";
import { AccessRevokedError, NotAuthenticatedError, getCurrentMember } from "@/lib/session";
import { contarNaoLidas } from "@/lib/notificacoes-db";

/**
 * `GET /api/notificacoes/contagem` — quantos avisos a pessoa logada ainda não leu.
 *
 * É o que o sino da barra lateral consulta a cada minuto. Fica como rota GET
 * (e não server action) de propósito: server actions de uma mesma aba entram
 * numa fila única, e uma consulta periódica ficaria no caminho das edições do
 * usuário.
 *
 * Atrás do login (o middleware já barra quem não tem cookie); aqui a sessão é
 * conferida de novo e só o contador da PRÓPRIA pessoa sai.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const eu = await getCurrentMember();
    const naoLidas = await contarNaoLidas(eu.id);
    return NextResponse.json({ naoLidas }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NotAuthenticatedError || error instanceof AccessRevokedError) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("GET /api/notificacoes/contagem error:", error);
    return NextResponse.json({ error: "Erro ao contar." }, { status: 500 });
  }
}
