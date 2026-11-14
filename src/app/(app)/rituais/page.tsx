import type { Metadata } from "next";
import { CalendarDays, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { Card } from "@/components/shared/Card";
import { ReviewQuarterFilter } from "@/components/rituais/ReviewQuarterFilter";
import { getWeeklyActivity } from "@/actions/weekly-activity";
import { getActiveExperiments } from "@/actions/rituais";
import { getQuarters } from "@/actions/quarters";
import { getTeamMembers } from "@/actions/team-members";
import { getCurrentMember } from "@/lib/session";
import { WeeklyByMember } from "@/components/rituais/WeeklyByMember";
import { ExperimentsByStage } from "@/components/rituais/ExperimentsByStage";
import { WeeklyFilters } from "@/components/rituais/WeeklyFilters";
import { FiqueLigado } from "@/components/rituais/FiqueLigado";
import { WeeklyAusencias } from "@/components/rituais/WeeklyAusencias";
import { getAvisoDaSemana } from "@/actions/weekly-aviso";
import { getWeeklyFocus } from "@/actions/weekly-focus";
import { getAcoesDaSemana } from "@/actions/acoes-semana";
import { getAusencias } from "@/actions/ausencias";
import { getFrentes } from "@/actions/frentes";
import {
  formatDayMonth,
  parseISODateUTC,
  startOfWeekMondayUTC,
  toISODateUTC,
  weekRangeUTC,
  semanaDoRitualAtual,
  horariosDaSemana,
  nomeDoDia,
  formatMinuto,
} from "@/lib/date-utils";
import { lerVigenciasDoRitual } from "@/lib/horario-do-ritual-db";
import { fecharSemanasVencidas, lerRegistroDaSemana, registrarDaWeekly } from "@/lib/registro-semanal-db";
import { anotarSemanaAberta, itensDaSemanaFechada } from "@/lib/registro-semanal";
import { monthLabel } from "@/lib/okr";

export const metadata: Metadata = {
  title: "Rituais | Sala de Growth",
  description: "Visões recorrentes do time: o foco da semana e os experimentos ativos.",
};

export default async function RituaisPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; quarter?: string; month?: string; week?: string }>;
}) {
  const { view, quarter, month, week } = await searchParams;
  const activeView = view === "experimentos" ? "experimentos" : "weekly";

  let content: React.ReactNode;
  // O filtro de quarter só existe na Review semanal — a Weekly é recortada por
  // semana, não por quarter.
  let quarterFilter: React.ReactNode = null;
  // Cards de contexto da semana (recados + ausências); só existem na Weekly.
  let weeklyTopCards: React.ReactNode = null;
  if (activeView === "weekly") {
    const [members, quarters, membroAtual, vigencias] = await Promise.all([
      getTeamMembers(),
      getQuarters(),
      getCurrentMember(),
      lerVigenciasDoRitual(),
    ]);

    // Os três filtros se encaixam: o quarter recorta os meses, o mês recorta
    // as semanas, e a semana é o que a visão mostra. Sem param, tudo cai no
    // "hoje" — e, se hoje está fora do quarter escolhido, no começo dele.
    const hoje = new Date();
    const doParam = quarters.find((q) => q.id === quarter);
    const doHoje = quarters.find(
      (q) => new Date(q.startDate) <= hoje && hoje <= new Date(q.endDate)
    );
    const quarterAtual = doParam ?? doHoje ?? quarters.find((q) => q.isActive) ?? quarters[0];

    const todasSemanas = quarterAtual
      ? listarSemanas(quarterAtual.startDate, quarterAtual.endDate)
      : [];
    const meses = mesesDoQuarter(todasSemanas);
    // A semana do ritual em andamento, no fuso do time (o dyno roda em UTC).
    // Ela vira no fechamento (sexta às 15:00, no padrão — configurável em
    // /configuracoes/rituais), e daí até domingo o que acontece já é da
    // semana seguinte.
    const semanaDeHoje = toISODateUTC(semanaDoRitualAtual(new Date(), vigencias));

    const mesDeHoje = todasSemanas.find((w) => w.value === semanaDeHoje)?.month;
    // Sem semana na URL, a semana de hoje manda — inclusive no mês, senão um
    // mês antigo na URL levava a visão para o passado sem ninguém pedir.
    const mesPedido = week ? meses.find((m) => m.value === month)?.value : undefined;
    const mesSelecionado =
      mesPedido ??
      (mesDeHoje && meses.find((m) => m.value === mesDeHoje)?.value) ??
      meses.find((m) => m.value === month)?.value ??
      meses[0]?.value ??
      "";

    const weeks = todasSemanas.filter((w) => w.month === mesSelecionado);
    const semanaSelecionada =
      weeks.find((w) => w.value === week)?.value ??
      weeks.find((w) => w.value === semanaDeHoje)?.value ??
      weeks[0]?.value ??
      semanaDeHoje;

    // Escolher um mês precisa levar uma semana junto: sem `week` na URL, o mês
    // do param é ignorado (regra acima) e o filtro travava no mês de hoje.
    // Cai na semana de hoje se ela é do mês, senão na primeira dele.
    const semanaDoMes = Object.fromEntries(
      meses.map((m) => {
        const doMes = todasSemanas.filter((w) => w.month === m.value);
        return [m.value, doMes.find((w) => w.value === semanaDeHoje)?.value ?? doMes[0]?.value];
      })
    );

    // Comentários e ausências pendurados na MESMA semana que a visão mostra:
    // trocar o filtro troca os dois junto com a lista de itens. O recorte é
    // calculado aqui (e não lido de `weekly`) para tudo sair num round-trip só
    // — antes as ausências esperavam a busca da semana terminar.
    const { weekStart, nextWeekEnd } = weekRangeUTC(
      parseISODateUTC(semanaSelecionada) ?? undefined
    );
    const [weekly, , aviso, ausencias, focos, acoes, todasFrentes] = await Promise.all([
      getWeeklyActivity(undefined, semanaSelecionada),
      // Semana que passou do fechamento congela antes de qualquer leitura.
      fecharSemanasVencidas(),
      getAvisoDaSemana(semanaSelecionada),
      getAusencias({ rangeStart: weekStart, rangeEnd: nextWeekEnd }),
      getWeeklyFocus(semanaSelecionada),
      getAcoesDaSemana(semanaSelecionada),
      getFrentes(),
    ]);

    // Registro da semana: o que a Weekly mostra fica anotado (só na semana
    // aberta), e a tela lê o registro para mostrar o que saiu dela. Semana
    // fechada vem inteira da foto do fechamento; semana de antes do registro
    // existir segue como sempre foi, pelo estado atual.
    await registrarDaWeekly(weekly, weekStart);
    const { registros, fechada } = await lerRegistroDaSemana(weekStart, {
      verQuemExcluiu: membroAtual.role === "LIDERANCA",
    });
    const nomes = new Map(members.map((m) => [m.id, m.name]));
    const itensDaSemana =
      registros.length === 0
        ? weekly
        : fechada
          ? itensDaSemanaFechada(registros, nomes)
          : anotarSemanaAberta(weekly, registros, nomes);
    const semanaFechada = registros.length > 0 && fechada;
    const horarios = horariosDaSemana(weekStart, vigencias);
    // Só frentes ativas: arquivada não recebe trabalho novo. Uma ação que já
    // aponta para frente arquivada continua no grupo dela — o grupo nasce do
    // que a ação diz, não desta lista.
    const frentesAtivas = todasFrentes
      .filter((f) => f.isActive)
      .map((f) => ({ id: f.id, name: f.name }));
    const activeMembers = members
      .filter((m) => m.isActive && m.role !== "VISITANTE")
      .map((m) => ({ id: m.id, name: m.name }));
    // Quem o botão de nova ausência pode escolher: liderança marca para
    // qualquer pessoa, colaborador só para si, visitante não vê o botão. É a
    // mesma regra que createAusencia aplica no servidor.
    const membrosParaAusencia =
      membroAtual.role === "VISITANTE"
        ? []
        : members
            .filter((m) => m.isActive && m.role !== "VISITANTE")
            .filter((m) => membroAtual.role === "LIDERANCA" || m.id === membroAtual.id)
            .map((m) => ({ id: m.id, name: m.name, isActive: m.isActive }));
    quarterFilter = (
      <WeeklyFilters
        quarters={quarters}
        selectedQuarterId={quarterAtual?.id ?? ""}
        months={meses}
        selectedMonth={mesSelecionado}
        weekForMonth={semanaDoMes}
        weeks={weeks}
        selectedWeek={semanaSelecionada}
        currentWeek={semanaDeHoje}
      />
    );
    weeklyTopCards = (
      <div className="flex flex-col gap-4">
        {/* Rótulo da semana: vale para os cards de contexto e para a lista de
            pessoas, por isso fica logo abaixo dos filtros. */}
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Semana de{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {formatDayMonth(weekly.weekStart)}
          </span>{" "}
          a{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {formatDayMonth(weekly.weekEnd)}
          </span>{" "}
          {semanaFechada
            ? ` · semana fechada ${nomeDoDia(horarios.fechamentoDia)} às ${formatMinuto(horarios.fechamentoMinuto)}. A lista é a foto do fechamento.`
            : " · iniciativas e experimentos que cada pessoa está tocando."}
        </p>

        {/* Contexto da semana, lado a lado: o aviso do time + quem falta. É o
            par que se lê antes de descer para as linhas das pessoas. */}
        <div className="grid gap-4 md:grid-cols-2 items-stretch">
          <FiqueLigado
            weekOf={semanaSelecionada}
            aviso={aviso}
            // O recado é da semana: fechada, ele fica como foi deixado.
            podeEditar={membroAtual.role !== "VISITANTE" && !semanaFechada}
          />
          <WeeklyAusencias
            ausencias={ausencias}
            weekStart={weekly.weekStart}
            weekEnd={weekly.weekEnd}
            nextWeekStart={weekly.nextWeekStart}
            nextWeekEnd={weekly.nextWeekEnd}
            membrosParaAusencia={membrosParaAusencia}
          />
        </div>
      </div>
    );
    content = (
      <WeeklyByMember
        members={activeMembers}
        iniciativas={itensDaSemana.iniciativas}
        experimentos={itensDaSemana.experimentos}
        semanaFechada={semanaFechada}
        weekStart={weekly.weekStart}
        weekEnd={weekly.weekEnd}
        weekOf={semanaSelecionada}
        focos={focos}
        acoes={acoes}
        frentes={frentesAtivas}
        ausencias={ausencias}
        currentMember={{ id: membroAtual.id, role: membroAtual.role }}
      />
    );
  } else {
    const [member, quarters, active] = await Promise.all([
      getCurrentMember(),
      getQuarters(),
      getActiveExperiments(quarter),
    ]);
    // Visitantes não editam; veem o kanban mas não arrastam.
    const canEdit = member.role !== "VISITANTE";
    // O id vem do quarter que a action de fato resolveu — se o da URL não
    // existir, o select reflete o fallback em vez de ficar fora de sincronia.
    if (active.quarter) {
      quarterFilter = (
        <ReviewQuarterFilter quarters={quarters} selectedQuarterId={active.quarter.id} />
      );
    }
    content = (
      <ExperimentsByStage
        experimentos={active.experimentos}
        iniciativasParaApresentar={active.iniciativasParaApresentar}
        quarter={active.quarter}
        canEdit={canEdit}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* pb-2: 32px separando o cabeçalho do conteúdo; os blocos seguintes
          ficam a 24px — o ritmo de /iniciativas, /ausencias e do dashboard. */}
      <div className="pb-2">
      <PageHeader
        title="Rituais"
        description="Visões recorrentes do time: o foco da semana e os experimentos ativos."
      >
        <SegmentedToggle
          ariaLabel="Alternar visão"
          value={activeView}
          items={[
            // Sem params: a Weekly abre sempre na semana atual.
            { value: "weekly", label: "Weekly", icon: CalendarDays, href: "/rituais?view=weekly" },
            {
              value: "experimentos",
              label: "Review semanal",
              icon: FlaskConical,
              // Volta para a Review semanal preservando o quarter escolhido.
              href: quarter
                ? `/rituais?view=experimentos&quarter=${quarter}`
                : "/rituais?view=experimentos",
            },
          ]}
        />
      </PageHeader>
      </div>

      {/* Barra de filtros no mesmo formato de /iniciativas e /experimentos:
          card raso, dropdowns compactos encostados à direita. */}
      {quarterFilter && (
        <Card className="flex flex-wrap gap-2 items-center justify-end" padding="12px 16px">
          {quarterFilter}
        </Card>
      )}

      {weeklyTopCards}

      {content}
    </div>
  );
}

/**
 * As semanas (segundas) que o quarter cobre, rotuladas pelo intervalo
 * ("31 de ago. – 06 de set.") e marcadas com o mês a que pertencem.
 *
 * A primeira começa na segunda da semana em que o quarter começa, mesmo que
 * ela comece no mês anterior — é a semana real do time. O mês de uma semana é
 * o da quinta-feira, o critério da ISO: assim uma semana partida entre dois
 * meses não aparece nos dois.
 */
function listarSemanas(inicio: Date | string, fim: Date | string) {
  const primeira = startOfWeekMondayUTC(new Date(inicio));
  const ultima = new Date(fim);
  const semanas: { value: string; label: string; month: string }[] = [];
  for (let d = primeira; d <= ultima; d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)) {
    const domingo = new Date(d.getTime() + 6 * 24 * 60 * 60 * 1000);
    const quinta = new Date(d.getTime() + 3 * 24 * 60 * 60 * 1000);
    semanas.push({
      value: toISODateUTC(d),
      label: `${formatDayMonth(d)} – ${formatDayMonth(domingo)}`,
      month: toISODateUTC(quinta).slice(0, 7),
    });
  }
  return semanas;
}

/** Os meses que as semanas do quarter cobrem, na ordem em que acontecem. */
function mesesDoQuarter(semanas: { month: string }[]) {
  const vistos: string[] = [];
  for (const s of semanas) if (!vistos.includes(s.month)) vistos.push(s.month);
  return vistos.map((m) => {
    const [ano, mes] = m.split("-").map(Number);
    return { value: m, label: monthLabel(ano, mes - 1) };
  });
}
