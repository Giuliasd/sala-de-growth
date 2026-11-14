"use server";

import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentMember, requireEditPermission } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseISODateUTC, startOfWeekMondayUTC } from "@/lib/date-utils";
import { ERRO_SEMANA_FECHADA, semanaFechadaParaEdicao } from "@/lib/registro-semanal-db";

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

export type Aviso = {
  content: string;
  /** Semana de onde o aviso veio — diferente da exibida quando é herdado. */
  weekStart: Date;
  /** true quando o aviso é de uma semana anterior e segue valendo. */
  herdado: boolean;
};

const weekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Semana inválida.");
const conteudoSchema = z.string().trim().max(2000, "O aviso é muito longo.");

/** Quantas semanas para trás um aviso continua valendo se ninguém mexer. */
const SEMANAS_DE_HERANCA = 8;

function semanaCanonica(weekOf: string): Date {
  const parsed = parseISODateUTC(weekSchema.parse(weekOf));
  if (!parsed) throw new z.ZodError([]);
  return startOfWeekMondayUTC(parsed);
}

/**
 * O aviso da semana, ou o da semana anterior que ainda vale.
 *
 * Na prática um aviso costuma valer duas ou três semanas ("BF começa dia 20"),
 * e reescrever toda segunda é o atrito que faz o campo cair em desuso. Então o
 * aviso é herdado até alguém mexer.
 *
 * Linha com conteúdo VAZIO na semana pedida corta a herança: é o "apagar". Sem
 * isso, apagar o aviso faria o da semana anterior voltar.
 */
export async function getAvisoDaSemana(weekOf: string): Promise<Aviso | null> {
  await getCurrentMember();
  const weekStart = semanaCanonica(weekOf);
  const limite = new Date(weekStart.getTime() - SEMANAS_DE_HERANCA * 7 * 24 * 60 * 60 * 1000);

  const linhas = await withDbRetry(() =>
    prisma.weeklyAviso.findMany({
      where: { weekStart: { lte: weekStart, gte: limite } },
      orderBy: { weekStart: "desc" },
      take: 1,
      select: { weekStart: true, content: true },
    })
  );

  const linha = linhas[0];
  if (!linha || linha.content.trim() === "") return null;

  return {
    content: linha.content,
    weekStart: linha.weekStart,
    herdado: linha.weekStart.getTime() !== weekStart.getTime(),
  };
}

/**
 * Escreve (ou apaga, com conteúdo vazio) o aviso da semana exibida.
 *
 * Qualquer pessoa do time edita — é recado do time, não comunicado da
 * liderança. Visitante não escreve, como no resto do produto.
 *
 * Editar um aviso herdado cria a linha da semana atual: o texto da semana
 * anterior fica como estava, e o histórico não é reescrito.
 */
export async function salvarAvisoDaSemana(data: {
  weekOf: string;
  content: string;
}): Promise<ActionResponse<null>> {
  try {
    const membro = await requireEditPermission();
    const weekStart = semanaCanonica(data.weekOf);
    const content = conteudoSchema.parse(data.content);
    if (await semanaFechadaParaEdicao(weekStart)) {
      return { success: false, error: ERRO_SEMANA_FECHADA };
    }

    await prisma.weeklyAviso.upsert({
      where: { weekStart },
      create: { weekStart, content, updatedById: membro.id },
      update: { content, updatedById: membro.id },
    });

    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message ?? "Dados inválidos." };
    }
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    console.error("Erro ao salvar o aviso da semana:", error);
    return { success: false, error: "Erro ao salvar o aviso." };
  }
}
