/**
 * Chamada de server action que nunca rejeita.
 *
 * As actions devolvem `{ success: false, error }` quando algo dá errado do lado
 * delas — mas a CHAMADA pode falhar antes disso: rede caiu, deploy no meio
 * ("Failed to find Server Action" numa aba antiga), servidor fora. Aí a promise
 * rejeita, o `setLoading(false)` que vinha depois do `await` nunca roda e o
 * botão fica em "Salvando…" para sempre, sem mensagem.
 *
 * Com isto, a falha de chamada vira uma resposta de erro comum, e o formulário
 * segue o caminho que já sabe seguir: destrava o botão e mostra o erro.
 *
 *   const res = await acaoSegura(updateIniciativa(id, dados));
 */

export const MENSAGEM_FALHA_DE_REDE =
  "Não foi possível falar com o servidor. Confira a conexão e tente de novo (se o app acabou de ser atualizado, recarregue a página).";

export type FalhaDeRede = { success: false; error: string };

export async function acaoSegura<T>(chamada: Promise<T>): Promise<T | FalhaDeRede> {
  try {
    return await chamada;
  } catch (error) {
    console.error("Falha ao chamar o servidor:", error);
    return { success: false, error: MENSAGEM_FALHA_DE_REDE };
  }
}
