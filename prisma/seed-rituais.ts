import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { ehBancoLocal } from '../src/lib/db-url';
import {
  AusenciaType,
  ExperimentoStatus,
  IniciativaStatus,
  Priority,
} from '../src/generated/prisma/enums';
import { semanaDoMesUTC, startOfWeekMondayUTC } from '../src/lib/date-utils';
import { calculateICEScore, getICEAction } from '../src/lib/ice';

/**
 * Seed de demonstração da página de Rituais — cobre TODAS as features da tela,
 * nas duas abas, com dados que caem na semana em que você rodar o script.
 *
 * O que dá para ver depois de rodar (aba Weekly):
 *
 * - itens de uma pessoa agrupados por frente (uma delas com dois grupos);
 * - um item com DOIS responsáveis, aparecendo na linha das duas pessoas;
 * - prioridade da semana: uma pessoa com 1 estrela, uma com 2, uma com 3 (que
 *   dispara o aviso de "no máximo duas") e uma sem nenhuma (que dispara o aviso
 *   de "sem prioridade");
 * - checkpoints da semana em três níveis (pai, filho e neto), com um concluído,
 *   e um checkpoint com responsável próprio aparecendo na linha dele;
 * - faixas de lançamento (esta semana e a próxima) e de análise de resultados;
 * - ausências: férias cruzando as duas semanas, um Day Off e uma licença na
 *   semana seguinte;
 * - "Fique ligado" escrito na semana ANTERIOR, para a faixa aparecer herdada
 *   ("vale até alguém mudar");
 * - ações da semana nas três frequências: só nesta semana, toda semana e todo
 *   mês na semana equivalente — com uma concluída (a conclusão é por semana).
 *
 * Aba Review semanal: experimentos aguardando resultado e com relatório pronto,
 * mais uma iniciativa marcada para apresentar.
 *
 * Regras (as mesmas do seed principal):
 * - SÓ RODA NO BANCO LOCAL. Qualquer outro DATABASE_URL aborta.
 * - ADITIVO: não limpa o banco. Remove só os próprios itens-demo (pelos nomes
 *   abaixo) antes de recriar, então rodar duas vezes não duplica.
 * - Depende do time já existir: rode `npm run seed` antes, se o banco estiver
 *   vazio.
 *
 * Rodar:  npm run seed:rituais
 */

// ─── Trava de segurança: banco local, sem exceções ──────────────────────────

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

// ─── Datas relativas à semana em que o script roda ──────────────────────────

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

const HOJE = new Date();
const SEMANA = startOfWeekMondayUTC(HOJE);
const SEMANA_ANTERIOR = addDays(SEMANA, -7);
const PROXIMA_SEMANA = addDays(SEMANA, 7);
const QUARTA = addDays(SEMANA, 2);
const QUINTA = addDays(SEMANA, 3);
const SEXTA = addDays(SEMANA, 4);
const DOMINGO = addDays(SEMANA, 6);

// ─── Nomes dos itens-demo (chave natural para a limpeza) ────────────────────

const INICIATIVAS = {
  seoProgramatico: '[Rituais] Landing por caso de uso',
  onboarding: '[Rituais] Onboarding guiado em 3 passos',
  precificacao: '[Rituais] Revisar página de planos',
  reativacao: '[Rituais] Régua de reativação D7',
  relatorioBF: '[Rituais] Relatório da Best Friday',
} as const;

const EXPERIMENTOS = {
  headline: '[Rituais] Headline com prova social',
  paywall: '[Rituais] Paywall contextual no 3º uso',
  checkout: '[Rituais] Checkout em uma etapa',
  push: '[Rituais] Push de carrinho abandonado',
} as const;

const ACOES = {
  th: '[Rituais] TH da semana',
  umaVez: '[Rituais] Subir alt text dos artigos',
  mensal: '[Rituais] Fechamento de métricas do mês',
  umUmUm: '[Rituais] 1:1 com a liderança',
} as const;

const MARCADOR_AUSENCIA = '[Rituais] ausência de demonstração';

async function limparDemo() {
  const nomesIni = Object.values(INICIATIVAS);
  const nomesExp = Object.values(EXPERIMENTOS);

  // Checkpoints e WeeklyFocus do próprio item caem em cascata; AcaoSemana cai
  // com a ação. Ausência sai pelo marcador.
  await prisma.iniciativa.deleteMany({ where: { name: { in: nomesIni } } });
  await prisma.experimento.deleteMany({ where: { name: { in: nomesExp } } });
  await prisma.acao.deleteMany({ where: { title: { in: Object.values(ACOES) } } });
  await prisma.ausencia.deleteMany({ where: { notes: MARCADOR_AUSENCIA } });

  // Estado da SEMANA, não do item: precisa ser zerado à mão, senão a
  // demonstração fica misturada com o que já estava marcado no banco.
  //
  // O aviso da semana atual sai junto (mesmo vazio): linha vazia significa
  // "semana silenciada" e cortaria a herança — que é justamente o que a seed
  // quer mostrar, com o recado escrito na semana anterior.
  await prisma.weeklyFocus.deleteMany({ where: { weekStart: SEMANA } });
  await prisma.weeklyAviso.deleteMany({
    where: { weekStart: { in: [SEMANA, SEMANA_ANTERIOR] } },
  });
}

