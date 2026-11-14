// Seções assíncronas do dashboard. Cada uma busca só a sua fatia de dados e é
// envolvida em <Suspense> na página — assim a casca + esqueletos aparecem na
// hora e cada bloco "pipoca" quando fica pronto, em vez de a tela ficar branca
// até todas as queries terminarem.

import { cache } from "react";
import {
  getAguardandoProximoPasso,
  getAusenciasDaSemana,
  getMarcosDoTime,
  getOKRData,
  getProximaSemanaDaPessoa,
  getTravasDaPessoa,
  getTravasDoTime,
} from "@/actions/dashboard";
import { getWeeklyActivity, type WeeklyActivityResult } from "@/actions/weekly-activity";
import { getAcoesDaSemana } from "@/actions/acoes-semana";
import { getFrentes } from "@/actions/frentes";
import { getWeeklyFocus } from "@/actions/weekly-focus";
import { getTeamMembers } from "@/actions/team-members";
import { getCurrentMember, hasOwnershipAccess } from "@/lib/session";
import { formatDayMonth, hojeUTC, startOfWeekMondayUTC, toISODateUTC, weekRangeUTC } from "@/lib/date-utils";
import { emAndamentoNaSemana, recortarParaPessoa } from "@/lib/weekly-grouping";
import {
  avisoDePrioridades,
  contarPorPessoa,
  diasDesde,
  krParado,
  montarPrecisaDeVoce,
} from "@/lib/precisa-de-voce";
import { formatMemberFirstNames } from "@/lib/members";
import { OKRProgressSection } from "@/components/dashboard/OKRProgressSection";
import {
  PrecisaDeVoce,
  type PrecisaEntrada,
  type PrecisaGrupo,
  type PrecisaKr,
  type PrecisaProximaSemana,
} from "@/components/dashboard/PrecisaDeVoce";
import { ForaEstaSemana } from "@/components/dashboard/ForaEstaSemana";
import { TravasDoTime, type LinhaDoTime } from "@/components/dashboard/TravasDoTime";
import { AguardandoProximoPasso } from "@/components/dashboard/AguardandoProximoPasso";
import { MarcosDoTime } from "@/components/dashboard/MarcosDoTime";
import { Block } from "@/components/shared/Skeleton";

// Várias seções leem a mesma semana, os mesmos OKRs, as mesmas ausências e as
// mesmas travas. `cache` faz cada consulta rodar uma vez por request, por mais
// seções que a usem.
//
// A semana vem sempre do time inteiro, como na Weekly de Rituais: o filtro de
// pessoa é o recorte em memória (`recortarParaPessoa`). Filtrar na consulta
// perdia o item que chega à pessoa só por herança — o subcheckpoint sem dono
// de um checkpoint dela, num item que não é dela.
const semanaDoTime = cache(() => getWeeklyActivity());
// Quem a Weekly lista: ativo e não visitante. Responsável fora disso não conta.
const visiveisDoTime = cache(async () => {
  const membros = await getTeamMembers();
  return new Set(membros.filter((m) => m.isActive && m.role !== "VISITANTE").map((m) => m.id));
});
/** A semana e o recorte prontos para `itensDaSemana`. */
const semanaDe = cache(async () => {
  const [w, visiveis] = await Promise.all([semanaDoTime(), visiveisDoTime()]);
  return { w, visiveis };
});
const okrsDe = cache((quarterId: string, memberId?: string) => getOKRData(quarterId, memberId));
const ausenciasDaSemana = cache(() => getAusenciasDaSemana());
const travasDoTime = cache(() => getTravasDoTime());

/**
 * Os itens da semana como a linha da pessoa na Weekly de Rituais (ou a Weekly
 * inteira, sem pessoa): só os checkpoints dela (os ancestrais ficam de
 * contexto), com as mesmas regras de lá — ver `recortarParaPessoa`. A
 * consulta traz o item inteiro, de qualquer responsável, e sem este recorte o
 * filtro de pessoa daqui dava uma resposta diferente da de lá.
 */
