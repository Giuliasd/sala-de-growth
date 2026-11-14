import { z } from "zod";

/**
 * Schema de URL segura para renderização em <a href={...}>.
 *
 * Diferente de `z.string().url()` puro, este rejeita schemes perigosos
 * (`javascript:`, `data:`, `vbscript:`, etc.) que abrem stored XSS quando
 * o valor é injetado em atributos `href`.
 *
 * Aceita apenas `http://` e `https://`, case-insensitive, sem whitespace
 * no início.
 */
// Origem fictícia só para resolver o caminho: o que importa é se ele continua
// nela depois de resolvido.
const ORIGEM_INTERNA = "http://interno.invalid";

/**
 * Caminho interno seguro para `<Link href>` / redirect, vindo de query string.
 *
 * Não basta olhar os primeiros caracteres: o parser de URL do browser remove
 * tab/CR/LF e trata `\` como `/`, então "/\t/site.com" vira "//site.com"
 * (protocol-relative → site externo). Por isso resolve o valor como o browser
 * faria e só aceita se a origem não mudou. Devolve o caminho já normalizado.
 */
export function safeInternalPath(
  value: string | string[] | undefined,
  fallback = "/dashboard",
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/")) return fallback;
  try {
    const url = new URL(raw, ORIGEM_INTERNA);
    if (url.origin !== ORIGEM_INTERNA) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export const safeHttpUrl = z
  .string()
  .max(2000, "A URL é muito longa.")
  .url("A URL deve ser válida (inclua http:// ou https://).")
  .refine(
    (u) => /^https?:\/\//i.test(u),
    "URL deve começar com http:// ou https://",
  );
