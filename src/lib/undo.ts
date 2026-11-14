/**
 * Pilha de "desfazer" das edições do app (Ctrl+Z).
 *
 * A ideia que faz isso caber em pouco código: **desfazer uma edição é aplicar a
 * mesma edição com o valor anterior**. Nenhuma action nova, nenhum estado
 * anterior guardado no servidor — quem registra passa a própria função de salvar
 * já apontada para o valor de antes.
 *
 * Só edição entra aqui. Exclusão continua protegida pelo diálogo de confirmação
 * antes do fato: checkpoint é apagado de verdade (com os filhos em cascata), e
 * recriar registro com outro id devolveria uma cópia, não a coisa desfeita.
 *
 * Estado de módulo, como o `toast`: vive por carregamento de página e não
 * atravessa recarregamento — desfazer é um arrependimento imediato, não
 * histórico.
 */

export type EntradaUndo = {
  /** O que aparece no toast: "prazo de Revisar copy", "status", "responsáveis". */
  rotulo: string;
  /** Reaplica o valor anterior. Pode ser assíncrona. */
  reverter: () => void | Promise<void>;
};

/** Teto da pilha: Ctrl+Z repetido volta no passo, mas isso não é histórico. */
const LIMITE = 20;

const pilha: EntradaUndo[] = [];

// Enquanto uma reversão está em curso, nada é registrado. Sem isso, desfazer
// uma troca de status registraria a própria reversão e o Ctrl+Z seguinte
// devolveria o valor novo — um ping-pong em vez de uma pilha.
let revertendo = false;

export function registrarEdicao(rotulo: string, reverter: EntradaUndo["reverter"]): void {
  if (revertendo) return;
  pilha.push({ rotulo, reverter });
  if (pilha.length > LIMITE) pilha.shift();
}

export function temUndo(): boolean {
  return pilha.length > 0;
}

/**
 * Desfaz a última edição registrada e devolve o rótulo dela (ou null se a pilha
 * estava vazia). Se a reversão falhar, a entrada NÃO volta para a pilha: quem
 * salva mostra o próprio erro, e uma entrada que já falhou tende a falhar de
 * novo — deixá-la ali só faria o próximo Ctrl+Z repetir o erro.
 */
export async function desfazerUltima(): Promise<string | null> {
  const entrada = pilha.pop();
  if (!entrada) return null;

  revertendo = true;
  try {
    await entrada.reverter();
    return entrada.rotulo;
  } finally {
    revertendo = false;
  }
}