function itensDaSemana(
  { w, visiveis }: { w: WeeklyActivityResult; visiveis: Set<string> },
  memberId?: string
) {
  const recortar = <T extends Parameters<typeof recortarParaPessoa>[0]>(itens: T[]) =>
    itens
      .map((i) => recortarParaPessoa(i, w.weekStart, w.weekEnd, memberId, visiveis))
      .filter((i): i is T => i !== null);
  return [
    ...recortar(w.iniciativas).map((i) => ({ ...i, kind: "iniciativa" as const })),
    ...recortar(w.experimentos).map((e) => ({ ...e, kind: "experimento" as const })),
  ];
}

// ─── Visão da pessoa (esquerda): precisa de você ─────────────────────────────
export async function PrecisaDeVoceSection({
  memberId,
  quarterId,
}: {
  memberId?: string;
  /** Quarter da tela: os KRs parados da pessoa são os dele. */
  quarterId: string;
}) {
  // Ação é trabalho pessoal (o "TH", o "1:1"): o card mostra as de UMA
  // pessoa, nunca as do time todo. Sem filtro de responsável no dashboard, a
  // pessoa é quem está olhando — despejar as tarefas miúdas de dez pessoas
  // aqui afogaria as iniciativas da semana.
  //
  // Tudo num round-trip: ações, foco e frentes não dependem da busca da
  // semana, e o dono só depende do membro atual (memoizado no render, não
  // custa outra consulta).
  // Mesma semana que a busca usa (weekRangeUTC, no fuso do time).
  const weekOf = toISODateUTC(startOfWeekMondayUTC(hojeUTC()));
  const [semana, membroAtual, acoes, focos, todasFrentes, travas, okrData, proxima] = await Promise.all([
    semanaDe(),
    getCurrentMember(),
    getCurrentMember().then((m) => getAcoesDaSemana(weekOf, memberId ?? m.id)),
    getWeeklyFocus(weekOf),
    getFrentes(),
    // As travas (sem próximo passo, análise vencida, KR parado) e o rodapé
    // da próxima semana são da pessoa: em "Todos" não há de quem sejam.
    memberId ? getTravasDaPessoa(memberId) : null,
    memberId ? okrsDe(quarterId) : null,
    memberId ? getProximaSemanaDaPessoa(memberId) : null,
  ]);
  const dono = memberId ?? membroAtual.id;
  const itens = itensDaSemana(semana, memberId);

  // A prioridade da semana é por pessoa. Em "Todos" não há de quem ela seja:
  // a estrela marcaria o item de outra pessoa como prioridade de quem olha.
  const mostrarEstrela = memberId !== undefined;
  const focosDoDono = mostrarEstrela ? focos.filter((f) => f.memberId === dono) : [];
  const focados = new Set(focosDoDono.map((f) => f.itemId));
  const acoesFocadas = new Set(focosDoDono.filter((f) => f.kind === "acao").map((f) => f.itemId));

  const hoje = hojeUTC();
  const montado = montarPrecisaDeVoce(itens, { hoje, focados });

  // Permissões com a regra das actions, resolvidas aqui para o card não
  // oferecer um controle que só falharia depois do clique (como na Weekly).
  const podeMexer = (ownerIds: string[]) =>
    membroAtual.role !== "VISITANTE" && hasOwnershipAccess(membroAtual, ownerIds);

  function paraEntrada(e: (typeof montado.semana)[number]): PrecisaEntrada {
    const { item } = e;
    const idsDoItem = item.members.map((m) => m.id);
    const outros = item.members.filter((m) => m.id !== dono);
    const banners: PrecisaEntrada["banners"] = [];
    if (item.launchDate && (item.launchThisWeek || item.launchNextWeek)) {
      banners.push({ tipo: "lancamento", variant: item.launchThisWeek ? "semana" : "proxima", date: item.launchDate });
    }
    if (item.analysisDate && (item.analysisThisWeek || item.analysisNextWeek)) {
      banners.push({ tipo: "analise", variant: item.analysisThisWeek ? "semana" : "proxima", date: item.analysisDate });
    }
    return {
      kind: item.kind,
      id: item.id,
      name: item.name,
      status: item.status,
      priority: item.priority,
      // Só quando divide o item: com um responsável só, a linha diria o óbvio.
      comNomes: item.members.length > 1 && outros.length > 0 ? formatMemberFirstNames(outros) : null,
      banners,
      checkpoints: e.checkpoints.map(({ cp, depth }) => ({
        id: cp.id,
        name: cp.name,
        categoria: cp.categoria,
        tags: cp.tags,
        progressoMarco: cp.progressoMarco,
        dueDate: cp.dueDate,
        isCompleted: cp.isCompleted,
        depth,
        // Contra o dia, não contra a segunda-feira: é o "Atrasado" do card.
        atrasado: !cp.isCompleted && new Date(cp.dueDate).getTime() < hoje.getTime(),
        // Vence depois da semana: a linha diz "até dd/mm", como na Weekly.
        emAndamento: emAndamentoNaSemana(cp, semana.w.weekStart, semana.w.weekEnd),
        kind: item.kind,
        podeEditar: podeMexer([...idsDoItem, ...cp.members.map((m) => m.id)]),
        podeExcluir: podeMexer(idsDoItem),
      })),
      foco: e.foco,
      podeCriar: podeMexer(idsDoItem),
      memberIds: idsDoItem,
      alertas: [],
    };
  }

  // ── Travas da pessoa ──────────────────────────────────────────────────────
  // Item que já está na semana ganha o alerta no próprio card; o que não está
  // entra como card novo, no grupo do alerta. Assim nada aparece duas vezes.
  const entradas = {
    prioridades: montado.prioridades.map(paraEntrada),
    atrasado: montado.atrasado.map(paraEntrada),
    hoje: montado.hoje.map(paraEntrada),
    semana: montado.semana.map(paraEntrada),
  };
  const contagem = { ...montado.contagem };
  const jaNaLista = new Map(
    Object.values(entradas).flat().map((e) => [`${e.kind}:${e.id}`, e])
  );

  type ItemDaTrava = {
    id: string;
    name: string;
    status: string;
    priority: string | null;
    kind: "iniciativa" | "experimento";
    members: { id: string; name: string }[];
  };
  function marcar(item: ItemDaTrava, alerta: PrecisaEntrada["alertas"][number], grupo: "atrasado" | "semana") {
    const existente = jaNaLista.get(`${item.kind}:${item.id}`);
    if (existente) {
      existente.alertas.push(alerta);
      return;
    }
    const idsDoItem = item.members.map((m) => m.id);
    const outros = item.members.filter((m) => m.id !== dono);
    const nova: PrecisaEntrada = {
      kind: item.kind,
      id: item.id,
      name: item.name,
      status: item.status,
      priority: item.priority,
      comNomes: item.members.length > 1 && outros.length > 0 ? formatMemberFirstNames(outros) : null,
      banners: [],
      checkpoints: [],
      foco: focados.has(item.id),
      podeCriar: podeMexer(idsDoItem),
      memberIds: idsDoItem,
      alertas: [alerta],
    };
    jaNaLista.set(`${item.kind}:${item.id}`, nova);
    (nova.foco ? entradas.prioridades : entradas[grupo]).push(nova);
    contagem[grupo]++;
  }

  for (const p of travas?.parados ?? []) {
    const exp = { ...p, kind: "experimento" as const, priority: null };
    if (p.status === "AGUARDANDO_RESULTADOS" && p.analysisDate) {
      marcar(exp, { texto: `Análise de resultados venceu em ${formatDayMonth(p.analysisDate)}`, tom: "erro" }, "atrasado");
    } else {
      marcar(exp, { texto: "Relatório pronto, falta apresentar no ritual", tom: "neutro" }, "semana");
    }
  }
  for (const item of travas?.semProximoPasso ?? []) {
    marcar(item, { texto: "Sem próximo passo: nenhum checkpoint aberto", tom: "neutro" }, "semana");
  }
  // Marco em risco: a data dele não fecha com o que falta entregar. Vai para
  // "Atrasado" — é o mesmo tipo de urgência, só que anunciada antes.
  for (const { item, marco, resumo } of travas?.marcosEmRisco ?? []) {
    marcar(item, { texto: `Marco "${marco.name}" em risco: ${resumo}`, tom: "erro" }, "atrasado");
  }

  const krs: PrecisaKr[] = (okrData?.okrs ?? [])
    .filter((o) => o.members.some((m) => m.id === dono) && krParado(o.lastUpdatedAt, hoje))
    .map((o) => ({ id: o.id, objective: o.objective, frente: o.frente.name, dias: diasDesde(o.lastUpdatedAt, hoje) }));
  contagem.atrasado += krs.length;

  const proximaSemana: PrecisaProximaSemana | null = proxima
    ? {
        checkpoints: proxima.checkpoints,
        lancamentos: itens.filter((i) => i.launchNextWeek).length,
        analises: itens.filter((i) => i.analysisNextWeek).length,
        href: `/rituais?view=weekly&week=${proxima.weekOf}`,
      }
    : null;

  const grupos: PrecisaGrupo[] = [
    {
      chave: "prioridades" as const,
      entradas: entradas.prioridades,
      acoes: acoes.filter((a) => acoesFocadas.has(a.id)),
      krs: [],
    },
    { chave: "atrasado" as const, entradas: entradas.atrasado, acoes: [], krs },
    { chave: "hoje" as const, entradas: entradas.hoje, acoes: [], krs: [] },
    { chave: "semana" as const, entradas: entradas.semana, acoes: [], krs: [] },
  ].filter((g) => g.entradas.length > 0 || g.acoes.length > 0 || g.krs.length > 0);

  const prioridades = entradas.prioridades.length + acoesFocadas.size;
  const podeMarcarFoco =
    membroAtual.role !== "VISITANTE" &&
    (membroAtual.role === "LIDERANCA" || membroAtual.id === dono);

  const semanaLabel = `${formatDayMonth(semana.w.weekStart)} – ${formatDayMonth(semana.w.weekEnd)}`;

  // Só ativas: frente arquivada não recebe trabalho novo.
  const frentes = todasFrentes.filter((f) => f.isActive).map((f) => ({ id: f.id, name: f.name }));

  return (
    <PrecisaDeVoce
      grupos={grupos}
      acoesRestantes={acoes.filter((a) => !acoesFocadas.has(a.id))}
      contagem={{ prioridades, ...contagem }}
      // O aviso cobra a pessoa — só faz sentido na visão dela, e para quem
      // pode resolver.
      aviso={mostrarEstrela && podeMarcarFoco ? avisoDePrioridades(prioridades, itens.length > 0) : null}
      semanaLabel={semanaLabel}
      weekOf={weekOf}
      weekEnd={semana.w.weekEnd}
      dono={dono}
      podeMarcarFoco={podeMarcarFoco}
      mostrarEstrela={mostrarEstrela}
      // Mesma regra do servidor (ver permitirPara em acoes-semana): a própria
      // pessoa, ou liderança em qualquer uma. Antes eu havia restringido a
      // edição aqui à própria pessoa, e o resultado foi caixa de seleção morta
      // para a liderança olhando o dashboard filtrado de alguém — a mesma ação
      // que ela concluiria sem problema na Weekly.
      podeEditarAcoes={
        membroAtual.role !== "VISITANTE" &&
        (dono === membroAtual.id || membroAtual.role === "LIDERANCA")
      }
      acoesFocadas={[...acoesFocadas]}
      frentes={frentes}
      proximaSemana={proximaSemana}
    />
  );
}

