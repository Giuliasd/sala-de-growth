import { prisma, withDbRetry } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { lerWeeklyActivity, type WeeklyItem } from "@/lib/weekly-activity-query";
import {
  janelaDoRitual,
  semanaDoRitualAtual,
  toISODateUTC,
  type JanelaDoRitual,
  type VigenciaDoRitual,
} from "@/lib/date-utils";
import { lerVigenciasDoRitual } from "@/lib/horario-do-ritual-db";
import { HIDDEN_STATUS } from "@/lib/weekly-grouping";
import {
  desfechoNaSemana,
  nosDaSemana,
  origemNaSemana,
  type Desfecho,
  type RegistroDaSemana,
  type TagDoRegistro,
} from "@/lib/registro-semanal";

/**
 * Registro da semana — o acesso ao banco. As regras estão em
 * `lib/registro-semanal.ts`; o model, em `RegistroSemanal`.
 *
 * Três momentos escrevem no registro:
 *
 * 1. A Weekly da semana aberta é carregada: tudo o que ela mostra fica
 *    registrado (`registrarDaWeekly`).
 * 2. Antes de qualquer edição de checkpoint (`antesDeMexerNoItem`): o que o
 *    item tinha na semana é registrado ANTES da mudança, para nada sair da
 *    semana sem rastro — remarcar, reabrir, excluir.
 * 3. A semana venceu (sexta, 14:59, no padrão — o horário é configurável): a
 *    primeira leitura ou edição depois disso congela o desfecho
 *    (`fecharSemanasVencidas`). Como toda edição passa pelo passo 2, que fecha
 *    antes de mexer, o estado congelado é o do fechamento.
 *
 * Nada aqui é server action: não é para ser chamado do cliente.
 */

type Kind = "iniciativa" | "experimento";

/** Uma semana é "aberta" enquanto não passou o fechamento dela. */
function semanaAberta(agora: Date, vigencias: VigenciaDoRitual[]): JanelaDoRitual {
  return janelaDoRitual(semanaDoRitualAtual(agora, vigencias), vigencias);
}

// ─── Registrar ───────────────────────────────────────────────────────────────

/**
 * Registra o que a Weekly mostra na semana aberta. Cria o que falta e
 * atualiza a cópia do que mudou — a cópia acompanha o checkpoint até o
 * fechamento. Semana que não é a aberta não é tocada.
 */
