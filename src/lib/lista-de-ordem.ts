/**
 * Validação das listas de reordenação que vêm do cliente (arrastar checkpoints,
 * seções e links do playbook).
 *
 * Cada elemento vira um UPDATE dentro de uma transação. Sem esta checagem, um
 * request forjado mandava o mesmo id repetido dezenas de milhares de vezes (até
 * o limite de 1 MB do corpo da server action) e uma só chamada segurava uma
 * conexão do pool — que tem 10 por dyno — pelo tempo de todos esses UPDATEs
 * (achado da auditoria de segurança de 13/11/2026).
 *
 * Regra: sem repetidos, com teto, e todos os ids precisam ser do item. Assim o
 * trabalho fica limitado ao tamanho real do item.
 */

/** Bem acima do maior item real; serve só de teto para o `IN` da contagem. */
export const MAX_ITENS_NA_ORDEM = 500;

export const ERRO_LISTA_GRANDE = "Lista grande demais para reordenar.";
export const ERRO_LISTA_REPETIDA = "A lista de ordem tem itens repetidos.";

/**
 * Devolve a mensagem de erro, ou null se a lista é válida.
 * `contarDoItem` recebe os ids (já sem repetidos) e conta quantos são do item.
 */
export async function erroNaListaDeOrdem(
  ids: readonly string[],
  contarDoItem: (ids: string[]) => Promise<number>,
  naoEncontrado: string,
): Promise<string | null> {
  if (ids.length > MAX_ITENS_NA_ORDEM) return ERRO_LISTA_GRANDE;
  const unicos = [...new Set(ids)];
  if (unicos.length !== ids.length) return ERRO_LISTA_REPETIDA;
  if (unicos.length === 0) return null;
  const doItem = await contarDoItem(unicos);
  return doItem === unicos.length ? null : naoEncontrado;
}