export function PrecisaDeVoceSkeleton() {
  return <Block style={{ height: 320 }} aria-busy="true" />;
}

// ─── Visão da liderança (esquerda): onde o time está travando ────────────────
export async function TravasDoTimeSection({
  quarterId,
  quarterQuery,
}: {
  quarterId: string;
  /** "&quarter=…" para o link de cada pessoa manter o quarter da tela. */
  quarterQuery: string;
}) {
  const [semana, membros, travas, { okrs }, ausencias] = await Promise.all([
    semanaDe(),
    getTeamMembers(),
    travasDoTime(),
    okrsDe(quarterId),
    ausenciasDaSemana(),
  ]);
  const hoje = hojeUTC();
  const ausenciaDe = new Map(ausencias.map((a) => [a.member.id, a.type]));

  const semPasso = contarPorPessoa(travas.semProximoPasso);
  const krs = contarPorPessoa(okrs.filter((o) => krParado(o.lastUpdatedAt, hoje)));

  // Visitante não tem trabalho próprio; inativo já saiu do time.
  const linhas: LinhaDoTime[] = membros
    .filter((m) => m.isActive && m.role !== "VISITANTE")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((m) => {
      const { contagem } = montarPrecisaDeVoce(itensDaSemana(semana, m.id), { hoje, focados: new Set() });
      return {
        id: m.id,
        name: m.name,
        ausencia: ausenciaDe.get(m.id) ?? null,
        atrasados: contagem.atrasado,
        semana: contagem.hoje + contagem.semana,
        semProximoPasso: semPasso.get(m.id) ?? 0,
        krsParados: krs.get(m.id) ?? 0,
        href: `/dashboard?responsavel=${m.id}${quarterQuery}`,
      };
    });

  // O total do cabeçalho é do time, sem repetir o item dividido entre duas
  // pessoas — a soma das linhas passaria dele.
  const totalAtrasados = montarPrecisaDeVoce(itensDaSemana(semana), { hoje, focados: new Set() }).contagem
    .atrasado;

  return <TravasDoTime linhas={linhas} totalAtrasados={totalAtrasados} />;
}

