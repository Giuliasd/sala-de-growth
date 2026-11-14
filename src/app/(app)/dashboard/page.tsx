import { Suspense } from "react";
import { getQuarters } from "@/actions/quarters";
import { getTeamMembers } from "@/actions/team-members";
import { getCurrentMember } from "@/lib/session";
import { MemberRole } from "@/generated/prisma/enums";
import { QuarterSelector } from "@/components/shared/QuarterSelector";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import { Greeting } from "@/components/dashboard/Greeting";
import { OnboardingNotice } from "@/components/dashboard/OnboardingNotice";
import { Card } from "@/components/shared/Card";
import { IconTile } from "@/components/shared/IconTile";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/shared/Alert";
import { hojeUTC } from "@/lib/date-utils";
import type { Metadata } from "next";
import {
  PrecisaDeVoceSection,
  PrecisaDeVoceSkeleton,
  TravasDoTimeSection,
  MarcosDoTimeSection,
  AguardandoProximoPassoSection,
  OKRSection,
  OKRSkeleton,
  AusenciasSection,
  AusenciasSkeleton,
} from "./sections";

export const metadata: Metadata = {
  title: "Dashboard | Sala de Growth",
  description: "Visão consolidada do quarter ativo.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; view?: string; responsavel?: string }>;
}) {
  const { quarter, view, responsavel } = await searchParams;

  // Casca: só dados leves/cacheados (quarters, sessão JWT, membros) ficam no
  // caminho crítico do primeiro byte. As seções pesadas streamam via Suspense.
  const [quarters, member] = await Promise.all([getQuarters(), getCurrentMember()]);

  const activeQuarter = quarters.find((q) => q.isActive);

  // Se não houver quarter ativo, tenta encontrar um que englobe a data de hoje
  const now = new Date();
  const currentByDate = quarters.find((q) => {
    const start = new Date(q.startDate);
    const end = new Date(q.endDate);
    return now >= start && now <= end;
  });

  // Só honra ?quarter= se apontar para um quarter existente — um id obsoleto de
  // bookmark/link não deve renderizar o dashboard com números degradados (o
  // código antigo lançava via findUniqueOrThrow; aqui caímos no quarter padrão).
  const requestedQuarter = quarter ? quarters.find((q) => q.id === quarter) : undefined;
  const selectedQuarterId =
    requestedQuarter?.id || activeQuarter?.id || currentByDate?.id || (quarters.length > 0 ? quarters[0].id : null);

  if (!selectedQuarterId) {
    // Sala ainda sem quarter: em vez do dashboard, mostra o onboarding —
    // checklist de primeiros passos para a liderança, aviso de "em preparação"
    // para o restante do time.
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Dashboard
        </h1>
        <OnboardingNotice role={member.role} />
      </div>
    );
  }

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);

  // Computa o filtro efetivo com base no role
  let effectiveMemberId: string | undefined;
  if (member.role === MemberRole.COLABORADOR) {
    effectiveMemberId = view === "all" ? undefined : member.id;
  } else if (member.role === MemberRole.LIDERANCA) {
    // Liderança abre no próprio usuário — o dia a dia é a própria visão, e a do
    // time todo é uma escolha consciente. "Todos" virou explícito (?view=all),
    // porque a ausência de ?responsavel= agora significa "eu".
    effectiveMemberId = view === "all" ? undefined : (responsavel ?? member.id);
  } else {
    // VISITANTE: sem filtro por padrão (não tem itens próprios para ver),
    // filtra se ?responsavel= estiver presente.
    effectiveMemberId = responsavel ?? undefined;
  }

  // "Todos" fica ativo exatamente quando não há filtro de pessoa — vale para
  // os três roles, independente de qual param levou até aqui.
  const isViewAll = effectiveMemberId === undefined;

  // Liderança olhando o time todo: a pergunta deixa de ser "o que eu faço" e
  // vira "onde o time está travando". Colaborador em "Visão geral" e
  // visitante continuam com o card de pendências (do time, por prazo).
  const visaoDaLideranca = isViewAll && member.role === MemberRole.LIDERANCA;

  // Busca membros apenas para liderança/visitante (para o picker)
  const teamMembers =
    member.role !== MemberRole.COLABORADOR
      ? (await getTeamMembers()).filter((m) => m.isActive)
      : [];

  const firstName = member.name.split(" ")[0];

  const todayFormatted = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const todayDisplay = todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1);

  const quarterLabel = selectedQuarter ? `Q${selectedQuarter.quarter} ${selectedQuarter.year}` : "";

  const quarterPeriod = selectedQuarter
    ? `${new Date(selectedQuarter.startDate as any).toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })} – ${new Date(selectedQuarter.endDate as any).toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })}`
    : "";

  // Quarter marcado como ativo cujo fim já passou (data do time, não do dyno).
  const quarterVencido =
    !!selectedQuarter?.isActive && new Date(selectedQuarter.endDate).getTime() < hojeUTC().getTime();

  return (
    // Ritmo de /iniciativas: 32px separando o cabeçalho do conteúdo (o pb-2
    // abaixo) e 24px entre os blocos. O uniforme de 32px daqui deixava ar
    // sobrando entre seções que se leem juntas.
    <div className="space-y-6">
      {/* ── Header (estático, pinta imediatamente) ──────────────── */}
      <div className="space-y-4 pb-2">
        <div>
          <Greeting name={firstName} />
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {todayDisplay}
          </p>
        </div>

        {/* Quarter info + filtro + selector */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {selectedQuarter && (
              <Card
                className="flex items-center gap-3"
                padding="10px 16px"
                style={{ borderRadius: "var(--radius-md)" }}
              >
                <IconTile icon={CalendarDays} size={32} iconSize={15} />
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Quarter atual
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {quarterLabel}
                    {quarterPeriod && (
                      <span className="font-normal ml-1.5" style={{ color: "var(--text-secondary)" }}>
                        · {quarterPeriod}
                      </span>
                    )}
                  </p>
                </div>
                {selectedQuarter.isActive && (
                  <span
                    className="text-xs font-medium px-2 py-0.5"
                    style={{
                      background: "var(--status-done-bg)",
                      color: "var(--status-done-text)",
                      borderRadius: "var(--radius-full)",
                    }}
                  >
                    Ativo
                  </span>
                )}
              </Card>
            )}
          </div>
          {/* Os dois filtros andam juntos, à direita: responsável antes do
              quarter, na ordem em que se pensa a pergunta ("quem", "quando"). */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <DashboardFilterBar
              role={member.role}
              currentMemberId={effectiveMemberId}
              teamMembers={teamMembers}
              isViewAll={isViewAll}
            />
            <QuarterSelector quarters={quarters} selectedQuarterId={selectedQuarterId} />
          </div>
        </div>
      </div>

      {/* ── Quarter ativo que já terminou ───────────────────────────────
          Ninguém vira o quarter sozinho: sem este aviso, OKRs e semanas
          seguem lidos contra o período errado ("92 de 92 dias") até alguém
          notar. Só para a liderança, que é quem pode ativar o próximo. */}
      {quarterVencido && member.role === MemberRole.LIDERANCA && (
        <Alert variant="warning" title={`${quarterLabel} terminou e continua marcado como ativo`}>
          Ative o próximo quarter em{" "}
          <Link href="/configuracoes" className="underline font-medium">
            Configurações
          </Link>{" "}
          para os OKRs e a semana voltarem a ser lidos no período certo.
        </Alert>
      )}

      {/* ── Onboarding (só aparece enquanto a sala não está preparada) ── */}
      <Suspense fallback={null}>
        <OnboardingNotice role={member.role} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Esquerda: o que fazer ─────────────────────────────────────
            Liderança em "Todos" vê o time pessoa por pessoa ("onde puxar
            alguém"); em qualquer outra visão, o card da pessoa. */}
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          {visaoDaLideranca ? (
            <>
              <Suspense fallback={<PrecisaDeVoceSkeleton />}>
                <TravasDoTimeSection
                  quarterId={selectedQuarterId}
                  quarterQuery={quarter && requestedQuarter ? `&quarter=${quarter}` : ""}
                />
              </Suspense>
              {/* Depois de "onde trava", a preparação para o que vem: os
                  marcos da semana e da próxima, com o que falta para cada um. */}
              <Suspense fallback={<PrecisaDeVoceSkeleton />}>
                <MarcosDoTimeSection />
              </Suspense>
              <Suspense fallback={<PrecisaDeVoceSkeleton />}>
                <AguardandoProximoPassoSection />
              </Suspense>
            </>
          ) : (
            <Suspense fallback={<PrecisaDeVoceSkeleton />}>
              <PrecisaDeVoceSection memberId={effectiveMemberId} quarterId={selectedQuarterId} />
            </Suspense>
          )}
        </div>

        {/* ── Direita: OKRs pelo ritmo + quem está fora ─────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          <Suspense fallback={<OKRSkeleton />}>
            {/* Liderança acompanha os OKRs do time inteiro: o card ignora o
                filtro de pessoa (que continua valendo para o resto da página). */}
            <OKRSection
              quarterId={selectedQuarterId}
              memberId={member.role === MemberRole.LIDERANCA ? undefined : effectiveMemberId}
              quarterStart={selectedQuarter?.startDate}
              quarterEnd={selectedQuarter?.endDate}
            />
          </Suspense>
          <Suspense fallback={<AusenciasSkeleton />}>
            <AusenciasSection memberId={effectiveMemberId} visaoDoTime={visaoDaLideranca} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
