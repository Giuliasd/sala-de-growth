/**
 * Transforma links soltos num texto em trechos clicáveis.
 *
 * Módulo puro (sem React): o texto continua sendo só texto no banco, e quem
 * desenha decide como mostrar o link. Reconhece `http(s)://…` e `www.…`.
 * Qualquer outro esquema (`javascript:`, `data:`…) nunca vira link — o regex só
 * casa os dois acima, e o `href` é sempre http(s).
 */

export type TrechoDeTexto =
  | { tipo: "texto"; texto: string }
  | { tipo: "link"; texto: string; href: string };

const LINK = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;

// Pontuação que fecha a frase, não o endereço: "veja https://x.com/a." termina
// em "a", e "(https://x.com/a)" não leva o parêntese junto.
const PONTUACAO_FINAL = /[.,;:!?'"]/;
const FECHA_PARA_ABRE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function contar(texto: string, caractere: string): number {
  return texto.split(caractere).length - 1;
}

/** Devolve o link sem a pontuação final que pertence à frase. */
function aparar(candidato: string): string {
  let fim = candidato.length;
  while (fim > 0) {
    const ultimo = candidato[fim - 1];
    if (PONTUACAO_FINAL.test(ultimo)) {
      fim--;
      continue;
    }
    const abre = FECHA_PARA_ABRE[ultimo];
    // Fecha sem ter aberto dentro do próprio link: é da frase.
    if (abre && contar(candidato.slice(0, fim), ultimo) > contar(candidato.slice(0, fim), abre)) {
      fim--;
      continue;
    }
    break;
  }
  return candidato.slice(0, fim);
}

/** `www.x.com` não tem esquema: o navegador o trataria como caminho relativo. */
function hrefDoLink(link: string): string | null {
  const href = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  // Precisa sobrar um endereço depois do esquema ("https://" e "www." sozinhos
  // são só texto).
  if (!/^https?:\/\/[^\s/?#.]/i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? href : null;
  } catch {
    return null;
  }
}

export function dividirEmLinks(texto: string): TrechoDeTexto[] {
  const trechos: TrechoDeTexto[] = [];
  let cursor = 0;
  const empurrarTexto = (fim: number) => {
    if (fim > cursor) trechos.push({ tipo: "texto", texto: texto.slice(cursor, fim) });
  };

  for (const achado of texto.matchAll(LINK)) {
    const inicio = achado.index ?? 0;
    // "meuwww.site" não é link: o `www.` precisa começar uma palavra.
    if (/^www\./i.test(achado[0]) && inicio > 0 && /\w/.test(texto[inicio - 1])) continue;
    const link = aparar(achado[0]);
    const href = hrefDoLink(link);
    if (!href) continue;
    empurrarTexto(inicio);
    trechos.push({ tipo: "link", texto: link, href });
    cursor = inicio + link.length;
  }
  empurrarTexto(texto.length);
  return trechos;
}
