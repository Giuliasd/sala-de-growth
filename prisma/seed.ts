import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { resolveSeedTarget, STAGING_APP } from '../src/lib/seed-guard';
import {
  IniciativaStatus,
  ExperimentoStatus,
  IceAction,
  AusenciaType,
  Priority,
  ResultadoFinal,
  MemberRole,
} from '../src/generated/prisma/enums';

/**
 * Seed de demonstração — um time de growth de alto desempenho, completo.
 *
 * Preenche TODAS as áreas do produto: membros, frentes (funil AARRR),
 * quarters (passado/atual/futuro), objetivos + KRs com histórico, iniciativas
 * com checkpoints e comentários, experimentos com ICE/resultados, ausências,
 * ações da semana e o playbook (seções + links).
 *
 * Regras:
 * - RODA NO BANCO LOCAL (localhost/127.0.0.1). A ÚNICA exceção é a STAGING, e só
 *   com SEED_STAGING_CONFIRM=meu-app-staging E o banco totalmente vazio
 *   (ver lib/seed-guard.ts). Produção tem dados, então aborta; qualquer outro
 *   DATABASE_URL também. Não existe outro override.
 * - ADITIVO e idempotente: cada entidade é identificada por chave natural e só
 *   é criada se não existir. Rodar duas vezes não duplica nem sobrescreve.
 * - Datas relativas a HOJE: o quarter atual é o do calendário e vários itens
 *   cobrem a semana corrente — dashboard, Weekly e Rituais nascem populados.
 *
 * Rodar:  npm run seed
 *
 * Staging (a partir da sua máquina; ver src/lib/seed-guard.ts):
 *   SEED_STAGING_CONFIRM=meu-app-staging  confirma o alvo
 *   SEED_LEADER_EMAIL=voce@empresa.com           cria você como LIDERANCA real
 *   SEED_LEADER_NAME="Seu Nome"                  (opcional)
 */

// ─── Trava de segurança: banco local, sem exceções ──────────────────────────

async function assertSeedTarget() {
  const target = resolveSeedTarget({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    SEED_STAGING_CONFIRM: process.env.SEED_STAGING_CONFIRM,
  });

  if (target.kind === 'refuse') {
    console.error(`❌ Abortado: ${target.reason}`);
    console.error('   Esta seed insere dados fictícios. Roda no banco local ou, com confirmação explícita,');
    console.error(`   numa staging VAZIA (SEED_STAGING_CONFIRM=${STAGING_APP}). Produção nunca.`);
    process.exit(1);
  }
  if (target.kind === 'local') return;

  // Staging: o último cinto de segurança é o próprio banco. Se já tem dado de
  // verdade (produção, ou uma staging em uso), não escreve nada.
  const [quarters, frentes, objetivos, iniciativas, experimentos] = await Promise.all([
    prisma.quarter.count(),
    prisma.frente.count(),
    prisma.objetivo.count(),
    prisma.iniciativa.count(),
    prisma.experimento.count(),
  ]);
  const total = quarters + frentes + objetivos + iniciativas + experimentos;
  if (total > 0) {
    console.error(`❌ Abortado: o banco em ${target.host} NÃO está vazio`);
    console.error(`   (${quarters} quarters, ${frentes} frentes, ${objetivos} objetivos, ${iniciativas} iniciativas, ${experimentos} experimentos).`);
    console.error('   A seed de staging só roda em banco vazio. Nada foi escrito.');
    process.exit(1);
  }
  console.log(`🎯 Staging confirmada: banco vazio em ${target.host}.`);
}

// ─── Datas (UTC, relativas a hoje) ───────────────────────────────────────────

const HOJE = new Date();

