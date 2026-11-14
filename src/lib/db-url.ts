/**
 * O DATABASE_URL aponta para um banco nesta máquina?
 *
 * Decide pelo host da URL, comparado a uma lista exata. Antes era
 * `url.includes("localhost")`: um banco remoto com "localhost" em qualquer
 * lugar da URL (no nome do host, na senha, num parâmetro) passava por local —
 * o que desligava o TLS em `lib/prisma.ts` e liberava a seed de demonstração
 * (achado da auditoria de segurança de 13/11/2026).
 *
 * URL que não dá para ler conta como NÃO local: o lado seguro nos dois usos.
 */
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function ehBancoLocal(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    return HOSTS_LOCAIS.has(new URL(databaseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}
