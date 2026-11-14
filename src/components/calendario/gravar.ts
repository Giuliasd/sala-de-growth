import {
  updateIniciativaAnalysisDate,
  updateIniciativaLaunchDate,
} from "@/actions/iniciativas";
import {
  updateExperimentoAnalysisDate,
  updateExperimentoLaunchDate,
} from "@/actions/experimentos";
import { bulkUpdateCheckpoints, createCheckpoint } from "@/actions/initiative-checkpoints";
import {
  bulkUpdateExperimentoCheckpoints,
  createExperimentoCheckpoint,
} from "@/actions/experimento-checkpoints";
import { diasEntre, somarDias, type EventoDoCalendario, type TipoDeEvento, type TipoDeItem } from "@/lib/calendario";

/**
 * Gravações do calendário de datas-chave. Nenhuma gravação nova no banco: cada
 * gesto vira a action que a tela do item já usa, com as permissões, o
 * histórico e o registro da Weekly dela (`antesDeMexerNoItem`,
 * `contarRemarcacoes`).
 *
 * Mover checkpoint usa o `bulkUpdate…`, que só mexe nos campos enviados — o
 * `update…` reescreveria o checkpoint inteiro (e zeraria o início).
 */
type Resultado = { success: true } | { success: false; error: string };

function resultado(res: { success: boolean; error?: string }, padrao: string): Resultado {
  return res.success ? { success: true } : { success: false, error: res.error || padrao };
}

/** Grava o lançamento ou a análise do item em `data` (substitui a anterior). */
async function gravarDataDoItem(
  tipo: "LANCAMENTO" | "ANALISE",
  item: { id: string; tipo: TipoDeItem },
  data: string
): Promise<Resultado> {
  const fn =
    tipo === "LANCAMENTO"
      ? item.tipo === "iniciativa"
        ? updateIniciativaLaunchDate
        : updateExperimentoLaunchDate
      : item.tipo === "iniciativa"
        ? updateIniciativaAnalysisDate
        : updateExperimentoAnalysisDate;
  return resultado(await fn(item.id, data), "Não foi possível mudar a data.");
}

/** Leva o evento para `novaData` (`YYYY-MM-DD`). */
export async function moverData(e: EventoDoCalendario, novaData: string): Promise<Resultado> {
  if (e.tipo === "LANCAMENTO" || e.tipo === "ANALISE") return gravarDataDoItem(e.tipo, e.item, novaData);
  if (!e.checkpointId) return { success: false, error: "Checkpoint não encontrado." };
  // Checkpoint com início anda inteiro: as duas datas deslocam o mesmo tanto.
  const patch = {
    ids: [e.checkpointId],
    dueDate: novaData,
    ...(e.inicio && { startDate: somarDias(e.inicio, diasEntre(e.data, novaData)) }),
  };
  const fn = e.item.tipo === "iniciativa" ? bulkUpdateCheckpoints : bulkUpdateExperimentoCheckpoints;
  return resultado(await fn(patch), "Não foi possível mudar a data.");
}

/**
 * Cria a data num dia: comunicação/marco viram checkpoint novo (no nível
 * principal do item); lançamento/análise gravam a data do item — se ele já
 * tinha uma, ela é substituída (a tela avisa antes).
 */
export async function criarData(dados: {
  tipo: TipoDeEvento;
  item: { id: string; tipo: TipoDeItem };
  data: string;
  nome: string;
  memberIds: string[];
}): Promise<Resultado> {
  const { tipo, item, data } = dados;
  if (tipo === "LANCAMENTO" || tipo === "ANALISE") return gravarDataDoItem(tipo, item, data);
  const base = { name: dados.nome.trim(), dueDate: data, categoria: tipo, memberIds: dados.memberIds };
  const res =
    item.tipo === "iniciativa"
      ? await createCheckpoint({ initiativeId: item.id, ...base })
      : await createExperimentoCheckpoint({ experimentoId: item.id, ...base });
  return resultado(res, "Não foi possível criar a data.");
}
