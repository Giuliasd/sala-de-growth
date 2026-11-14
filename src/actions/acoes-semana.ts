"use server";

import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentMember, requireEditPermission } from "@/lib/session";
import { notificarAcaoAtribuida } from "@/lib/notificacoes-db";
import { MemberRole } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseISODateUTC, semanaDoMesUTC, startOfWeekMondayUTC } from "@/lib/date-utils";
import { ERRO_SEMANA_FECHADA, semanaFechadaParaEdicao } from "@/lib/registro-semanal-db";

/**
 * Ações da semana: o trabalho recorrente e miúdo que não é iniciativa nem
 * experimento — "TH", "1:1", "acompanhamento de estratégia", "subir alt text".
 *
 * No documento da weekly esse trabalho ocupa metade do que cada pessoa lista, e
 * até agora não tinha onde morar no produto: quem tinha a semana cheia de
 * acompanhamento aparecia como "sem itens".
 *
 * Sem OKR, sem roadmap, sem relatório: é o balde explícito do que não é projeto.
 * Se entrasse nos relatórios, o time passaria a discutir "TH" na review.
 */

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

/** Como a ação se repete. `null` = só naquela semana. */
export type Recorrencia = "semanal" | "mensal";

export type AcaoDaSemana = {
  id: string;
  title: string;
  responsavelId: string;
  recorrencia: Recorrencia | null;
  /** Só em "mensal": a semana do mês em que ela cai (1 a 5). */
  semanaDoMes: number | null;
  /** Concluída NESTA semana (a conclusão é por semana, ver AcaoSemana). */
  concluida: boolean;
  /**
   * Frente em que a ação aparece na Weekly. `null` = trabalho transversal
   * ("TH", "1:1"), que fica no balde "Também nesta semana".
   */
  frente: { id: string; name: string } | null;
};

/**
 * Fim de intervalo de uma ação recorrente. Recorrência aqui é um intervalo
 * aberto — assim a consulta da semana é a mesma para os dois casos (janela de
 * datas), sem filtro em Json.
 */
const SEM_FIM = new Date(Date.UTC(2099, 11, 31));

const weekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Semana inválida.");
const tituloSchema = z
  .string()
  .trim()
  .min(1, "O título da ação é obrigatório.")
  .max(200, "O título é muito longo.");

const criarSchema = z.object({
  weekOf: weekSchema,
  responsavelId: z.string().uuid("Responsável inválido."),
  title: tituloSchema,
  recorrencia: z.enum(["semanal", "mensal"]).nullable().optional(),
  frenteId: z.string().uuid("Frente inválida.").nullable().optional(),
});

/** O que fica gravado em `Acao.repeticao` (Json). */
type Repeticao = { tipo: "semanal" } | { tipo: "mensal"; semanaDoMes: number };

function lerRepeticao(valor: unknown): Repeticao | null {
  if (!valor || typeof valor !== "object") return null;
  const r = valor as { tipo?: unknown; semanaDoMes?: unknown };
  if (r.tipo === "semanal") return { tipo: "semanal" };
  if (r.tipo === "mensal" && typeof r.semanaDoMes === "number") {
    return { tipo: "mensal", semanaDoMes: r.semanaDoMes };
  }
  return null;
}

/** Ver `semanaCanonica` em weekly-comments: a chave é sempre a segunda-feira. */
function semanaCanonica(weekOf: string): Date {
  const parsed = parseISODateUTC(weekSchema.parse(weekOf));
  if (!parsed) throw new z.ZodError([]);
  return startOfWeekMondayUTC(parsed);
}