function utc(y: number, m: number, d: number, endOfDay = false): Date {
  return new Date(Date.UTC(y, m, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Segunda-feira da semana corrente (UTC). */
function inicioDaSemana(ref: Date): Date {
  const d = utc(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const day = d.getUTCDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

/** Quarter de calendário que contém a data. */
function quarterDe(ref: Date): { year: number; quarter: number; start: Date; end: Date } {
  const year = ref.getUTCFullYear();
  const quarter = Math.floor(ref.getUTCMonth() / 3) + 1;
  const start = utc(year, (quarter - 1) * 3, 1);
  const end = new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59)); // dia 0 do mês seguinte = último dia
  return { year, quarter, start, end };
}

function quarterVizinho(ref: Date, delta: 1 | -1) {
  const base = quarterDe(ref);
  const mid = addDays(delta === 1 ? base.end : base.start, delta === 1 ? 15 : -15);
  return quarterDe(mid);
}

const SEMANA = inicioDaSemana(HOJE); // segunda desta semana
const Q_ATUAL = quarterDe(HOJE);
const Q_PASSADO = quarterVizinho(HOJE, -1);
const Q_FUTURO = quarterVizinho(HOJE, 1);

// ─── Contadores do relatório final ───────────────────────────────────────────

const created = {
  membros: 0, frentes: 0, quarters: 0, objetivos: 0, krs: 0, krUpdates: 0,
  iniciativas: 0, experimentos: 0, checkpoints: 0, comentarios: 0,
  ausencias: 0, acoes: 0, secoesPlaybook: 0, linksPlaybook: 0,
};

// ─── Find-or-create (chaves naturais; nunca sobrescrevem) ────────────────────

async function ensureMember(name: string, email: string, role: MemberRole) {
  const existing = await prisma.teamMember.findUnique({ where: { email } });
  if (existing) return existing;
  created.membros++;
  return prisma.teamMember.create({ data: { name, email, role, isActive: true } });
}

async function ensureFrente(name: string) {
  const existing = await prisma.frente.findFirst({ where: { name } });
  if (existing) return existing;
  created.frentes++;
  return prisma.frente.create({ data: { name, isActive: true } });
}

async function ensureQuarter(q: { year: number; quarter: number; start: Date; end: Date }, wantActive: boolean) {
  const existing = await prisma.quarter.findFirst({ where: { year: q.year, quarter: q.quarter } });
  if (existing) return existing;
  const hasActive = await prisma.quarter.findFirst({ where: { isActive: true } });
  created.quarters++;
  return prisma.quarter.create({
    data: { year: q.year, quarter: q.quarter, startDate: q.start, endDate: q.end, isActive: wantActive && !hasActive },
  });
}

async function ensureObjetivo(quarterId: string, title: string, description: string, order: number) {
  const existing = await prisma.objetivo.findFirst({ where: { quarterId, title } });
  if (existing) return existing;
  created.objetivos++;
  return prisma.objetivo.create({ data: { quarterId, title, description, order } });
}

type KRSeed = {
  frenteId: string;
  objective: string;
  targetValue: number;
  initialValue: number;
  currentValue: number;
  unit: 'UNIDADE' | 'REAL' | 'PORCENTAGEM';
  measurementType?: 'ACUMULADO' | 'MEDIA_MENSAL';
  monthValues?: [number | null, number | null, number | null];
  memberIds?: string[];
};

function progresso(kr: KRSeed): number {
  if (kr.measurementType === 'MEDIA_MENSAL') {
    const vals = (kr.monthValues ?? []).filter((v): v is number => v != null);
    if (vals.length === 0 || kr.targetValue === 0) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(0, Math.round((avg / kr.targetValue) * 1000) / 10);
  }
  if (kr.targetValue === kr.initialValue) return 0;
  return Math.max(
    0,
    Math.round(((kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue)) * 1000) / 10,
  );
}

async function ensureKR(quarterId: string, objetivoId: string, kr: KRSeed) {
  const existing = await prisma.oKR.findFirst({ where: { quarterId, objective: kr.objective } });
  if (existing) return { kr: existing, isNew: false };
  created.krs++;
  const isMonthly = kr.measurementType === 'MEDIA_MENSAL';
  const monthVals = kr.monthValues ?? [null, null, null];
  const vals = monthVals.filter((v): v is number => v != null);
  const current = isMonthly
    ? (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0)
    : kr.currentValue;
  const row = await prisma.oKR.create({
    data: {
      quarterId,
      objetivoId,
      frenteId: kr.frenteId,
      objective: kr.objective,
      targetValue: kr.targetValue,
      initialValue: isMonthly ? 0 : kr.initialValue,
      currentValue: current,
      progressPercent: progresso(kr),
      unit: kr.unit,
      measurementType: kr.measurementType ?? 'ACUMULADO',
      monthValue1: monthVals[0],
      monthValue2: monthVals[1],
      monthValue3: monthVals[2],
      lastUpdatedAt: addDays(SEMANA, -3),
      ...(kr.memberIds?.length && { members: { connect: kr.memberIds.map((id) => ({ id })) } }),
    },
  });
  return { kr: row, isNew: true };
}

type IniSeed = {
  name: string;
  frenteId: string;
  memberId: string;
  status: IniciativaStatus;
  priority?: Priority;
  startOff: number; // dias a partir da segunda desta semana (negativo = passado)
  days: number;
  launchOff?: number;
  resultado?: ResultadoFinal;
  okrId?: string;
  docLink?: string;
  checkpoints?: Array<{ name: string; dueOff: number; memberId?: string; done?: boolean }>;
  comments?: Array<{ memberId: string; content: string }>;
};

async function ensureIniciativa(quarterId: string, i: IniSeed) {
  const existing = await prisma.iniciativa.findFirst({ where: { quarterId, name: i.name } });
  if (existing) return existing;
  created.iniciativas++;
  const startDate = addDays(SEMANA, i.startOff);
  const row = await prisma.iniciativa.create({
    data: {
      quarterId,
      frenteId: i.frenteId,
      members: { connect: [{ id: i.memberId }] },
      name: i.name,
      status: i.status,
      priority: i.priority ?? Priority.MEDIA,
      startDate,
      endDate: addDays(startDate, i.days),
      launchDate: i.launchOff != null ? addDays(SEMANA, i.launchOff) : null,
      resultado: i.resultado ?? null,
      okrId: i.okrId ?? null,
      docLink: i.docLink ?? null,
    },
  });
  for (const [idx, c] of (i.checkpoints ?? []).entries()) {
    created.checkpoints++;
    await prisma.initiativeCheckpoint.create({
      data: {
        initiativeId: row.id,
        name: c.name,
        dueDate: addDays(SEMANA, c.dueOff),
        members: { connect: [{ id: c.memberId ?? i.memberId }] },
        order: idx,
        isCompleted: !!c.done,
        completedAt: c.done ? addDays(SEMANA, c.dueOff - 1) : null,
      },
    });
  }
  for (const c of i.comments ?? []) {
    created.comentarios++;
    await prisma.initiativeComment.create({
      data: { initiativeId: row.id, memberId: c.memberId, content: c.content },
    });
  }
  return row;
}

type ExpSeed = {
  name: string;
  frenteId: string;
  memberId: string;
  okrId?: string;
  status: ExperimentoStatus;
  I: number; C: number; E: number; // escala 1–5; score = (I*C)/E
  hypothesis: string;
  metric: string;
  startOff: number;
  days: number;
  launchOff?: number;
  resultado?: ResultadoFinal;
  docLink?: string;
  checkpoints?: Array<{ name: string; dueOff: number; done?: boolean }>;
  comments?: Array<{ memberId: string; content: string }>;
};

// Mesma régua do app (src/lib/ice.ts).
function iceScoreDe(I: number, C: number, E: number): number {
  if (E === 0) return 0;
  return Math.round(((I * C) / E) * 10) / 10;
}
function iceActionDe(score: number): IceAction {
  if (score >= 4) return IceAction.EXECUTAR_AGORA;
  if (score >= 3) return IceAction.EM_SEGUIDA;
  if (score >= 2) return IceAction.BACKLOG;
  return IceAction.ARQUIVAR;
}

async function ensureExperimento(quarterId: string, e: ExpSeed) {
  const existing = await prisma.experimento.findFirst({ where: { quarterId, name: e.name } });
  if (existing) return existing;
  created.experimentos++;
  const iceScore = iceScoreDe(e.I, e.C, e.E);
  const startDate = addDays(SEMANA, e.startOff);
  const row = await prisma.experimento.create({
    data: {
      quarterId,
      frenteId: e.frenteId,
      members: { connect: [{ id: e.memberId }] },
      okrId: e.okrId ?? null,
      name: e.name,
      description: e.hypothesis,
      objective: e.metric,
      status: e.status,
      impactScore: e.I,
      confidenceScore: e.C,
      effortScore: e.E,
      iceScore,
      iceAction: iceActionDe(iceScore),
      startDate,
      endDate: addDays(startDate, e.days),
      launchDate: e.launchOff != null ? addDays(SEMANA, e.launchOff) : null,
      resultado: e.resultado ?? null,
      docLink: e.docLink ?? null,
    },
  });
  for (const [idx, c] of (e.checkpoints ?? []).entries()) {
    created.checkpoints++;
    await prisma.experimentoCheckpoint.create({
      data: {
        experimentoId: row.id,
        name: c.name,
        dueDate: addDays(SEMANA, c.dueOff),
        members: { connect: [{ id: e.memberId }] },
        order: idx,
        isCompleted: !!c.done,
        completedAt: c.done ? addDays(SEMANA, c.dueOff - 1) : null,
      },
    });
  }
  for (const c of e.comments ?? []) {
    created.comentarios++;
    await prisma.experimentoComment.create({
      data: { experimentoId: row.id, memberId: c.memberId, content: c.content },
    });
  }
  return row;
}

async function ensureAusencia(memberId: string, startDate: Date, data: { type: AusenciaType; endDate: Date; notes?: string }) {
  const existing = await prisma.ausencia.findFirst({ where: { memberId, startDate } });
  if (existing) return existing;
  created.ausencias++;
  return prisma.ausencia.create({ data: { memberId, startDate, ...data } });
}

async function ensureAcao(title: string, data: { responsavelId: string; inicioOff: number; fimOff: number; iniciativaId?: string; experimentoId?: string; notes?: string; completed?: boolean }) {
  const existing = await prisma.acao.findFirst({ where: { title } });
  if (existing) return existing;
  created.acoes++;
  return prisma.acao.create({
    data: {
      title,
      responsavelId: data.responsavelId,
      dataInicio: addDays(SEMANA, data.inicioOff),
      dataFim: addDays(SEMANA, data.fimOff),
      iniciativaId: data.iniciativaId ?? null,
      experimentoId: data.experimentoId ?? null,
      notes: data.notes ?? null,
      completed: !!data.completed,
      completedAt: data.completed ? addDays(SEMANA, data.fimOff) : null,
    },
  });
}

async function ensureSecaoPlaybook(name: string, order: number) {
  const existing = await prisma.playbookSection.findFirst({ where: { name } });
  if (existing) return existing;
  created.secoesPlaybook++;
  return prisma.playbookSection.create({ data: { name, order } });
}

async function ensureLinkPlaybook(title: string, data: { subtitle: string; url: string; iconName: string; sectionId: string }) {
  const existing = await prisma.playbookLink.findFirst({ where: { title } });
  if (existing) return existing;
  created.linksPlaybook++;
  return prisma.playbookLink.create({ data: { title, ...data } });
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  await assertSeedTarget();

  console.log('👥 Time de growth (se não existirem)...');
  const helena = await ensureMember('Helena Costa', 'helena.costa@saladegrowth.com', MemberRole.LIDERANCA);
  const rafael = await ensureMember('Rafael Nunes', 'rafael.nunes@saladegrowth.com', MemberRole.COLABORADOR);
  const sofia = await ensureMember('Sofia Almeida', 'sofia.almeida@saladegrowth.com', MemberRole.COLABORADOR);
  const bruno = await ensureMember('Bruno Teixeira', 'bruno.teixeira@saladegrowth.com', MemberRole.COLABORADOR);
  const larissa = await ensureMember('Larissa Campos', 'larissa.campos@saladegrowth.com', MemberRole.COLABORADOR);
  const diego = await ensureMember('Diego Martins', 'diego.martins@saladegrowth.com', MemberRole.COLABORADOR);
  const camila = await ensureMember('Camila Rocha', 'camila.rocha@saladegrowth.com', MemberRole.COLABORADOR);

  // Os membros acima têm e-mail fictício: ninguém consegue logar com eles. Para
  // entrar na staging é preciso um membro real (login Google exige conta existente).
  const leaderEmail = process.env.SEED_LEADER_EMAIL?.trim().toLowerCase();
  if (leaderEmail) {
    const antes = await prisma.teamMember.findUnique({ where: { email: leaderEmail } });
    const leaderName = process.env.SEED_LEADER_NAME?.trim() || leaderEmail.split('@')[0];
    await ensureMember(leaderName, leaderEmail, MemberRole.LIDERANCA);
    if (antes && antes.role !== MemberRole.LIDERANCA) {
      console.warn(`⚠️  ${leaderEmail} já existia como ${antes.role} e foi mantido (a seed não altera quem já existe).`);
    } else {
      console.log(`🔑 Liderança real garantida: ${leaderEmail}`);
    }
  }

  console.log('🧭 Frentes do funil (AARRR)...');
  const fAquisicao = await ensureFrente('Aquisição');
  const fAtivacao = await ensureFrente('Ativação');
  const fRetencao = await ensureFrente('Retenção');
  const fMonetizacao = await ensureFrente('Monetização');
  const fIndicacao = await ensureFrente('Indicação');

  console.log('🗓️  Quarters (passado / atual / futuro)...');
  const qPassado = await ensureQuarter(Q_PASSADO, false);
  const qAtual = await ensureQuarter(Q_ATUAL, true);
  const qFuturo = await ensureQuarter(Q_FUTURO, false);

  console.log('🎯 Objetivos e KRs...');
  // ── Quarter atual: 3 objetivos, 8 KRs ──
  const obj1 = await ensureObjetivo(
    qAtual.id,
    'Construir uma máquina de aquisição previsível',
    'Menos dependência de mídia paga: mix de canais com CAC sustentável e volume crescente.',
    0,
  );
  const obj2 = await ensureObjetivo(
    qAtual.id,
    'Levar o novo usuário ao momento de valor em minutos',
    'Ativação é o maior gargalo do funil hoje — encurtar o caminho até o primeiro sucesso.',
    1,
  );
  const obj3 = await ensureObjetivo(
    qAtual.id,
    'Compor receita com retenção e indicação',
    'Crescimento composto: reter quem chega e transformar clientes em canal.',
    2,
  );

  const krsAtual: Array<{ obj: string; kr: KRSeed }> = [
    { obj: obj1.id, kr: { frenteId: fAquisicao.id, objective: 'Reduzir o CAC blended de R$ 95 para R$ 60', targetValue: 60, initialValue: 95, currentValue: 78, unit: 'REAL', memberIds: [sofia.id] } },
    { obj: obj1.id, kr: { frenteId: fAquisicao.id, objective: 'Elevar signups qualificados de 480 para 900 por semana', targetValue: 900, initialValue: 480, currentValue: 640, unit: 'UNIDADE', memberIds: [sofia.id, larissa.id] } },
    { obj: obj1.id, kr: { frenteId: fAquisicao.id, objective: 'Sustentar conversão visitante→signup em 4,5% (média mensal)', targetValue: 4.5, initialValue: 0, currentValue: 0, unit: 'PORCENTAGEM', measurementType: 'MEDIA_MENSAL', monthValues: [4.1, null, null], memberIds: [larissa.id] } },
    { obj: obj2.id, kr: { frenteId: fAtivacao.id, objective: 'Aumentar a ativação D1 de 34% para 55%', targetValue: 55, initialValue: 34, currentValue: 46, unit: 'PORCENTAGEM', memberIds: [rafael.id] } },
    { obj: obj2.id, kr: { frenteId: fAtivacao.id, objective: 'Reduzir o time-to-value mediano de 18 para 5 minutos', targetValue: 5, initialValue: 18, currentValue: 11, unit: 'UNIDADE', memberIds: [diego.id] } },
    { obj: obj3.id, kr: { frenteId: fMonetizacao.id, objective: 'Crescer o MRR de R$ 210 mil para R$ 320 mil', targetValue: 320000, initialValue: 210000, currentValue: 254000, unit: 'REAL', memberIds: [helena.id] } },
    { obj: obj3.id, kr: { frenteId: fRetencao.id, objective: 'Reduzir o churn mensal para 3% (média mensal)', targetValue: 3, initialValue: 0, currentValue: 0, unit: 'PORCENTAGEM', measurementType: 'MEDIA_MENSAL', monthValues: [4.6, null, null], memberIds: [camila.id] } },
    { obj: obj3.id, kr: { frenteId: fIndicacao.id, objective: 'Levar o fator K de indicação de 0,18 para 0,45', targetValue: 0.45, initialValue: 0.18, currentValue: 0.27, unit: 'UNIDADE', memberIds: [camila.id, rafael.id] } },
  ];

  const membrosRotacao = [rafael, sofia, bruno, larissa, camila];
  let rot = 0;
  const krPorNome = new Map<string, string>();
  for (const { obj, kr } of krsAtual) {
    const { kr: row, isNew } = await ensureKR(qAtual.id, obj, kr);
    krPorNome.set(kr.objective, row.id);
    // Histórico de updates semanais só na primeira criação (mantém idempotência).
    if (isNew && kr.measurementType !== 'MEDIA_MENSAL') {
      const passo = (kr.currentValue - kr.initialValue) / 3;
      for (let w = 1; w <= 3; w++) {
        created.krUpdates++;
        await prisma.oKRUpdate.create({
          data: {
            okrId: row.id,
            memberId: membrosRotacao[rot++ % membrosRotacao.length].id,
            date: addDays(SEMANA, -21 + w * 7),
            previousValue: Math.round((kr.initialValue + passo * (w - 1)) * 100) / 100,
            newValue: Math.round((kr.initialValue + passo * w) * 100) / 100,
          },
        });
      }
    }
  }

  // ── Quarter passado: 1 objetivo fechado ──
  const objPassado = await ensureObjetivo(
    qPassado.id,
    'Validar os loops de crescimento do produto',
    'Quarter de fundação: provar aquisição orgânica, ativação guiada e o primeiro loop de indicação.',
    0,
  );
  await ensureKR(qPassado.id, objPassado.id, { frenteId: fAtivacao.id, objective: 'Dobrar a ativação D1 (17% → 34%)', targetValue: 34, initialValue: 17, currentValue: 34, unit: 'PORCENTAGEM' });
  await ensureKR(qPassado.id, objPassado.id, { frenteId: fAquisicao.id, objective: 'Atingir 480 signups qualificados por semana', targetValue: 480, initialValue: 210, currentValue: 495, unit: 'UNIDADE' });
  await ensureKR(qPassado.id, objPassado.id, { frenteId: fIndicacao.id, objective: 'Lançar o loop de indicação com fator K ≥ 0,15', targetValue: 0.15, initialValue: 0, currentValue: 0.18, unit: 'UNIDADE' });

  // ── Quarter futuro: 1 objetivo de planejamento ──
  const objFuturo = await ensureObjetivo(
    qFuturo.id,
    'Escalar os motores validados',
    'Internacionalização do funil e automação do lifecycle de ponta a ponta.',
    0,
  );
  await ensureKR(qFuturo.id, objFuturo.id, { frenteId: fAquisicao.id, objective: 'Abrir 2 novos mercados com CAC ≤ R$ 80', targetValue: 2, initialValue: 0, currentValue: 0, unit: 'UNIDADE' });
  await ensureKR(qFuturo.id, objFuturo.id, { frenteId: fMonetizacao.id, objective: 'Elevar o LTV/CAC para 4x', targetValue: 4, initialValue: 2.6, currentValue: 2.6, unit: 'UNIDADE' });

  console.log('📋 Iniciativas com checkpoints e comentários...');
  const iniciativas: IniSeed[] = [
    {
      name: 'Tracking server-side com taxonomia única de eventos',
      frenteId: fAquisicao.id, memberId: bruno.id, status: IniciativaStatus.EM_ANDAMENTO, priority: Priority.ALTA,
      startOff: -14, days: 28, okrId: krPorNome.get('Elevar signups qualificados de 480 para 900 por semana'),
      docLink: 'https://exemplo.com.br/docs/taxonomia-eventos',
      checkpoints: [
        { name: 'Taxonomia de eventos aprovada com o time de dados', dueOff: -7, done: true, memberId: larissa.id },
        { name: 'Migrar pixels de mídia para server-side', dueOff: 3 },
        { name: 'QA de ponta a ponta com dupla contagem', dueOff: 10, memberId: larissa.id },
      ],
      comments: [
        { memberId: larissa.id, content: 'Dupla contagem no evento de signup resolvida — dashboards batem com o banco agora.' },
      ],
    },
    {
      name: 'Programa de indicação com recompensa dupla',
      frenteId: fIndicacao.id, memberId: camila.id, status: IniciativaStatus.EM_ANDAMENTO, priority: Priority.URGENTE,
      startOff: -10, days: 18, launchOff: 4, okrId: krPorNome.get('Levar o fator K de indicação de 0,18 para 0,45'),
      docLink: 'https://exemplo.com.br/docs/programa-indicacao',
      checkpoints: [
        { name: 'Mecânica de recompensa definida (dá 1 mês, ganha 1 mês)', dueOff: -4, done: true },
        { name: 'Página de convite + deep link instrumentados', dueOff: 2, memberId: bruno.id },
        { name: 'Anúncio in-app para a base ativa', dueOff: 4 },
      ],
    },
    {
      name: 'SEO programático: landing por caso de uso',
      frenteId: fAquisicao.id, memberId: sofia.id, status: IniciativaStatus.EM_ANDAMENTO, priority: Priority.ALTA,
      startOff: -21, days: 42, okrId: krPorNome.get('Reduzir o CAC blended de R$ 95 para R$ 60'),
      checkpoints: [
        { name: '20 primeiras páginas publicadas', dueOff: -8, done: true },
        { name: 'Interlinking automático entre casos de uso', dueOff: 6 },
      ],
    },
    {
      name: 'Onboarding self-serve com setup guiado',
      frenteId: fAtivacao.id, memberId: diego.id, status: IniciativaStatus.EM_ANDAMENTO, priority: Priority.ALTA,
      startOff: -7, days: 21, okrId: krPorNome.get('Reduzir o time-to-value mediano de 18 para 5 minutos'),
      docLink: 'https://exemplo.com.br/docs/onboarding-self-serve',
      checkpoints: [
        { name: 'Mapa do momento de valor por persona', dueOff: -2, done: true, memberId: rafael.id },
        { name: 'Protótipo navegável validado com 5 usuários', dueOff: 4 },
      ],
      comments: [
        { memberId: rafael.id, content: 'Persona "gestor" chega ao valor por outro caminho — vale um fluxo dedicado no passo 2.' },
      ],
    },
    {
      name: 'Motor de lifecycle por comportamento (e-mail + push)',
      frenteId: fRetencao.id, memberId: camila.id, status: IniciativaStatus.EM_ANDAMENTO, priority: Priority.MEDIA,
      startOff: -5, days: 30, okrId: krPorNome.get('Reduzir o churn mensal para 3% (média mensal)'),
    },
    {
      name: 'Dashboard north star em tempo real',
      frenteId: fAquisicao.id, memberId: larissa.id, status: IniciativaStatus.CONCLUIDA, priority: Priority.MEDIA,
      startOff: -30, days: 18, launchOff: -9, resultado: ResultadoFinal.SUCESSO,
      docLink: 'https://exemplo.com.br/dashboards/north-star',
    },
    {
      name: 'Score de leads por produto (PQL)',
      frenteId: fMonetizacao.id, memberId: larissa.id, status: IniciativaStatus.BACKLOG, priority: Priority.MEDIA,
      startOff: 14, days: 21, okrId: krPorNome.get('Crescer o MRR de R$ 210 mil para R$ 320 mil'),
    },
    {
      name: 'Revisão do mix de mídia e teste de 2 canais novos',
      frenteId: fAquisicao.id, memberId: sofia.id, status: IniciativaStatus.PAUSADA, priority: Priority.BAIXA,
      startOff: -18, days: 25,
    },
    {
      name: 'Central de aprendizados de experimentos',
      frenteId: fAtivacao.id, memberId: rafael.id, status: IniciativaStatus.EM_ANDAMENTO, priority: Priority.MEDIA,
      startOff: -3, days: 14, launchOff: 9,
    },
    {
      name: 'Alertas de anomalia no funil de conversão',
      frenteId: fMonetizacao.id, memberId: bruno.id, status: IniciativaStatus.BACKLOG, priority: Priority.ALTA,
      startOff: 7, days: 14,
    },
  ];
  const iniPorNome = new Map<string, string>();
  for (const i of iniciativas) {
    const row = await ensureIniciativa(qAtual.id, i);
    iniPorNome.set(i.name, row.id);
  }

  // Uma iniciativa "atravessada" do quarter passado (aparece no roadmap com o toggle).
  await ensureIniciativa(qPassado.id, {
    name: 'Fundação de dados: warehouse + camada de métricas',
    frenteId: fAquisicao.id, memberId: bruno.id, status: IniciativaStatus.CONCLUIDA, priority: Priority.ALTA,
    startOff: -70, days: 45, resultado: ResultadoFinal.SUCESSO,
  });

  console.log('🧪 Experimentos (kanban completo por ICE)...');
  const experimentos: ExpSeed[] = [
    {
      name: 'Checklist de primeiros passos com barra de progresso',
      frenteId: fAtivacao.id, memberId: diego.id, status: ExperimentoStatus.EM_ANDAMENTO,
      I: 5, C: 4, E: 3, okrId: krPorNome.get('Aumentar a ativação D1 de 34% para 55%'),
      hypothesis: 'Se mostrarmos um checklist com progresso no primeiro acesso, mais usuários completam o setup porque o próximo passo fica óbvio.',
      metric: 'Ativação D1 (setup completo em 24h)',
      startOff: -6, days: 14,
      checkpoints: [{ name: 'Variante B no ar para 50% do tráfego', dueOff: -1, done: true }],
      comments: [{ memberId: larissa.id, content: 'Amostra chega a 8k usuários na sexta — dá pra ler com 95% de confiança.' }],
    },
    {
      name: 'Signup em 2 campos (e-mail + senha depois)',
      frenteId: fAquisicao.id, memberId: sofia.id, status: ExperimentoStatus.EM_ANDAMENTO,
      I: 5, C: 5, E: 3, okrId: krPorNome.get('Sustentar conversão visitante→signup em 4,5% (média mensal)'),
      hypothesis: 'Reduzir o formulário para 2 campos aumenta a conversão da página de signup sem degradar a qualidade do lead.',
      metric: 'Conversão visitante→signup',
      startOff: -4, days: 10,
    },
    {
      name: 'Paywall contextual após a 3ª ação de valor',
      frenteId: fMonetizacao.id, memberId: rafael.id, status: ExperimentoStatus.AGUARDANDO_RESULTADOS,
      I: 5, C: 3, E: 3, okrId: krPorNome.get('Crescer o MRR de R$ 210 mil para R$ 320 mil'),
      hypothesis: 'Exibir o paywall logo após o usuário repetir a ação de valor 3 vezes converte melhor que o paywall por tempo.',
      metric: 'Conversão trial→pago',
      startOff: -12, days: 12, launchOff: 2,
    },
    {
      name: 'Convite a colegas no momento pós-aha',
      frenteId: fIndicacao.id, memberId: camila.id, status: ExperimentoStatus.EM_ANDAMENTO,
      I: 4, C: 4, E: 2, okrId: krPorNome.get('Levar o fator K de indicação de 0,18 para 0,45'),
      hypothesis: 'Pedir a indicação logo depois do primeiro sucesso (não no onboarding) aumenta a taxa de convites enviados.',
      metric: 'Convites enviados por usuário ativado',
      startOff: -2, days: 12,
    },
    {
      name: 'E-mail D3 com casos de uso da persona',
      frenteId: fRetencao.id, memberId: camila.id, status: ExperimentoStatus.RELATORIO_PRONTO,
      I: 4, C: 3, E: 4, resultado: ResultadoFinal.SUCESSO,
      hypothesis: 'Um e-mail no dia 3 com casos de uso da persona reengaja quem não voltou desde o primeiro acesso.',
      metric: 'Retorno D3–D7 do coorte de signup',
      startOff: -20, days: 10,
      comments: [{ memberId: helena.id, content: '+12% de retorno D7 no grupo tratado. Vamos apresentar na weekly e promover a régua padrão.' }],
    },
    {
      name: 'Preço anual com 2 meses grátis no upgrade',
      frenteId: fMonetizacao.id, memberId: helena.id, status: ExperimentoStatus.RESULTADOS_APRESENTADOS,
      I: 5, C: 3, E: 4, resultado: ResultadoFinal.PARCIAL,
      hypothesis: 'Oferecer o plano anual com desconto no momento do upgrade aumenta o ticket médio sem derrubar a conversão.',
      metric: 'Ticket médio e conversão do checkout',
      startOff: -28, days: 14,
    },
    {
      name: 'Push de reativação D7 com deep link',
      frenteId: fRetencao.id, memberId: bruno.id, status: ExperimentoStatus.RESULTADOS_APRESENTADOS,
      I: 3, C: 3, E: 4, resultado: ResultadoFinal.FALHA,
      hypothesis: 'Push no D7 com deep link para o último projeto traria de volta usuários dormentes.',
      metric: 'Reativação do coorte D7',
      startOff: -30, days: 10,
      comments: [{ memberId: rafael.id, content: 'Opt-in de push é só 22% — canal fraco pra esse coorte. Aprendizado registrado na central.' }],
    },
    {
      name: 'Prova social na página de preços (logos + números)',
      frenteId: fMonetizacao.id, memberId: sofia.id, status: ExperimentoStatus.BACKLOG,
      I: 4, C: 4, E: 5,
      hypothesis: 'Logos de clientes e métricas de resultado na página de preços aumentam a conversão para o trial.',
      metric: 'Conversão página de preços→trial',
      startOff: 7, days: 10,
    },
    {
      name: 'Tour interativo vs. vídeo no primeiro acesso',
      frenteId: fAtivacao.id, memberId: diego.id, status: ExperimentoStatus.BACKLOG,
      I: 4, C: 3, E: 5,
      hypothesis: 'Um tour interativo supera o vídeo de boas-vindas em conclusão do onboarding.',
      metric: 'Conclusão do onboarding',
      startOff: 10, days: 14,
    },
    {
      name: 'Landing dedicada por canal pago',
      frenteId: fAquisicao.id, memberId: sofia.id, status: ExperimentoStatus.BACKLOG,
      I: 3, C: 4, E: 5,
      hypothesis: 'Mensagem consistente entre anúncio e landing reduz o CPA nos canais pagos.',
      metric: 'CPA por canal',
      startOff: 12, days: 12,
    },
    {
      name: 'Badge de "resposta em 1h" no chat de vendas',
      frenteId: fMonetizacao.id, memberId: rafael.id, status: ExperimentoStatus.ARQUIVADO,
      I: 2, C: 2, E: 4,
      hypothesis: 'Sinalizar SLA de resposta no chat aumentaria o início de conversas de venda.',
      metric: 'Conversas iniciadas no chat',
      startOff: -25, days: 7,
    },
    {
      name: 'Reordenar navegação para destacar o relatório-chave',
      frenteId: fRetencao.id, memberId: diego.id, status: ExperimentoStatus.ARQUIVADO,
      I: 2, C: 3, E: 5,
      hypothesis: 'Colocar o relatório mais usado no topo da navegação aumentaria o uso semanal.',
      metric: 'WAU do relatório-chave',
      startOff: -22, days: 7,
    },
  ];
  const expPorNome = new Map<string, string>();
  for (const e of experimentos) {
    const row = await ensureExperimento(qAtual.id, e);
    expPorNome.set(e.name, row.id);
  }

  console.log('🌴 Ausências...');
  await ensureAusencia(diego.id, addDays(SEMANA, 3), {
    type: AusenciaType.FERIAS,
    endDate: new Date(addDays(SEMANA, 4).getTime() + 86399000),
    notes: 'Emenda de feriado',
  });
  await ensureAusencia(sofia.id, addDays(SEMANA, 18), {
    type: AusenciaType.FERIAS,
    endDate: new Date(addDays(SEMANA, 29).getTime() + 86399000),
    notes: 'Férias planejadas',
  });
  await ensureAusencia(bruno.id, addDays(SEMANA, -9), {
    type: AusenciaType.LICENCA_MEDICA,
    endDate: new Date(addDays(SEMANA, -7).getTime() + 86399000),
  });
  await ensureAusencia(larissa.id, addDays(SEMANA, 8), {
    type: AusenciaType.OUTROS,
    endDate: new Date(addDays(SEMANA, 8).getTime() + 86399000),
    notes: 'Conferência de dados',
  });

  console.log('✅ Ações da semana...');
  await ensureAcao('Fechar leitura do teste do checklist com dados', {
    responsavelId: larissa.id, inicioOff: 3, fimOff: 4,
    experimentoId: expPorNome.get('Checklist de primeiros passos com barra de progresso'),
  });
  await ensureAcao('Revisar copy da página de convite com a marca', {
    responsavelId: camila.id, inicioOff: 1, fimOff: 2,
    iniciativaId: iniPorNome.get('Programa de indicação com recompensa dupla'),
  });
  await ensureAcao('Publicar runbook do tracking server-side', {
    responsavelId: bruno.id, inicioOff: 0, fimOff: 1, completed: true,
    iniciativaId: iniPorNome.get('Tracking server-side com taxonomia única de eventos'),
  });
  await ensureAcao('Preparar pauta da weekly com destaques do funil', {
    responsavelId: helena.id, inicioOff: 0, fimOff: 4,
  });

  console.log('📚 Playbook (seções + links)...');
  const sProcessos = await ensureSecaoPlaybook('Processos', 0);
  const sFerramentas = await ensureSecaoPlaybook('Ferramentas', 1);
  const sDashboards = await ensureSecaoPlaybook('Dashboards', 2);

  await ensureLinkPlaybook('Playbook de experimentos', {
    subtitle: 'Da hipótese ao relatório: o rito completo de um teste',
    url: 'https://exemplo.com.br/playbook/experimentos', iconName: 'FlaskConical', sectionId: sProcessos.id,
  });
  await ensureLinkPlaybook('Guia do ICE score', {
    subtitle: 'Como pontuar impacto, confiança e esforço sem viés',
    url: 'https://exemplo.com.br/playbook/ice', iconName: 'Target', sectionId: sProcessos.id,
  });
  await ensureLinkPlaybook('Pauta da weekly de growth', {
    subtitle: 'Estrutura do ritual semanal: métricas, bloqueios e decisões',
    url: 'https://exemplo.com.br/playbook/weekly', iconName: 'CalendarRange', sectionId: sProcessos.id,
  });
  await ensureLinkPlaybook('Central de aprendizados', {
    subtitle: 'Todos os experimentos já rodados, com resultado e leitura',
    url: 'https://exemplo.com.br/aprendizados', iconName: 'BookOpen', sectionId: sProcessos.id,
  });
  await ensureLinkPlaybook('Calculadora de amostra para testes A/B', {
    subtitle: 'Tamanho de amostra e duração mínima antes de ligar o teste',
    url: 'https://exemplo.com.br/ferramentas/calculadora-ab', iconName: 'Code', sectionId: sFerramentas.id,
  });
  await ensureLinkPlaybook('Biblioteca de benchmarks', {
    subtitle: 'Referências de conversão e retenção por etapa do funil',
    url: 'https://exemplo.com.br/ferramentas/benchmarks', iconName: 'Compass', sectionId: sFerramentas.id,
  });
  await ensureLinkPlaybook('Dashboard north star', {
    subtitle: 'Métrica norte, funil AARRR e coortes em tempo real',
    url: 'https://exemplo.com.br/dashboards/north-star', iconName: 'LayoutDashboard', sectionId: sDashboards.id,
  });
  await ensureLinkPlaybook('Painel de experimentos ativos', {
    subtitle: 'Status e leitura parcial de todos os testes no ar',
    url: 'https://exemplo.com.br/dashboards/experimentos', iconName: 'Monitor', sectionId: sDashboards.id,
  });

  console.log('');
  console.log('✅ Seed concluída (aditiva — nada foi apagado ou sobrescrito).');
  console.log(`- ${created.membros} membros · ${created.frentes} frentes · ${created.quarters} quarters`);
  console.log(`- ${created.objetivos} objetivos · ${created.krs} KRs (${created.krUpdates} updates)`);
  console.log(`- ${created.iniciativas} iniciativas · ${created.experimentos} experimentos · ${created.checkpoints} checkpoints · ${created.comentarios} comentários`);
  console.log(`- ${created.ausencias} ausências · ${created.acoes} ações · ${created.secoesPlaybook} seções e ${created.linksPlaybook} links de playbook`);
  console.log('Itens que já existiam foram mantidos como estavam.');
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
