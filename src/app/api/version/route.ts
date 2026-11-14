import { NextResponse } from "next/server";
import { BUILD_INFO } from "@/lib/version";

/**
 * `GET /api/version` — qual build está servindo este ambiente.
 *
 * Serve para responder "staging e produção estão no mesmo código?" sem abrir o
 * `heroku releases` (que, além de ser mais lento, pode expor configuração).
 *
 * Fica **atrás do login**: o middleware não isenta este path, então um chamador
 * sem cookie de sessão é redirecionado para `/login`. É de propósito — o SHA do
 * commit não é segredo grave, mas também não precisa ser público, e este projeto
 * não tem nenhum endpoint aberto hoje. Se um dia um healthcheck externo precisar
 * ler isto, o caminho é adicionar `/api/version` a `PUBLIC_PATHS` no middleware,
 * conscientemente.
 */

// O payload é constante por build, mas cachear seria pior que inútil: um
// intermediário poderia devolver a versão anterior justamente depois de um
// deploy — o único momento em que alguém consulta isto.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(BUILD_INFO, {
    headers: { "Cache-Control": "no-store" },
  });
}
