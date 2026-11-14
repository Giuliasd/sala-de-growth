/**
 * CSV para abrir direto no Excel/Google Sheets em português do Brasil.
 *
 * - separador `;` (o Excel pt-BR usa vírgula como decimal, então `,` quebraria
 *   as colunas) e BOM UTF-8 (sem ele o Excel mostra "relatÃ³rio");
 * - células com `;`, aspas ou quebra de linha vão entre aspas, aspas duplicadas;
 * - **injeção de fórmula:** texto digitado por qualquer membro (nome de
 *   iniciativa, descrição) que comece com `=`, `+`, `-`, `@`, tab ou CR seria
 *   executado como fórmula ao abrir a planilha. Recebe um `'` na frente, que o
 *   Excel/Sheets exibem como texto. Números de verdade (`number`) não são mexidos.
 */
const SEPARADOR = ";";
const BOM = "﻿";

export function celulaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let texto = typeof valor === "string" ? valor : String(valor);
  // Espaço antes do sinal também conta: " =HYPERLINK(...)" vira fórmula em parte
  // das planilhas (auditoria de 13/11/2026).
  if (typeof valor === "string" && /^[\t\r]|^\s*[=+\-@]/.test(texto)) texto = `'${texto}`;
  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function montarCsv(colunas: string[], linhas: unknown[][]): string {
  const todas = [colunas, ...linhas];
  return BOM + todas.map((l) => l.map(celulaCsv).join(SEPARADOR)).join("\r\n") + "\r\n";
}

/** dd/mm/aaaa em UTC (as datas do produto são guardadas à meia-noite UTC). */
export function diaPtBr(valor: Date | string | null | undefined): string {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Nome de arquivo seguro, com a data de hoje: `iniciativas-2026-11-09.csv`. */
export function nomeDoArquivoCsv(base: string, hoje: Date = new Date()): string {
  const seguro = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();
  return `${seguro}-${hoje.toISOString().slice(0, 10)}.csv`;
}