export async function registrarDaWeekly(
  itens: { iniciativas: WeeklyItem[]; experimentos: WeeklyItem[] },
  weekStart: Date,
  agora: Date = new Date()
): Promise<void> {
  const janela = semanaAberta(agora, await lerVigenciasDoRitual());
  if (janela.weekStart.getTime() !== weekStart.getTime()) return;

  type Linha = Omit<Prisma.RegistroSemanalUncheckedCreateInput, "id">;
  const linhas: { kind: Kind; checkpointId: string; dados: Linha }[] = [];
  const juntar = (kind: Kind, item: WeeklyItem) => {
    // O que a Weekly esconde (cancelado, arquivado) não é da semana.
    if (HIDDEN_STATUS.has(item.status)) return;
    for (const no of nosDaSemana(item, item.checkpoints, janela)) {
      const cp = no.cp;
      linhas.push({
        kind,
        checkpointId: cp.id,
        dados: {
          weekStart: janela.weekStart,
          ...(kind === "iniciativa"
            ? { initiativeCheckpointId: cp.id, iniciativaId: item.id }
            : { experimentoCheckpointId: cp.id, experimentoId: item.id }),
          origem: origemNaSemana(
            agora,
            { createdAt: cp.createdAt ?? agora, updatedAt: cp.updatedAt ?? agora },
            janela
          ),
          nome: cp.name,
          caminho: no.caminho,
          categoria: (cp.categoria as Prisma.RegistroSemanalUncheckedCreateInput["categoria"]) ?? null,
          prazoAoEntrar: new Date(cp.dueDate),
          prazo: new Date(cp.dueDate),
          inicio: cp.startDate ? new Date(cp.startDate) : null,
          concluidoEm: cp.isCompleted ? (cp.completedAt ? new Date(cp.completedAt) : agora) : null,
          responsaveisIds: no.responsaveisIds,
          tags: cp.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
          itemNome: item.name,
          itemStatus: item.status,
          frenteId: item.frente.id,
          frenteNome: item.frente.name,
        },
      });
    }
  };
  for (const i of itens.iniciativas) juntar("iniciativa", i);
  for (const e of itens.experimentos) juntar("experimento", e);
  if (linhas.length === 0) return;

  const existentes = await prisma.registroSemanal.findMany({
    where: {
      weekStart: janela.weekStart,
      OR: [
        { initiativeCheckpointId: { in: linhas.filter((l) => l.kind === "iniciativa").map((l) => l.checkpointId) } },
        { experimentoCheckpointId: { in: linhas.filter((l) => l.kind === "experimento").map((l) => l.checkpointId) } },
      ],
    },
    select: {
      id: true, initiativeCheckpointId: true, experimentoCheckpointId: true, desfecho: true,
      nome: true, caminho: true, prazo: true, inicio: true, concluidoEm: true, responsaveisIds: true,
      itemNome: true, itemStatus: true, frenteNome: true, tags: true,
    },
  });
  const porCheckpoint = new Map(
    existentes.map((e) => [(e.initiativeCheckpointId ?? e.experimentoCheckpointId)!, e])
  );

  const criar: Linha[] = [];
  const atualizar: { id: string; dados: Prisma.RegistroSemanalUncheckedUpdateInput }[] = [];
  for (const l of linhas) {
    const e = porCheckpoint.get(l.checkpointId);
    if (!e) {
      criar.push(l.dados);
      continue;
    }
    if (e.desfecho) continue; // congelado: a foto não muda
    const d = l.dados;
    const mudou =
      e.nome !== d.nome ||
      e.caminho !== d.caminho ||
      e.prazo.getTime() !== (d.prazo as Date).getTime() ||
      (e.inicio?.getTime() ?? null) !== ((d.inicio as Date | null)?.getTime() ?? null) ||
      (e.concluidoEm === null) !== (d.concluidoEm === null) ||
      e.responsaveisIds.join() !== (d.responsaveisIds as string[]).join() ||
      e.itemNome !== d.itemNome ||
      e.itemStatus !== d.itemStatus ||
      e.frenteNome !== d.frenteNome ||
      JSON.stringify(e.tags) !== JSON.stringify(d.tags);
    if (mudou) {
      atualizar.push({
        id: e.id,
        dados: {
          nome: d.nome, caminho: d.caminho, categoria: d.categoria, prazo: d.prazo, inicio: d.inicio,
          concluidoEm: d.concluidoEm, responsaveisIds: d.responsaveisIds as string[],
          itemNome: d.itemNome, itemStatus: d.itemStatus, frenteId: d.frenteId, frenteNome: d.frenteNome,
          tags: d.tags,
        },
      });
    }
  }
  if (criar.length > 0) {
    // skipDuplicates: duas abas carregando a Weekly ao mesmo tempo.
    await prisma.registroSemanal.createMany({ data: criar, skipDuplicates: true });
  }
  if (atualizar.length > 0) {
    await prisma.$transaction(
      atualizar.map((a) => prisma.registroSemanal.update({ where: { id: a.id }, data: a.dados }))
    );
  }
}

/**
 * Chame ANTES de editar checkpoints de um item: fecha a semana vencida (se
 * ainda não foi fechada) e registra o que o item tem na semana aberta, no
 * estado de antes da edição.
 *
 * Falha aqui não pode impedir a edição — o registro é a memória da semana,
 * não um portão. Loga e segue.
 */
export async function antesDeMexerNoItem(kind: Kind, itemId: string): Promise<void> {
  try {
    const agora = new Date();
    // Fechar as semanas vencidas e ler a do item são independentes: o fechamento
    // congela linhas de semanas ANTERIORES (a partir do estado atual dos
    // checkpoints, que esta função não altera), e o snapshot só toca a semana
    // aberta. Em série eram duas leituras uma esperando a outra em toda edição.
    //
    // A leitura usa `lerWeeklyActivity` (sem `getCurrentMember`): o chamador já
    // passou pelo gate de permissão da action, e dentro de uma server action o
    // `cache()` do React não desduplica — era um SELECT de membro repetido.
    // As vigências vêm de cache (unstable_cache): não é ida ao banco.
    const janela = semanaAberta(agora, await lerVigenciasDoRitual());
    const [, semana] = await Promise.all([
      fecharSemanasVencidas(agora),
      lerWeeklyActivity(undefined, toISODateUTC(janela.weekStart), { kind, id: itemId }),
    ]);
    await registrarDaWeekly(semana, janela.weekStart, agora);
  } catch (error) {
    console.error("registro da semana (antes de mexer):", error);
  }
}

