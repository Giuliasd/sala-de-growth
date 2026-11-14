/**
 * Texto de busca vindo do cliente (URL ou campo): normaliza antes de virar
 * filtro. Devolve null quando não há o que buscar.
 *
 * - colapsa espaços e apara as pontas ("  relatório   q3 " → "relatório q3");
 * - corta em BUSCA_MAX: o texto vai parar num LIKE no banco;
 * - exige `minimo` caracteres — na busca global, 1 letra devolveria o app todo.
 *
 * Caracteres como % e _ não precisam de escape aqui: o `contains` do Prisma
 * os trata como literais.
 */
export const BUSCA_MAX = 80;
export const BUSCA_MIN_GLOBAL = 2;

export function normalizarBusca(
  texto: string | null | undefined,
  minimo = 1
): string | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim().slice(0, BUSCA_MAX).trim();
  return t.length >= minimo ? t : null;
}

/**
 * Minúsculas e sem acento: "José", "jose" e "JOSÉ" viram o mesmo texto. É o que
 * permite buscar "relatorio" e achar "Relatório" (o `mode: "insensitive"` do
 * Prisma ignora caixa, mas não acento).
 */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** O termo aparece em algum dos textos, ignorando acento e caixa? */
export function casaComBusca(termo: string, ...textos: (string | null | undefined)[]): boolean {
  const q = semAcento(termo);
  return textos.some((t) => t != null && semAcento(t).includes(q));
}