async function main() {
  assertLocalOnly();

  // ─── Contexto: time, frentes e quarter que já existem ─────────────────────
  const membros = await prisma.teamMember.findMany({
    where: { isActive: true, role: { not: 'VISITANTE' } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (membros.length < 4) {
    console.error('❌ Abortado: são necessários ao menos 4 membros ativos não-visitantes.');
    console.error('   Rode `npm run seed` primeiro para criar o time.');
    process.exit(1);
  }

  const frentes = await prisma.frente.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (frentes.length < 3) {
    console.error('❌ Abortado: são necessárias ao menos 3 frentes ativas.');
    process.exit(1);
  }

  const quarter =
    (await prisma.quarter.findFirst({ where: { isActive: true } })) ??
    (await prisma.quarter.findFirst({
      where: { startDate: { lte: HOJE }, endDate: { gte: HOJE } },
    }));
  if (!quarter) {
    console.error('❌ Abortado: nenhum quarter ativo (nem que contenha hoje).');
    process.exit(1);
  }

  const [p1, p2, p3, p4] = membros;
  const [f1, f2, f3] = frentes;

  await limparDemo();

  const base = { quarterId: quarter.id, startDate: addDays(SEMANA, -14), endDate: addDays(SEMANA, 21) };

  // ─── Iniciativas ──────────────────────────────────────────────────────────

  // p1: duas frentes → a linha dela aparece com DOIS grupos.
  const seo = await prisma.iniciativa.create({
    data: {
      ...base,
      name: INICIATIVAS.seoProgramatico,
      frenteId: f1.id,
      status: IniciativaStatus.EM_ANDAMENTO,
      priority: Priority.ALTA,
      // Análise nesta semana → faixa azul de análise de resultados.
      analysisDate: QUINTA,
      members: { connect: [{ id: p1.id }] },
    },
  });

  const onboarding = await prisma.iniciativa.create({
    data: {
      ...base,
      name: INICIATIVAS.onboarding,
      frenteId: f2.id,
      status: IniciativaStatus.EM_ANDAMENTO,
      priority: Priority.URGENTE,
      // Lançamento nesta semana → faixa de lançamento.
      launchDate: SEXTA,
      members: { connect: [{ id: p1.id }] },
    },
  });

  // p2: três itens na MESMA frente, para o caso de três estrelas.
  const precificacao = await prisma.iniciativa.create({
    data: {
      ...base,
      name: INICIATIVAS.precificacao,
      frenteId: f3.id,
      status: IniciativaStatus.EM_ANDAMENTO,
      priority: Priority.MEDIA,
      members: { connect: [{ id: p2.id }] },
    },
  });

  const reativacao = await prisma.iniciativa.create({
    data: {
      ...base,
      name: INICIATIVAS.reativacao,
      frenteId: f3.id,
      status: IniciativaStatus.BACKLOG,
      priority: Priority.BAIXA,
      members: { connect: [{ id: p2.id }] },
    },
  });

  // Marcada para apresentar → aparece na aba Review semanal.
  const relatorioBF = await prisma.iniciativa.create({
    data: {
      ...base,
      name: INICIATIVAS.relatorioBF,
      frenteId: f1.id,
      status: IniciativaStatus.ESCREVENDO_RELATORIO,
      priority: Priority.ALTA,
      precisaApresentarResultados: true,
      members: { connect: [{ id: p2.id }] },
    },
  });

  // p3: um item só, e nenhuma estrela → dispara "sem prioridade da semana".
  const ativacaoP3 = await prisma.iniciativa.create({
    data: {
      ...base,
      name: '[Rituais] Tour interativo no primeiro acesso',
      frenteId: f2.id,
      status: IniciativaStatus.EM_ANDAMENTO,
      priority: Priority.MEDIA,
      members: { connect: [{ id: p3.id }] },
    },
  });

  // ─── Experimentos ─────────────────────────────────────────────────────────

  const ice = (i: number, c: number, e: number) => {
    const iceScore = calculateICEScore(i, c, e);
    return {
      impactScore: i,
      confidenceScore: c,
      effortScore: e,
      iceScore,
      iceAction: getICEAction(iceScore),
    };
  };

  // Dois responsáveis → o MESMO item aparece na linha de p1 e de p4.
  const headline = await prisma.experimento.create({
    data: {
      ...base,
      name: EXPERIMENTOS.headline,
      description: 'Prova social acima da dobra.',
      objective: 'Aumentar conversão da home.',
      frenteId: f1.id,
      status: ExperimentoStatus.EM_ANDAMENTO,
      ...ice(8, 7, 3),
      members: { connect: [{ id: p1.id }, { id: p4.id }] },
    },
  });

  const paywall = await prisma.experimento.create({
    data: {
      ...base,
      name: EXPERIMENTOS.paywall,
      description: 'Paywall contextual no terceiro uso.',
      objective: 'Converter uso em assinatura.',
      frenteId: f3.id,
      status: ExperimentoStatus.AGUARDANDO_RESULTADOS,
      // Lançamento na PRÓXIMA semana → faixa "próxima semana".
      launchDate: addDays(PROXIMA_SEMANA, 2),
      ...ice(9, 6, 4),
      members: { connect: [{ id: p4.id }] },
    },
  });

  const checkout = await prisma.experimento.create({
    data: {
      ...base,
      name: EXPERIMENTOS.checkout,
      description: 'Checkout em uma etapa.',
      objective: 'Reduzir abandono no pagamento.',
      frenteId: f3.id,
      status: ExperimentoStatus.RELATORIO_PRONTO,
      ...ice(7, 8, 5),
      members: { connect: [{ id: p4.id }] },
    },
  });

  await prisma.experimento.create({
    data: {
      ...base,
      name: EXPERIMENTOS.push,
      description: 'Push de carrinho abandonado em 2h.',
      objective: 'Recuperar carrinho.',
      frenteId: f2.id,
      status: ExperimentoStatus.EM_ANDAMENTO,
      ...ice(6, 7, 2),
      members: { connect: [{ id: p3.id }] },
    },
  });

  // ─── Checkpoints da semana: árvore de três níveis ─────────────────────────

  const pai = await prisma.initiativeCheckpoint.create({
    data: {
      initiativeId: seo.id,
      name: 'Publicar as 5 primeiras landings',
      dueDate: QUINTA,
      order: 0,
      members: { connect: [{ id: p1.id }] },
    },
  });

  const filhoConcluido = await prisma.initiativeCheckpoint.create({
    data: {
      initiativeId: seo.id,
      parentId: pai.id,
      name: 'Escrever os textos',
      dueDate: QUARTA,
      isCompleted: true,
      completedAt: QUARTA,
      order: 0,
      members: { connect: [{ id: p1.id }] },
    },
  });

  await prisma.initiativeCheckpoint.create({
    data: {
      initiativeId: seo.id,
      parentId: filhoConcluido.id,
      name: 'Revisar o SEO on-page',
      dueDate: QUINTA,
      order: 0,
      members: { connect: [{ id: p1.id }] },
    },
  });

  // Checkpoint com responsável PRÓPRIO, diferente de quem responde pelo item:
  // aparece na linha de p3, e não na de p1.
  await prisma.initiativeCheckpoint.create({
    data: {
      initiativeId: onboarding.id,
      name: 'Validar copy com 5 usuários',
      dueDate: SEXTA,
      order: 1,
      members: { connect: [{ id: p3.id }] },
    },
  });

  await prisma.experimentoCheckpoint.create({
    data: {
      experimentoId: headline.id,
      name: 'Fechar a leitura do teste',
      dueDate: DOMINGO,
      order: 0,
      members: { connect: [{ id: p4.id }] },
    },
  });

  // ─── Prioridade da semana (as estrelas) ──────────────────────────────────

  const foco = (memberId: string, iniciativaId?: string, experimentoId?: string) =>
    prisma.weeklyFocus.create({
      data: { weekStart: SEMANA, memberId, iniciativaId, experimentoId },
    });

  // p1: uma estrela (o combinado respeitado, sem aviso).
  await foco(p1.id, seo.id);
  // p2: TRÊS estrelas → aviso "3 prioridades marcadas".
  await foco(p2.id, precificacao.id);
  await foco(p2.id, reativacao.id);
  await foco(p2.id, relatorioBF.id);
  // p4: duas estrelas (o limite, ainda sem aviso).
  await foco(p4.id, undefined, headline.id);
  await foco(p4.id, undefined, paywall.id);
  // p3 fica sem nenhuma → aviso "sem prioridade da semana".

  // ─── Ausências ───────────────────────────────────────────────────────────

  await prisma.ausencia.createMany({
    data: [
      {
        // Férias cruzando as DUAS semanas → aparece nos dois blocos do card.
        memberId: p2.id,
        type: AusenciaType.FERIAS,
        startDate: QUARTA,
        endDate: addDays(PROXIMA_SEMANA, 3),
        notes: MARCADOR_AUSENCIA,
      },
      {
        memberId: p3.id,
        type: AusenciaType.DAY_OFF,
        startDate: SEXTA,
        endDate: SEXTA,
        notes: MARCADOR_AUSENCIA,
      },
      {
        memberId: p4.id,
        type: AusenciaType.LICENCA_MEDICA,
        startDate: addDays(PROXIMA_SEMANA, 1),
        endDate: addDays(PROXIMA_SEMANA, 2),
        notes: MARCADOR_AUSENCIA,
      },
    ],
  });

  // ─── "Fique ligado" na semana anterior (para ver herdado) ────────────────

  await prisma.weeklyAviso.create({
    data: {
      weekStart: SEMANA_ANTERIOR,
      content:
        'Best Friday começa dia 20: congelamento de deploy a partir da sexta e plantão de métricas no sábado.',
      updatedById: p1.id,
    },
  });

  // ─── Ações da semana, nas três frequências ───────────────────────────────

  const SEM_FIM = new Date(Date.UTC(2099, 11, 31));
  const fimDoDomingo = new Date(DOMINGO);
  fimDoDomingo.setUTCHours(23, 59, 59, 999);

  // Só nesta semana, já concluída (a conclusão é por semana).
  const umaVez = await prisma.acao.create({
    data: {
      title: ACOES.umaVez,
      responsavelId: p1.id,
      dataInicio: SEMANA,
      dataFim: fimDoDomingo,
    },
  });
  await prisma.acaoSemana.create({ data: { acaoId: umaVez.id, weekStart: SEMANA } });

  // Toda semana: intervalo aberto.
  await prisma.acao.create({
    data: {
      title: ACOES.th,
      responsavelId: p1.id,
      dataInicio: SEMANA,
      dataFim: SEM_FIM,
      repeticao: { tipo: 'semanal' },
    },
  });

  await prisma.acao.create({
    data: {
      title: ACOES.umUmUm,
      responsavelId: p3.id,
      dataInicio: SEMANA,
      dataFim: SEM_FIM,
      repeticao: { tipo: 'semanal' },
    },
  });

  // Todo mês, ancorada na semana equivalente desta semana.
  await prisma.acao.create({
    data: {
      title: ACOES.mensal,
      responsavelId: p2.id,
      dataInicio: SEMANA,
      dataFim: SEM_FIM,
      repeticao: { tipo: 'mensal', semanaDoMes: semanaDoMesUTC(SEMANA) },
    },
  });

  // ─── Resumo ──────────────────────────────────────────────────────────────

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  console.log('\n✅ Seed de Rituais aplicada.\n');
  console.log(`   Semana: ${iso(SEMANA)} a ${iso(DOMINGO)} (semana ${semanaDoMesUTC(SEMANA)} do mês)`);
  console.log(`   Quarter: Q${quarter.quarter} ${quarter.year}\n`);
  console.log('   Weekly → o que olhar:');
  console.log(`   · ${p1.name}: dois grupos de frente, 1 estrela, checkpoints em 3 níveis, 2 ações`);
  console.log(`   · ${p2.name}: 3 estrelas (aviso de "no máximo duas"), férias nas 2 semanas, ação mensal`);
  console.log(`   · ${p3.name}: nenhuma estrela (aviso "sem prioridade"), Day Off, checkpoint de outro item`);
  console.log(`   · ${p4.name}: 2 estrelas, item compartilhado com ${p1.name}, licença na semana seguinte`);
  console.log('   · "Fique ligado" aparece HERDADO da semana anterior\n');
  console.log('   Review semanal → experimento aguardando resultado, relatório pronto e');
  console.log('   uma iniciativa marcada para apresentar.\n');
  console.log(`   Para desfazer: npm run seed:rituais -- --limpar\n`);
}

async function limparApenas() {
  assertLocalOnly();
  await limparDemo();
  // Iniciativas de demonstração fora do mapa (nomes com o prefixo).
  await prisma.iniciativa.deleteMany({ where: { name: { startsWith: '[Rituais] ' } } });
  await prisma.experimento.deleteMany({ where: { name: { startsWith: '[Rituais] ' } } });
  await prisma.weeklyFocus.deleteMany({ where: { weekStart: SEMANA } });
  console.log('🧹 Dados de demonstração de Rituais removidos.');
}

const alvo = process.argv.includes('--limpar') ? limparApenas() : main();

alvo
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
