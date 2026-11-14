"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLeadershipPermission } from "@/lib/session";
import {
  formatMinuto,
  horariosDaSemana,
  horariosValidos,
  janelaDoRitual,
  nomeDoDia,
  semanaDoRitualAtual,
  toISODateUTC,
  type HorariosDoRitual,
} from "@/lib/date-utils";
import { lerVigenciasDoRitual, TAG_HORARIO_DO_RITUAL } from "@/lib/horario-do-ritual-db";
import { fecharSemanasVencidas } from "@/lib/registro-semanal-db";

const dia = z.number().int().min(1).max(7);
const minuto = z.number().int().min(0).max(24 * 60 - 1);

const horariosSchema = z.object({
  fechamentoDia: dia,
  fechamentoMinuto: minuto,
  planejamentoDia: dia,
  planejamentoMinuto: minuto,
});

type SalvarResponse =
  | { success: true }
  | { success: false; error: string; precisaConfirmar?: boolean };

/** Os horários da semana do ritual em andamento — o que a tela de Configurações edita. */
export async function getHorariosDoRitual(): Promise<{
  horarios: HorariosDoRitual;
  /** Segunda da semana em andamento, "yyyy-mm-dd": a mudança vale dela em diante. */
  semanaAtual: string;
}> {
  await requireLeadershipPermission();
  const vigencias = await lerVigenciasDoRitual();
  const semana = semanaDoRitualAtual(new Date(), vigencias);
  return { horarios: horariosDaSemana(semana, vigencias), semanaAtual: toISODateUTC(semana) };
}

/**
 * Grava os horários a partir da semana em andamento. Semanas que já fecharam
 * ficam com os horários de quando fecharam — elas são fechadas aqui, com as
 * regras antigas, antes de a mudança valer.
 *
 * Se o novo fechamento da semana em andamento já passou, ela fecha na hora e
 * não reabre: pede `confirmarFechamento`. O que aconteceu entre o novo
 * fechamento e agora passa a ser da semana seguinte (que abre no fechamento).
 */
export async function salvarHorariosDoRitual(
  data: z.infer<typeof horariosSchema>,
  { confirmarFechamento = false }: { confirmarFechamento?: boolean } = {}
): Promise<SalvarResponse> {
  try {
    await requireLeadershipPermission();
    const horarios = horariosSchema.parse(data);
    if (!horariosValidos(horarios)) {
      return { success: false, error: "O fim do planejamento precisa ser antes do fechamento da semana." };
    }

    const agora = new Date();
    await fecharSemanasVencidas(agora);
    const vigencias = await lerVigenciasDoRitual();
    const semana = semanaDoRitualAtual(agora, vigencias);

    const novas = [
      ...vigencias.filter((v) => v.vigenteDesde.getTime() !== semana.getTime()),
      { vigenteDesde: semana, ...horarios },
    ];
    if (janelaDoRitual(semana, novas).fecha.getTime() <= agora.getTime() && !confirmarFechamento) {
      return {
        success: false,
        precisaConfirmar: true,
        error: `Com esse horário, a semana em andamento já fechou (${nomeDoDia(horarios.fechamentoDia)} às ${formatMinuto(horarios.fechamentoMinuto)}). Ela vira foto agora e não reabre: o que foi concluído, remarcado ou excluído depois desse horário passa a contar para a semana seguinte.`,
      };
    }

    await prisma.horarioDoRitual.upsert({
      where: { vigenteDesde: semana },
      create: { vigenteDesde: semana, ...horarios },
      update: horarios,
    });

    updateTag(TAG_HORARIO_DO_RITUAL);
    revalidatePath("/rituais");
    revalidatePath("/configuracoes/rituais");
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Permissão negada")) {
      return { success: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { success: false, error: "Dia ou horário inválido." };
    }
    console.error("salvar horários do ritual:", error);
    return { success: false, error: "Erro inesperado ao salvar os horários." };
  }
}
