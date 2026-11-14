/**
 * E-mail é a chave de login (TeamMember.email e Invite.email são unique), e o
 * Google devolve sempre em minúsculas. Gravar como foi digitado fazia o convite
 * para "Maria@Empresa.com" nunca casar com o "maria@empresa.com" do login: o
 * acesso era negado e o convite ficava pendente para sempre.
 *
 * Toda escrita e toda busca por e-mail passa por aqui.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}
