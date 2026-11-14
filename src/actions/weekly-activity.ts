"use server";

import { getCurrentMember } from "@/lib/session";
import {
  lerWeeklyActivity,
  type WeeklyActivityResult,
} from "@/lib/weekly-activity-query";

// Os tipos continuam sendo importados daqui por toda a base.
export type {
  CheckpointItem,
  WeeklyItem,
  WeeklyActivityResult,
} from "@/lib/weekly-activity-query";

export async function getWeeklyActivity(
  memberId?: string,
  /** Segunda-feira da semana desejada, "yyyy-mm-dd". Sem isso, a semana de hoje. */
  weekOf?: string,
  /**
   * Só um item — o registro da semana usa para anotar o que um item tem na
   * semana antes de uma edição nele, sem buscar a semana inteira.
   */
  soItem?: { kind: "iniciativa" | "experimento"; id: string }
): Promise<WeeklyActivityResult> {
  // Gate de sessão: este export é chamável pelo cliente.
  await getCurrentMember();
  return lerWeeklyActivity(memberId, weekOf, soItem);
}