export async function AguardandoProximoPassoSection() {
  const itens = await getAguardandoProximoPasso();
  return <AguardandoProximoPasso itens={itens} hoje={hojeUTC()} />;
}

export async function MarcosDoTimeSection() {
  const marcos = await getMarcosDoTime();
  return <MarcosDoTime marcos={marcos} hoje={hojeUTC()} weekEnd={weekRangeUTC().weekEnd} />;
}

// ─── Coluna da direita: OKRs ─────────────────────────────────────────────────
export async function OKRSection({
  quarterId,
  memberId,
  quarterStart,
  quarterEnd,
}: {
  quarterId: string;
  memberId?: string;
  quarterStart?: Date | string | null;
  quarterEnd?: Date | string | null;
}) {
  const { okrs, overallProgress } = await okrsDe(quarterId, memberId);
  return (
    <OKRProgressSection
      okrs={okrs}
      overallProgress={overallProgress}
      quarterStart={quarterStart}
      quarterEnd={quarterEnd}
      hoje={hojeUTC()}
    />
  );
}

export function OKRSkeleton() {
  return <Block style={{ height: 320 }} aria-busy="true" />;
}

// ─── Coluna da direita: quem está fora ───────────────────────────────────────
export async function AusenciasSection({
  memberId,
  visaoDoTime,
}: {
  /** Pessoa da visão: o aviso fala dos itens que ela divide com quem está fora. */
  memberId?: string;
  /** Visão da liderança: o aviso fala do atraso de quem está fora. */
  visaoDoTime: boolean;
}) {
  const ausencias = await ausenciasDaSemana();
  const hoje = hojeUTC();
  const avisos: string[] = [];

  // Uma pessoa pode ter duas ausências na semana; o aviso sai uma vez por ela.
  const fora = [...new Map(ausencias.map((a) => [a.member.id, a.member])).values()];

  if (fora.length > 0 && visaoDoTime) {
    const semana = await semanaDe();
    for (const p of fora) {
      const { atrasado } = montarPrecisaDeVoce(itensDaSemana(semana, p.id), { hoje, focados: new Set() })
        .contagem;
      if (atrasado > 0) {
        avisos.push(
          `${p.name.split(" ")[0]} está fora com ${atrasado} ${atrasado === 1 ? "item atrasado" : "itens atrasados"}.`
        );
      }
    }
  } else if (fora.length > 0 && memberId) {
    const itens = itensDaSemana(await semanaDe(), memberId);
    // Na visão de uma pessoa, a lista começa por quem importa para ELA: ela
    // mesma, se estiver fora, e depois quem divide itens com ela na semana. O
    // resto do time vem depois, na ordem de sempre.
    const peso = new Map<string, number>();
    for (const p of fora) {
      if (p.id === memberId) {
        peso.set(p.id, 0);
        avisos.push(`${p.name.split(" ")[0]} está fora nesta semana.`);
        continue;
      }
      const divididos = itens.filter((i) => i.members.some((m) => m.id === p.id)).length;
      if (divididos > 0) {
        peso.set(p.id, 1);
        avisos.push(
          // Sem "seus": a liderança também abre o dashboard de outra pessoa.
          `${p.name.split(" ")[0]} é corresponsável em ${divididos} ${divididos === 1 ? "item" : "itens"} desta semana.`
        );
      }
    }
    const ordenadas = [...ausencias].sort(
      (a, b) => (peso.get(a.member.id) ?? 2) - (peso.get(b.member.id) ?? 2)
    );
    return <ForaEstaSemana ausencias={ordenadas} avisos={avisos} />;
  }

  return <ForaEstaSemana ausencias={ausencias} avisos={avisos} />;
}

export function AusenciasSkeleton() {
  return <Block style={{ height: 160 }} aria-busy="true" />;
}
