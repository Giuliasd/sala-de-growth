import { prisma } from "@/lib/prisma";

/**
 * Nome de membro único entre os ativos.
 *
 * Menção, autor de comentário e avatar mostram só o nome — não há e-mail nem
 * cargo do lado para desempatar. Dois membros com o mesmo nome ficam idênticos
 * na tela, e "@Nome" notifica só um deles (`extrairMencoes` reserva o trecho
 * para o primeiro que casar). Antes, qualquer membro (VISITANTE incluso) podia
 * pôr no próprio perfil o nome de um colega e se passar por ele (achado da
 * auditoria de segurança de 13/11/2026).
 *
 * A comparação usa a mesma regra das menções: ignora acento, caixa e espaços
 * repetidos.
 */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mensagem única para as três telas que gravam nome. */
export const NOME_EM_USO = "Já existe um membro ativo com esse nome. Use um nome que diferencie vocês.";

/** true se outro membro ativo (que não `excetoId`) já usa esse nome. */
export async function nomeEmUso(nome: string, excetoId?: string): Promise<boolean> {
  const chave = chaveDoNome(nome);
  const ativos = await prisma.teamMember.findMany({
    where: { isActive: true, ...(excetoId ? { id: { not: excetoId } } : {}) },
    select: { name: true },
  });
  return ativos.some((m) => chaveDoNome(m.name) === chave);
}
