import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { ehBancoLocal } from '../src/lib/db-url';
import { IniciativaStatus, Priority } from '../src/generated/prisma/enums';
import { startOfWeekMondayUTC } from '../src/lib/date-utils';

/**
 * Seed de demonstração do DETALHE de uma iniciativa — cobre as features do card
 * de checkpoints, nas quatro visões, com datas relativas à semana em que você
 * rodar o script.
 *
 * O que dá para ver depois de rodar:
 *
 * Aba Lista
 * - ordenação por Nome, Responsável, Início e Fim (clique no rótulo inverte);
 * - árvore de 3 níveis: pai → filho → neto, com o pai recolhido por padrão;
 * - checkpoint ATRASADO (prazo vencido em vermelho) e CONCLUÍDO (riscado);
 * - checkpoint com DESCRIÇÃO — o ☰ ao lado do nome abre e fecha;
 * - categoria COMUNICAÇÃO com o avião de papel, incluindo um atrasado (que
 *   aparece como atrasado, não como comunicação: prazo vence categoria);
 * - checkpoint com responsável PRÓPRIO, diferente do responsável da iniciativa;
 * - checkpoint sem data de início (a coluna "Início" mostra "—");
 * - contagem x/y no pai que tem filhos.
 *
 * Abas Mês e Semana
 * - barras nas quatro cores: em aberto (sky), concluído (sage), atrasado
 *   (peach) e comunicação (blush), com a legenda mostrando "Comunicação";
 * - uma barra LONGA, que cruza semanas (pontas cortadas);
 * - dia com ausência (o time já tem ausências do seed principal na semana);
 * - "hoje" destacado, e a altura de dia que cabe várias barras.
 *
 * Aba Roadmap
 * - as mesmas barras na linha do tempo, arrastáveis para mudar a data.
 *
 * Fora do card: a faixa de metadados fica SEM doc de propósito, para o aviso
 * "Sem documento vinculado" aparecer. Cadastre um link para vê-lo desaparecer.
 *
 * Regras (as mesmas do seed de rituais):
 * - SÓ RODA NO BANCO LOCAL. Qualquer outro DATABASE_URL aborta.
 * - ADITIVO: não limpa o banco. Remove só a própria iniciativa-demo (pelo nome)
 *   antes de recriar, então rodar duas vezes não duplica.
 * - Depende do time e das frentes já existirem: rode `npm run seed` antes, se o
 *   banco estiver vazio.
 *
 * Rodar:   npm run seed:iniciativa
 * Desfazer: npm run seed:iniciativa -- --limpar
 */

const NOME = '[Demo] Página de checkpoints';

function assertLocalOnly() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  const isLocalDb = ehBancoLocal(dbUrl);
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Abortado: seed de demonstração não roda com NODE_ENV=production.');
    process.exit(1);
  }
  if (!isLocalDb) {
    console.error('❌ Abortado: DATABASE_URL não aponta para um banco local.');
    process.exit(1);
  }
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

const HOJE = new Date();
const SEMANA = startOfWeekMondayUTC(HOJE);

async function limparDemo() {
  // Os checkpoints caem por cascata (onDelete: Cascade no schema).
  const { count } = await prisma.iniciativa.deleteMany({ where: { name: NOME } });
  return count;
}

