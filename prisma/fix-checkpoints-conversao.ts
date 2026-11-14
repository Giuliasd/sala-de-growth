import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { copiarCheckpointsNaConversao, TIMEOUT_DA_CONVERSAO_MS } from '../src/lib/checkpoint-conversion';

/**
 * Correção pontual: até este fix, converter iniciativa ↔ experimento deixava os
 * checkpoints no item apagado (soft delete). Este script acha essas conversões
 * e copia os checkpoints para o item que nasceu delas, pelo mesmo caminho que a
 * conversão usa agora.
 *
 * A conversão não guardava ligação entre o item antigo e o novo, então o par é
 * reconhecido pelo rastro que ela deixa: mesmo nome, quarter e frente, e o novo
 * criado no mesmo instante em que o antigo foi apagado (±2 min). Só entra par
 * ÚNICO, com o novo ainda ativo e SEM checkpoints — o que também torna o
 * script idempotente: depois de copiar, o novo tem checkpoints e sai da lista.
 *
 * Sem argumento, só LISTA o que faria. Para aplicar:
 *   npx tsx prisma/fix-checkpoints-conversao.ts --aplicar
 */

const JANELA_MS = 2 * 60 * 1000;
const aplicar = process.argv.includes('--aplicar');

type Apagado = { id: string; name: string; quarterId: string; frenteId: string; deletedAt: Date | null; n: number };
type Candidato = { id: string; name: string; deletedAt: Date | null; createdAt: Date; n: number };

function noMesmoInstante(apagado: Apagado, c: Candidato) {
  return Math.abs(c.createdAt.getTime() - apagado.deletedAt!.getTime()) <= JANELA_MS;
}

async function main() {
  const [iniciativas, experimentos] = await Promise.all([
    prisma.iniciativa.findMany({
      where: { deletedAt: { not: null }, checkpoints: { some: {} } },
      select: {
        id: true, name: true, quarterId: true, frenteId: true, deletedAt: true,
        _count: { select: { checkpoints: true } },
      },
    }),
    prisma.experimento.findMany({
      where: { deletedAt: { not: null }, checkpoints: { some: {} } },
      select: {
        id: true, name: true, quarterId: true, frenteId: true, deletedAt: true,
        _count: { select: { checkpoints: true } },
      },
    }),
  ]);

  const casos = [
    ...iniciativas.map((i) => ({ de: 'iniciativa' as const, item: { ...i, n: i._count.checkpoints } })),
    ...experimentos.map((e) => ({ de: 'experimento' as const, item: { ...e, n: e._count.checkpoints } })),
  ];

  let copiados = 0;
  for (const { de, item } of casos) {
    const filtro = { name: item.name, quarterId: item.quarterId, frenteId: item.frenteId };
    const select = {
      id: true, name: true, deletedAt: true, createdAt: true,
      _count: { select: { checkpoints: true } },
    } as const;
    const brutos =
      de === 'iniciativa'
        ? await prisma.experimento.findMany({ where: filtro, select })
        : await prisma.iniciativa.findMany({ where: filtro, select });
    const candidatos = brutos
      .map((c) => ({ ...c, n: c._count.checkpoints }))
      .filter((c) => noMesmoInstante(item, c));

    const destino = de === 'iniciativa' ? 'experimento' : 'iniciativa';
    const rotulo = `${de} "${item.name}" (${item.n} checkpoint(s))`;

    if (candidatos.length === 0) continue; // apagado de verdade, não convertido
    if (candidatos.length > 1) {
      console.log(`⚠️  ${rotulo}: ${candidatos.length} ${destino}s possíveis — verificar à mão.`);
      continue;
    }
    const [alvo] = candidatos;
    if (alvo.deletedAt) {
      // Convertido de novo depois (ida e volta): o checkpoint teria de seguir a
      // cadeia até o item ativo. Raro — fica para olhar à mão.
      console.log(`⚠️  ${rotulo}: o ${destino} também foi apagado (conversão em cadeia) — verificar à mão.`);
      continue;
    }
    if (alvo.n > 0) continue; // já tem checkpoints: corrigido antes ou criados à mão

    if (!aplicar) {
      console.log(`•  ${rotulo} → ${destino} ${alvo.id}`);
      continue;
    }
    const n = await prisma.$transaction(
      (tx) => copiarCheckpointsNaConversao(tx, { de, origemId: item.id, destinoId: alvo.id }),
      { timeout: TIMEOUT_DA_CONVERSAO_MS }
    );
    copiados += n;
    console.log(`✅ ${rotulo} → ${destino} ${alvo.id}: ${n} copiado(s)`);
  }

  console.log(
    aplicar
      ? `Pronto. ${copiados} checkpoint(s) copiado(s).`
      : 'Só listagem. Rode com --aplicar para copiar.'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // O pool do app (keepAlive, sem idle timeout) mantém o processo vivo
    // mesmo após o $disconnect — encerra explicitamente.
    process.exit(process.exitCode ?? 0);
  });
