/**
 * Autocomplete de "@" nos comentários — as regras, sem tela.
 *
 * O comentário guarda o nome inteiro ("@Ana Paula"), e é esse texto que o
 * servidor lê para saber quem avisar (`extrairMencoes` em `lib/notificacoes.ts`).
 * Por isso o autocomplete insere o nome COMPLETO, seguido de um espaço.
 */

export type MencaoEmCurso = {
  /** Posição do "@" no texto. */
  inicio: number;
  /** O que foi digitado depois do "@" até o cursor. */
  consulta: string;
};

/** Mais longo que isto não é mais um nome sendo digitado. */
const MAX_CONSULTA = 40;

/**
 * Há um "@..." sendo digitado logo antes do cursor? O "@" precisa estar no
 * começo do texto ou depois de espaço/quebra de linha — colado numa palavra
 * ("ana@dominio.com") é e-mail e não abre sugestão.
 */
export function detectarMencaoEmCurso(texto: string, cursor: number): MencaoEmCurso | null {
  const ate = texto.slice(0, cursor);
  const pos = ate.lastIndexOf("@");
  if (pos === -1) return null;
  if (pos > 0 && !/\s/.test(ate[pos - 1])) return null;
  const consulta = ate.slice(pos + 1);
  if (/[\n@]/.test(consulta) || consulta.length > MAX_CONSULTA) return null;
  return { inicio: pos, consulta };
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Quem sugerir para o que foi digitado: nomes que COMEÇAM com a consulta vêm
 * primeiro, depois os que têm alguma palavra começando com ela ("silva" acha
 * "José Silva"). Sem acento, sem caixa. Consulta vazia lista os primeiros.
 */
export function sugerirMembros<T extends { name: string }>(
  consulta: string,
  membros: readonly T[],
  limite = 6
): T[] {
  const q = normalizar(consulta).trimStart();
  const pontuados: { m: T; nome: string; peso: number }[] = [];
  for (const m of membros) {
    const nome = normalizar(m.name);
    if (q === "") pontuados.push({ m, nome, peso: 0 });
    else if (nome.startsWith(q)) pontuados.push({ m, nome, peso: 0 });
    else if (nome.split(/\s+/).some((p) => p.startsWith(q))) pontuados.push({ m, nome, peso: 1 });
  }
  return pontuados
    .sort((a, b) => a.peso - b.peso || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite)
    .map((p) => p.m);
}

/** Troca o "@consulta" pelo nome completo e devolve onde fica o cursor. */
export function aplicarMencao(
  texto: string,
  mencao: MencaoEmCurso,
  cursor: number,
  nome: string
): { texto: string; cursor: number } {
  const inserido = `@${nome} `;
  return {
    texto: texto.slice(0, mencao.inicio) + inserido + texto.slice(cursor),
    cursor: mencao.inicio + inserido.length,
  };
}