async function main() {
  assertLocalOnly();
  console.log('\n🌱 Seed do detalhe de iniciativa\n');

  const removidas = await limparDemo();
  if (removidas > 0) console.log(`   ↺ removida a versão anterior da demo`);

  const membros = await prisma.teamMember.findMany({
    where: { isActive: true, role: { not: 'VISITANTE' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (membros.length < 2) {
    console.error('❌ Precisa de pelo menos 2 membros ativos. Rode `npm run seed` primeiro.');
    process.exit(1);
  }
  const frente = await prisma.frente.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!frente) {
    console.error('❌ Nenhuma frente ativa. Rode `npm run seed` primeiro.');
    process.exit(1);
  }
  const quarter = await prisma.quarter.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!quarter) {
    console.error('❌ Nenhum quarter ativo. Rode `npm run seed` primeiro.');
    process.exit(1);
  }

  const [dona, outra] = membros;

  const iniciativa = await prisma.iniciativa.create({
    data: {
      name: NOME,
      // Sem docLink: é o que faz o aviso "Sem documento vinculado" aparecer.
      status: IniciativaStatus.EM_ANDAMENTO,
      priority: Priority.ALTA,
      startDate: addDays(SEMANA, -21),
      endDate: addDays(SEMANA, 28),
      frente: { connect: { id: frente.id } },
      quarter: { connect: { id: quarter.id } },
      members: { connect: [{ id: dona.id }] },
    },
    select: { id: true },
  });

  /**
   * Cada checkpoint existe para mostrar UMA coisa. `pai` monta a árvore, e a
   * ordem de criação vira o desempate do `order` na lista.
   */
  const criar = async (dados: {
    name: string;
    startDate?: Date | null;
    dueDate: Date;
    isCompleted?: boolean;
    completedAt?: Date | null;
    description?: string;
    categoria?: 'COMUNICACAO';
    membros?: string[];
    parentId?: string;
  }) => {
    const cp = await prisma.initiativeCheckpoint.create({
      data: {
        initiativeId: iniciativa.id,
        parentId: dados.parentId ?? null,
        name: dados.name,
        description: dados.description ?? null,
        startDate: dados.startDate ?? null,
        dueDate: dados.dueDate,
        isCompleted: dados.isCompleted ?? false,
        completedAt: dados.completedAt ?? null,
        categoria: dados.categoria ?? null,
        members: { connect: (dados.membros ?? [dona.id]).map((id) => ({ id })) },
      },
      select: { id: true },
    });
    return cp.id;
  };

  // Pai com filhos: mostra a árvore, a contagem x/y e o chevron.
  const pai = await criar({
    name: 'Refazer o fluxo de onboarding',
    startDate: addDays(SEMANA, -7),
    dueDate: addDays(SEMANA, 11),
    description:
      'Guarda o porquê: o passo 2 concentra a desistência. Clique no ☰ para abrir e fechar esta descrição.',
  });
  const filho = await criar({
    name: 'Mapear os passos atuais',
    startDate: addDays(SEMANA, -7),
    dueDate: addDays(SEMANA, -2),
    isCompleted: true,
    completedAt: addDays(SEMANA, -2),
    parentId: pai,
  });
  await criar({
    name: 'Anotar onde as pessoas desistem',
    dueDate: addDays(SEMANA, 1),
    parentId: filho,
    membros: [outra.id],
  });

  // Atrasado: prazo vencido e ninguém fechou.
  await criar({
    name: 'Aprovar os textos com o time de conteúdo',
    startDate: addDays(SEMANA, -10),
    dueDate: addDays(SEMANA, -4),
  });

  // Comunicação em aberto: avião de papel + barra blush no mês/semana.
  await criar({
    name: 'Anunciar o novo fluxo no Slack',
    dueDate: addDays(SEMANA, 4),
    categoria: 'COMUNICACAO',
    description: 'Post no #geral e e-mail para quem usa o produto.',
  });

  // Comunicação ATRASADA: aparece como atrasado (prazo vence categoria), com o
  // avião mantido.
  await criar({
    name: 'Avisar o suporte da mudança',
    dueDate: addDays(SEMANA, -1),
    categoria: 'COMUNICACAO',
  });

  // Sem data de início: a coluna "Início" mostra "—".
  await criar({
    name: 'Revisar as métricas depois de uma semana',
    dueDate: addDays(SEMANA, 9),
    membros: [outra.id],
  });

  // Barra longa: cruza semanas, então tem as pontas cortadas no mês.
  await criar({
    name: 'Acompanhar a conversão do passo 2',
    startDate: addDays(SEMANA, -3),
    dueDate: addDays(SEMANA, 17),
    membros: [dona.id, outra.id],
  });

  // Concluído nesta semana: barra sage e nome riscado.
  await criar({
    name: 'Alinhar o escopo com a liderança',
    startDate: addDays(SEMANA, -1),
    dueDate: addDays(SEMANA, 2),
    isCompleted: true,
    completedAt: addDays(SEMANA, 1),
  });

  const total = await prisma.initiativeCheckpoint.count({
    where: { initiativeId: iniciativa.id },
  });

  console.log(`   ✔ "${NOME}" com ${total} checkpoints`);
  console.log(`   Responsável: ${dona.name} (um checkpoint é de ${outra.name})`);
  console.log(`\n   Abra:  /iniciativas/${iniciativa.id}\n`);
  console.log(`   Para desfazer: npm run seed:iniciativa -- --limpar\n`);
}

async function limparApenas() {
  assertLocalOnly();
  const n = await limparDemo();
  console.log(n > 0 ? `\n🧹 Demo removida.\n` : `\n🧹 Nada a remover.\n`);
}

const alvo = process.argv.includes('--limpar') ? limparApenas() : main();
alvo
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
