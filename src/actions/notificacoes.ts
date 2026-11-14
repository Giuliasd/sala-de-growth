"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { listarNotificacoes, type AvisoDaLista } from "@/lib/notificacoes-db";
import { ehTipoDeAviso } from "@/lib/notificacoes";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type ActionResponse<T = null> = { success: true; data: T } | { success: false; error: string };

/**
 * Notificações da PRÓPRIA pessoa: toda action aqui filtra por `destinatarioId`
 * da sessão. O id que chega do cliente nunca basta — sem o filtro, qualquer
 * logado marcaria como lido (ou leria) o aviso de outro.
 */

const idSchema = z.string().uuid("Notificação inválida.");

/** Próxima página (mais antigos), a partir do cursor devolvido pela anterior. */
export async function carregarMaisNotificacoes(
  antesDe: string
): Promise<ActionResponse<{ avisos: AvisoDaLista[]; proximo: string | null }>> {
  try {
    const eu = await getCurrentMember();
    const cursor = z.string().datetime().parse(antesDe);
    return { success: true, data: await listarNotificacoes(eu.id, new Date(cursor)) };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: "Página inválida." };
    console.error("carregarMaisNotificacoes error:", error);
    return { success: false, error: "Não foi possível carregar as notificações." };
  }
}

export async function marcarNotificacaoComoLida(id: string): Promise<ActionResponse> {
  try {
    const eu = await getCurrentMember();
    const v = idSchema.parse(id);
    await prisma.notificacao.updateMany({
      where: { id: v, destinatarioId: eu.id, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    console.error("marcarNotificacaoComoLida error:", error);
    return { success: false, error: "Não foi possível marcar como lida." };
  }
}

/**
 * Devolve um aviso já lido ao estado "não lido": ele volta a contar no sino e
 * a ficar destacado na lista — um lembrete para a pessoa voltar a ele depois.
 */
export async function marcarNotificacaoComoNaoLida(id: string): Promise<ActionResponse> {
  try {
    const eu = await getCurrentMember();
    const v = idSchema.parse(id);
    await prisma.notificacao.updateMany({
      where: { id: v, destinatarioId: eu.id, lidaEm: { not: null } },
      data: { lidaEm: null },
    });
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    console.error("marcarNotificacaoComoNaoLida error:", error);
    return { success: false, error: "Não foi possível marcar como não lida." };
  }
}

export async function marcarTodasComoLidas(): Promise<ActionResponse> {
  try {
    const eu = await getCurrentMember();
    await prisma.notificacao.updateMany({
      where: { destinatarioId: eu.id, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    revalidatePath("/notificacoes");
    return { success: true, data: null };
  } catch (error) {
    console.error("marcarTodasComoLidas error:", error);
    return { success: false, error: "Não foi possível marcar como lidas." };
  }
}

const preferenciasSchema = z.array(z.string()).max(50, "Preferências inválidas.");

/**
 * Quais tipos de aviso a pessoa NÃO quer receber. Recebe a lista final dos
 * desligados (vazia = recebe tudo) e grava na conta da PRÓPRIA pessoa. O que
 * foi desligado deixa de ser criado daqui em diante; avisos já existentes
 * ficam como estão.
 */
export async function salvarPreferenciasDeNotificacao(silenciadas: string[]): Promise<ActionResponse> {
  try {
    const eu = await getCurrentMember();
    const lista = preferenciasSchema.parse(silenciadas);
    if (!lista.every(ehTipoDeAviso)) return { success: false, error: "Tipo de aviso inválido." };
    await prisma.teamMember.update({
      where: { id: eu.id },
      data: { notificacoesSilenciadas: [...new Set(lista)] },
    });
    revalidatePath("/perfil");
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    console.error("salvarPreferenciasDeNotificacao error:", error);
    return { success: false, error: "Não foi possível salvar as preferências." };
  }
}