/**
 * Depois de excluir checkpoints de um item: o registro da semana aberta que
 * perdeu o checkpoint (a ligação virou NULL) ganha a data e quem excluiu. A
 * exclusão em cascata leva os subcheckpoints junto — eles caem aqui também.
 */
export async function marcarExcluidos(kind: Kind, itemId: string, memberId: string): Promise<void> {
  try {
    await prisma.registroSemanal.updateMany({
      where: {
        ...(kind === "iniciativa" ? { iniciativaId: itemId } : { experimentoId: itemId }),
        initiativeCheckpointId: null,
        experimentoCheckpointId: null,
        excluidoEm: null,
        desfecho: null,
      },
      data: { excluidoEm: new Date(), excluidoPorId: memberId },
    });
  } catch (error) {
    console.error("registro da semana (excluídos):", error);
  }
}

/**
 * Prazo mudou: conta a remarcação no registro da semana aberta. Só conta
 * quem já estava registrado — o checkpoint que ENTRA na semana por causa da
 * mudança não foi remarcado nela.
 */
export async function contarRemarcacoes(
  kind: Kind,
  mudancas: { id: string; antes: Date; depois: Date }[]
): Promise<void> {
  try {
    const ids = mudancas
      .filter((m) => new Date(m.antes).getTime() !== new Date(m.depois).getTime())
      .map((m) => m.id);
    if (ids.length === 0) return;
    await prisma.registroSemanal.updateMany({
      where: {
        weekStart: semanaAberta(new Date(), await lerVigenciasDoRitual()).weekStart,
        desfecho: null,
        ...(kind === "iniciativa" ? { initiativeCheckpointId: { in: ids } } : { experimentoCheckpointId: { in: ids } }),
      },
      data: { remarcacoes: { increment: 1 } },
    });
  } catch (error) {
    console.error("registro da semana (remarcações):", error);
  }
}

// ─── Fechar ──────────────────────────────────────────────────────────────────

const ESTADO_DO_CHECKPOINT = {
  name: true, startDate: true, dueDate: true, isCompleted: true, completedAt: true,
  tags: { select: { id: true, name: true, color: true }, orderBy: { order: "asc" } },
} as const;

/**
 * Congela as semanas que já fecharam e ainda não têm desfecho: cada registro
 * ganha como a semana terminou para ele e a cópia final do checkpoint.
 * Idempotente e barato quando não há o que fechar (uma consulta indexada).
 */
export async function fecharSemanasVencidas(agora: Date = new Date()): Promise<void> {
  const vigencias = await lerVigenciasDoRitual();
  const aberta = semanaAberta(agora, vigencias).weekStart;
  const pendentes = await withDbRetry(() =>
    prisma.registroSemanal.findMany({
      where: { desfecho: null, weekStart: { lt: aberta } },
      select: {
        id: true, weekStart: true, prazoAoEntrar: true, excluidoEm: true,
        initiativeCheckpoint: { select: ESTADO_DO_CHECKPOINT },
        experimentoCheckpoint: { select: ESTADO_DO_CHECKPOINT },
      },
    })
  );
  if (pendentes.length === 0) return;

  const ops = pendentes.map((r) => {
    const atual = r.initiativeCheckpoint ?? r.experimentoCheckpoint;
    const desfecho = desfechoNaSemana(atual, r, janelaDoRitual(r.weekStart, vigencias));
    return prisma.registroSemanal.update({
      where: { id: r.id },
      data: {
        desfecho,
        ...(atual && {
          nome: atual.name,
          tags: atual.tags,
          prazo: atual.dueDate,
          inicio: atual.startDate,
          concluidoEm: desfecho === "CONCLUIDO" ? (atual.completedAt ?? agora) : null,
        }),
      },
    });
  });
  // Em lotes: no essential-0, uma transação gigante segura conexão demais.
  for (let i = 0; i < ops.length; i += 50) {
    await prisma.$transaction(ops.slice(i, i + 50));
  }
}

// ─── Ler ─────────────────────────────────────────────────────────────────────

/**
 * O registro de uma semana, pronto para a tela. Na semana aberta o desfecho é
 * calculado agora; na fechada, é o congelado. `verQuemExcluiu` é da
 * liderança — para os demais, o nome não sai do servidor.
 */