function domingoDa(weekStart: Date): Date {
  const d = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Quem pode mexer na ação de alguém: a própria pessoa, ou liderança. */
async function permitirPara(responsavelId: string) {
  const atual = await requireEditPermission();
  if (atual.role !== MemberRole.LIDERANCA && responsavelId !== atual.id) {
    throw new Error("Permissão negada. Você só edita as ações da sua própria semana.");
  }
  return atual;
}

/**
 * Carrega a ação que vai ser editada. O portão de sessão vem ANTES da busca:
 * ao contrário, quem nem está logado distinguia id existente de inexistente
 * pela mensagem. Ação excluída (deletedAt) não se edita — antes ela continuava
 * aceitando renomear, mudar frente e concluir.
 */
async function acaoParaEditar(id: string) {
  const atual = await requireEditPermission();
  const acao = await prisma.acao.findFirst({
    where: { id, deletedAt: null },
    select: { responsavelId: true, repeticao: true, dataInicio: true },
  });
  if (!acao) return null;
  if (atual.role !== MemberRole.LIDERANCA && acao.responsavelId !== atual.id) {
    throw new Error("Permissão negada. Você só edita as ações da sua própria semana.");
  }
  return acao;
}

export async function getAcoesDaSemana(
  weekOf: string,
  /** Só as ações desta pessoa (o card do dashboard). Sem isso, as do time todo. */
  responsavelId?: string
): Promise<AcaoDaSemana[]> {
  await getCurrentMember();
  const weekStart = semanaCanonica(weekOf);
  const weekEnd = domingoDa(weekStart);

  const acoes = await withDbRetry(() =>
    prisma.acao.findMany({
      where: {
        deletedAt: null,
        ...(responsavelId && { responsavelId }),
        // Mesma janela das ausências: a ação toca a semana quando os
        // intervalos se cruzam. Recorrente tem fim aberto, então cruza todas
        // as semanas a partir da que foi criada.
        dataInicio: { lte: weekEnd },
        dataFim: { gte: weekStart },
      },
      select: {
        id: true,
        title: true,
        responsavelId: true,
        repeticao: true,
        frente: { select: { id: true, name: true } },
        semanas: { where: { weekStart }, select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    })
  );

  // "Todo mês" cai na semana EQUIVALENTE do mês (a 2ª, a 3ª…), não a cada 30
  // dias. O intervalo aberto no banco traz a ação em todas as semanas, e o
  // recorte de qual semana é a dela acontece aqui: comparar índices em JS é
  // mais simples (e mais legível) que reproduzir a regra da quinta-feira em
  // SQL.
  const semanaPedida = semanaDoMesUTC(weekStart);

  return acoes
    .map((a) => {
      const rep = lerRepeticao(a.repeticao);
      return {
        id: a.id,
        title: a.title,
        responsavelId: a.responsavelId,
        recorrencia: rep?.tipo ?? null,
        semanaDoMes: rep?.tipo === "mensal" ? rep.semanaDoMes : null,
        concluida: a.semanas.length > 0,
        frente: a.frente,
      };
    })
    .filter((a) => a.recorrencia !== "mensal" || a.semanaDoMes === semanaPedida);
}

export async function criarAcaoDaSemana(data: {
  weekOf: string;
  responsavelId: string;
  title: string;
  recorrencia?: Recorrencia | null;
  /** Frente do grupo em que a ação foi criada; ausente = transversal. */
  frenteId?: string | null;
}): Promise<ActionResponse<{ id: string }>> {
  try {
    const v = criarSchema.parse(data);
    const autor = await permitirPara(v.responsavelId);

    const weekStart = semanaCanonica(v.weekOf);
    if (await semanaFechadaParaEdicao(weekStart)) {
      return { success: false, error: ERRO_SEMANA_FECHADA };
    }
    // Mensal guarda a semana do mês em que nasceu: é nela que vai reaparecer.
    const repeticao: Repeticao | undefined =
      v.recorrencia === "semanal"
        ? { tipo: "semanal" }
        : v.recorrencia === "mensal"
          ? { tipo: "mensal", semanaDoMes: semanaDoMesUTC(weekStart) }
          : undefined;

    const acao = await prisma.acao.create({
      data: {
        title: v.title,
        responsavelId: v.responsavelId,
        dataInicio: weekStart,
        // Recorrente: intervalo aberto. De uma vez: começa e acaba na semana.
        dataFim: repeticao ? SEM_FIM : domingoDa(weekStart),
        repeticao,
        frenteId: v.frenteId ?? null,
      },
      select: { id: true },
    });

    // Só avisa quando a ação é para OUTRA pessoa (a liderança cria na semana de alguém).
    await notificarAcaoAtribuida({ acaoId: acao.id, titulo: v.title, responsavelId: v.responsavelId, autorId: autor.id });
    revalidatePath("/rituais");
    revalidatePath("/dashboard");
    return { success: true, data: acao };
  } catch (error) {
    return falha(error, "Erro ao criar a ação.");
  }
}

/**
 * Muda a frequência de uma ação que já existe.
 *
 * `null` para de repetir a partir desta semana (mesmo efeito da lixeira numa
 * recorrente): o intervalo fecha no domingo, e as semanas passadas continuam
 * como estavam.
 *
 * Em "mensal", a âncora é a semana em que a frequência foi definida — é o que
 * "todo mês nesta semana" quer dizer. Definir na semana 3 faz a ação reaparecer
 * na semana 3 de cada mês, mesmo que ela tenha nascido na semana 2.
 */
export async function definirRecorrenciaDaAcao(data: {
  id: string;
  weekOf: string;
  recorrencia: Recorrencia | null;
}): Promise<ActionResponse<null>> {
  try {
    const acao = await acaoParaEditar(data.id);
    if (!acao) return { success: false, error: "Ação não encontrada." };

    const weekStart = semanaCanonica(data.weekOf);
    if (await semanaFechadaParaEdicao(weekStart)) {
      return { success: false, error: ERRO_SEMANA_FECHADA };
    }
    const repeticao: Repeticao | null =
      data.recorrencia === "semanal"
        ? { tipo: "semanal" }
        : data.recorrencia === "mensal"
          ? { tipo: "mensal", semanaDoMes: semanaDoMesUTC(weekStart) }
          : null;

    await prisma.acao.update({
      where: { id: data.id },
      data: {
        // Prisma exige o sentinela para gravar NULL em coluna Json.
        repeticao: repeticao ?? Prisma.DbNull,
        dataFim: repeticao ? SEM_FIM : domingoDa(weekStart),
      },
    });

    revalidatePath("/rituais");
    revalidatePath("/dashboard");
    return { success: true, data: null };
  } catch (error) {
    return falha(error, "Erro ao mudar a frequência da ação.");
  }
}

/**
 * Move a ação de frente — ou a tira de todas (`null`), devolvendo-a ao balde
 * transversal.
 *
 * Existe separado da criação porque a frente muda de opinião com o tempo: a
 * mesma regra que vale para a frequência, editável depois de criada.
 */
export async function definirFrenteDaAcao(data: {
  id: string;
  frenteId: string | null;
}): Promise<ActionResponse<null>> {
  try {
    const acao = await acaoParaEditar(data.id);
    if (!acao) return { success: false, error: "Ação não encontrada." };

    if (data.frenteId) {
      // Frente inexistente daria erro de FK cru; e frente arquivada não deve
      // receber trabalho novo.
      const frente = await prisma.frente.findFirst({
        where: { id: data.frenteId, isActive: true },
        select: { id: true },
      });
      if (!frente) return { success: false, error: "Frente não encontrada." };
    }

    await prisma.acao.update({
      where: { id: data.id },
      data: { frenteId: data.frenteId },
    });

    revalidatePath("/rituais");
    revalidatePath("/dashboard");
    return { success: true, data: null };
  } catch (error) {
    return falha(error, "Erro ao mudar a frente da ação.");
  }
}

export async function renomearAcao(data: {
  id: string;
  title: string;
}): Promise<ActionResponse<null>> {
  try {
    const title = tituloSchema.parse(data.title);
    const acao = await acaoParaEditar(data.id);
    if (!acao) return { success: false, error: "Ação não encontrada." };

    await prisma.acao.update({ where: { id: data.id }, data: { title } });
    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    return falha(error, "Erro ao renomear a ação.");
  }
}

/** Conclui ou desconclui a ação NESTA semana (nunca nas outras). */
export async function alternarAcaoNaSemana(data: {
  id: string;
  weekOf: string;
}): Promise<ActionResponse<{ concluida: boolean }>> {
  try {
    const acao = await acaoParaEditar(data.id);
    if (!acao) return { success: false, error: "Ação não encontrada." };

    const weekStart = semanaCanonica(data.weekOf);
    if (await semanaFechadaParaEdicao(weekStart)) {
      return { success: false, error: ERRO_SEMANA_FECHADA };
    }
    const existente = await prisma.acaoSemana.findUnique({
      where: { acaoId_weekStart: { acaoId: data.id, weekStart } },
      select: { id: true },
    });

    if (existente) {
      await prisma.acaoSemana.delete({ where: { id: existente.id } });
      revalidatePath("/rituais");
      return { success: true, data: { concluida: false } };
    }

    await prisma.acaoSemana.create({ data: { acaoId: data.id, weekStart } });
    revalidatePath("/rituais");
    return { success: true, data: { concluida: true } };
  } catch (error) {
    return falha(error, "Erro ao concluir a ação.");
  }
}

/**
 * Tira a ação das semanas SEGUINTES.
 *
 * Recorrente para de repetir e continua nesta semana (o intervalo passa a
 * terminar no domingo, e a repetição sai): ela vira uma ação de uma vez, aqui.
 * As semanas passadas seguem mostrando o que foi combinado nelas.
 *
 * Antes isso dependia de quando a ação tinha nascido: criada NESTA semana, ela
 * era removida por completo — e o diálogo prometia "para de aparecer desta
 * semana em diante" enquanto ela sumia da semana corrente. Agora "parar de
 * repetir" só mexe no futuro, como está escrito.
 *
 * Ação de uma vez não tem repetição a parar: essa é removida.
 */
export async function encerrarAcao(data: {
  id: string;
  weekOf: string;
}): Promise<ActionResponse<null>> {
  try {
    const acao = await acaoParaEditar(data.id);
    if (!acao) return { success: false, error: "Ação não encontrada." };

    const weekStart = semanaCanonica(data.weekOf);
    if (await semanaFechadaParaEdicao(weekStart)) {
      return { success: false, error: ERRO_SEMANA_FECHADA };
    }
    const recorrente = acao.repeticao !== null;

    if (recorrente) {
      await prisma.acao.update({
        where: { id: data.id },
        data: { dataFim: domingoDa(weekStart), repeticao: Prisma.DbNull },
      });
    } else {
      await prisma.acao.update({ where: { id: data.id }, data: { deletedAt: new Date() } });
    }

    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    return falha(error, "Erro ao remover a ação.");
  }
}

function falha(error: unknown, generica: string): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (error instanceof Error && error.message.includes("Permissão negada")) {
    return { success: false, error: error.message };
  }
  console.error(generica, error);
  return { success: false, error: generica };
}