export async function lerRegistroDaSemana(
  weekStart: Date,
  { verQuemExcluiu }: { verQuemExcluiu: boolean }
): Promise<{ registros: RegistroDaSemana[]; fechada: boolean }> {
  const janela = janelaDoRitual(weekStart, await lerVigenciasDoRitual());
  const linhas = await withDbRetry(() =>
    prisma.registroSemanal.findMany({
      where: { weekStart: janela.weekStart },
      include: {
        initiativeCheckpoint: { select: ESTADO_DO_CHECKPOINT },
        experimentoCheckpoint: { select: ESTADO_DO_CHECKPOINT },
        excluidoPor: { select: { name: true } },
      },
      orderBy: { prazoAoEntrar: "asc" },
    })
  );
  if (linhas.length === 0) return { registros: [], fechada: false };

  // Remarcações somadas até esta semana: "2ª vez" conta as semanas anteriores.
  const somas = await withDbRetry(() =>
    prisma.registroSemanal.groupBy({
      by: ["initiativeCheckpointId", "experimentoCheckpointId"],
      where: {
        weekStart: { lte: janela.weekStart },
        OR: [
          { initiativeCheckpointId: { in: linhas.flatMap((l) => l.initiativeCheckpointId ?? []) } },
          { experimentoCheckpointId: { in: linhas.flatMap((l) => l.experimentoCheckpointId ?? []) } },
        ],
      },
      _sum: { remarcacoes: true },
    })
  );
  const total = new Map(
    somas.map((s) => [(s.initiativeCheckpointId ?? s.experimentoCheckpointId)!, s._sum.remarcacoes ?? 0])
  );

  const fechada = linhas.every((l) => l.desfecho !== null);
  const registros = linhas.map((l): RegistroDaSemana => {
    const checkpointId = l.initiativeCheckpointId ?? l.experimentoCheckpointId;
    const atual = l.initiativeCheckpoint ?? l.experimentoCheckpoint;
    return {
      id: l.id,
      checkpointId,
      kind: l.iniciativaId ? "iniciativa" : "experimento",
      itemId: (l.iniciativaId ?? l.experimentoId)!,
      origem: l.origem,
      registradoEm: l.registradoEm,
      nome: l.nome,
      caminho: l.caminho,
      categoria: l.categoria,
      prazoAoEntrar: l.prazoAoEntrar,
      prazo: l.prazo,
      inicio: l.inicio,
      concluidoEm: l.concluidoEm,
      responsaveisIds: l.responsaveisIds,
      tags: Array.isArray(l.tags) ? (l.tags as TagDoRegistro[]) : [],
      itemNome: l.itemNome,
      itemStatus: l.itemStatus,
      frente: { id: l.frenteId, name: l.frenteNome },
      remarcacoes: checkpointId ? (total.get(checkpointId) ?? l.remarcacoes) : l.remarcacoes,
      excluidoEm: l.excluidoEm,
      excluidoPor: verQuemExcluiu ? (l.excluidoPor?.name ?? null) : null,
      desfecho: (l.desfecho as Desfecho | null) ?? desfechoNaSemana(atual, l, janela),
      atual: l.desfecho ? null : atual,
    };
  });
  return { registros, fechada };
}

/**
 * A semana já fechou para edição? Mesma regra da tela de Rituais
 * (`semanaFechada = registros.length > 0 && fechada`): passou do fechamento e
 * a semana tem registro. Semana sem registro (anterior ao registro existir, ou
 * vazia) segue editável, como na tela.
 *
 * Usa o horário, e não o `desfecho` gravado, porque o congelamento é preguiçoso
 * (acontece na primeira leitura depois da sexta): entre o fechamento e essa
 * leitura, a semana já é fechada mesmo sem a foto pronta.
 *
 * As actions do aviso, do foco e das ações da semana checam isto no servidor.
 * Antes a trava existia só na interface (`podeEditar`), e uma chamada direta
 * reescrevia o aviso de uma semana já fechada para o time todo (achado da
 * auditoria de segurança de 13/11/2026).
 */
export async function semanaFechadaParaEdicao(weekStart: Date, agora: Date = new Date()): Promise<boolean> {
  const janela = janelaDoRitual(weekStart, await lerVigenciasDoRitual());
  if (agora.getTime() < janela.fecha.getTime()) return false;
  const registros = await withDbRetry(() =>
    prisma.registroSemanal.count({ where: { weekStart: janela.weekStart } })
  );
  return registros > 0;
}

export const ERRO_SEMANA_FECHADA = "Esta semana já fechou: o que ficou registrado nela não muda mais.";
