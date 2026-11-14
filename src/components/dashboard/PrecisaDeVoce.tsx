"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleCheck, Eye, EyeOff, ListChecks, Star, Target } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { CardHeader } from "@/components/shared/CardHeader";
import { Badge } from "@/components/shared/Badge";
import { Alert } from "@/components/shared/Alert";
import { EmptyState } from "@/components/shared/EmptyState";
import { FilterPill } from "@/components/shared/FilterPill";
import { ActivityGroupLabel, ActivityItemCard } from "@/components/shared/ActivityItemCard";
import { AnalysisBanner, LaunchBanner } from "@/components/shared/LaunchBanner";
import { WeeklyCheckpoints, type WeeklyCheckpointRow } from "@/components/rituais/WeeklyCheckpoints";
import { AgrupamentoPorTag, AgrupamentoPorTagToggle } from "@/components/rituais/AgrupamentoPorTag";
import { QuickCheckpoint } from "@/components/rituais/QuickCheckpoint";
import { FocoDaSemanaStar } from "@/components/rituais/FocoDaSemanaStar";
import { AcoesDaSemana } from "@/components/rituais/AcoesDaSemana";
import type { AcaoDaSemana } from "@/actions/acoes-semana";
import { familyBg, familyBorder, familyStrong } from "@/lib/statusConfig";

// ─── Tipos (montados no servidor, em dashboard/sections.tsx) ─────────────────

export type PrecisaEntrada = {
  kind: "iniciativa" | "experimento";
  id: string;
  name: string;
  status: string;
  priority: string | null;
  /** "Ana, Bruno" — os outros responsáveis, como a linha "com …" da Weekly. */
  comNomes: string | null;
  banners: { tipo: "lancamento" | "analise"; variant: "semana" | "proxima"; date: Date }[];
  /** Pré-ordem com profundidade, permissões já resolvidas. */
  checkpoints: WeeklyCheckpointRow[];
  foco: boolean;
  podeCriar: boolean;
  memberIds: string[];
  /**
   * Por que o item está aqui além dos checkpoints: análise vencida, relatório
   * pronto, nenhum próximo passo combinado. "erro" pinta em vermelho.
   */
  alertas: { texto: string; tom: "erro" | "neutro" }[];
};

/** KR da pessoa sem atualização há uma semana ou mais. */
export type PrecisaKr = {
  id: string;
  objective: string;
  frente: string;
  /** Dias desde a última atualização; null = nunca atualizado. */
  dias: number | null;
};

export type PrecisaGrupo = {
  chave: "prioridades" | "atrasado" | "hoje" | "semana";
  entradas: PrecisaEntrada[];
  /** Só no grupo de prioridades: as ações marcadas com a estrela. */
  acoes: AcaoDaSemana[];
  /** Só em "Atrasado": KRs da pessoa sem atualização. */
  krs: PrecisaKr[];
};

/** Rodapé "Próxima semana" (só na visão de uma pessoa). */
export type PrecisaProximaSemana = {
  checkpoints: number;
  lancamentos: number;
  analises: number;
  /** A Weekly de Rituais já na semana que vem. */
  href: string;
};

// ─── Preferência do "Ocultar concluídos", por navegador ──────────────────────
//
// useSyncExternalStore e não useEffect + setState: lê o localStorage sem
// render duplo e com valor de servidor fixo (false), que é o que mantém a
// hidratação igual. Sem storage (aba anônima, bloqueio), vale a memória da aba.

const CHAVE_OCULTAR = "dashboard-ocultar-concluidos";
const ouvintes = new Set<() => void>();
let emMemoria = false;

function lerOcultar(): boolean {
  try {
    return localStorage.getItem(CHAVE_OCULTAR) === "1";
  } catch {
    return emMemoria;
  }
}

function gravarOcultar(valor: boolean) {
  emMemoria = valor;
  try {
    localStorage.setItem(CHAVE_OCULTAR, valor ? "1" : "0");
  } catch {
    // Fica só em memória.
  }
  ouvintes.forEach((avisar) => avisar());
}

function assinarOcultar(avisar: () => void) {
  ouvintes.add(avisar);
  // Outra aba mudou a preferência.
  window.addEventListener("storage", avisar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

const ROTULO: Record<PrecisaGrupo["chave"], string> = {
  prioridades: "Prioridades da semana",
  atrasado: "Atrasado",
  hoje: "Hoje",
  semana: "Esta semana",
};

/** A partir de quantos checkpoints de topo o card ganha o botão de recolher. */
const LIMITE_RECOLHER = 3;

// ─── Helpers da lista de checkpoints ─────────────────────────────────────────

/** Fica se está aberto ou se tem algum descendente aberto (contexto do filho). */
function semConcluidos(rows: WeeklyCheckpointRow[]): WeeklyCheckpointRow[] {
  return rows.filter((r, i) => {
    if (!r.isCompleted) return true;
    for (let j = i + 1; j < rows.length && rows[j].depth > r.depth; j++) {
      if (!rows[j].isCompleted) return true;
    }
    return false;
  });
}

/** A lista em blocos: cada checkpoint de topo com os descendentes dele. */
function emBlocos(rows: WeeklyCheckpointRow[]): WeeklyCheckpointRow[][] {
  const blocos: WeeklyCheckpointRow[][] = [];
  for (const r of rows) {
    if (r.depth === 0 || blocos.length === 0) blocos.push([r]);
    else blocos[blocos.length - 1].push(r);
  }
  return blocos;
}

// ─── Card de um item ─────────────────────────────────────────────────────────

function ItemCard({
  entrada,
  ocultarConcluidos,
  recolhido,
  onAlternar,
  weekOf,
  weekEnd,
  dono,
  podeMarcarFoco,
  mostrarEstrela,
}: {
  entrada: PrecisaEntrada;
  ocultarConcluidos: boolean;
  /** Checkpoints recolhidos (todos). Abertos por padrão. */
  recolhido: boolean;
  onAlternar: () => void;
  weekOf: string;
  weekEnd: Date;
  dono: string;
  podeMarcarFoco: boolean;
  mostrarEstrela: boolean;
}) {
  const visiveis = ocultarConcluidos ? semConcluidos(entrada.checkpoints) : entrada.checkpoints;
  // Abertos primeiro, concluídos no fim do card.
  const blocos = emBlocos(visiveis).sort(
    (a, b) => Number(a[0].isCompleted) - Number(b[0].isCompleted)
  );
  // Tudo ou nada: card com muitos checkpoints ganha o botão de recolher, mas
  // nunca mostra só uma parte — "3 de 7" escondia justamente o que faltava ler.
  const recolhivel = blocos.length > LIMITE_RECOLHER;
  const mostrados = recolhivel && recolhido ? [] : blocos.flat();
  // Como na Weekly de Rituais: com checkpoint de tag, o card abre agrupado por
  // tag e ganha o botão de alternar; sem tag, fica como sempre.
  const agrupavel = visiveis.some((l) => (l.tags?.length ?? 0) > 0);

  const estrela = !mostrarEstrela ? undefined : podeMarcarFoco ? (
    <FocoDaSemanaStar
      weekOf={weekOf}
      memberId={dono}
      itemId={entrada.id}
      kind={entrada.kind}
      marcado={entrada.foco}
    />
  ) : entrada.foco ? (
    // Sem permissão de marcar, a estrela ainda é informação.
    <Star
      size={13}
      strokeWidth={2}
      fill="currentColor"
      style={{ color: "var(--butter-strong)" }}
      aria-label="Prioridade da semana"
    />
  ) : undefined;

  const cartao = (
    <ActivityItemCard
      kind={entrada.kind}
      name={entrada.name}
      status={entrada.status}
      statusEditId={entrada.id}
      priority={entrada.kind === "iniciativa" ? entrada.priority : null}
      priorityEditId={entrada.kind === "iniciativa" ? entrada.id : undefined}
      detailId={entrada.id}
      className="group/item"
      afterName={
        // O botão de agrupar ao lado da estrela, como na Weekly.
        estrela || agrupavel ? (
          <>
            {estrela}
            {agrupavel && <AgrupamentoPorTagToggle />}
          </>
        ) : undefined
      }
    >
      {entrada.comNomes && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          com {entrada.comNomes}
        </p>
      )}
      {entrada.alertas.map((a) => (
        <p
          key={a.texto}
          className="text-xs mt-0.5"
          style={{ color: a.tom === "erro" ? "var(--status-late-text)" : "var(--text-muted)" }}
        >
          {a.texto}
        </p>
      ))}
      {entrada.banners.map((b) =>
        b.tipo === "lancamento" ? (
          <LaunchBanner key={b.tipo + b.variant} variant={b.variant} date={b.date} className="mt-1.5" />
        ) : (
          <AnalysisBanner key={b.tipo + b.variant} variant={b.variant} date={b.date} className="mt-1.5" />
        )
      )}
      <WeeklyCheckpoints checkpoints={mostrados} />
      {recolhivel && (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={!recolhido}
          className="block text-[11px] mt-1"
          style={{
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            // Recolhido não há linha de checkpoint acima: alinha com o nome do
            // item. Aberto, alinha com o nome do checkpoint (chevron + caixa).
            padding: recolhido ? 0 : "0 0 0 37px",
            cursor: "pointer",
          }}
        >
          {recolhido ? `Mostrar ${blocos.length} checkpoints` : "Ocultar checkpoints"}
        </button>
      )}
      {entrada.podeCriar && (
        <QuickCheckpoint
          kind={entrada.kind}
          itemId={entrada.id}
          weekEnd={weekEnd}
          memberIds={entrada.memberIds}
        />
      )}
    </ActivityItemCard>
  );
  return agrupavel ? <AgrupamentoPorTag>{cartao}</AgrupamentoPorTag> : cartao;
}

// ─── KR parado ───────────────────────────────────────────────────────────────

/**
 * KR sem atualização. Mesma superfície e anatomia do `ActivityItemCard`
 * (ícone do tipo → nome), que só aceita iniciativa e experimento. A ação é a
 * que já existe: atualizar o progresso na tela de OKRs.
 */
function KrCard({ kr }: { kr: PrecisaKr }) {
  return (
    <Card padding="10px 12px" style={{ borderRadius: "var(--radius-md)", boxShadow: "none" }}>
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        <Target size={13} style={{ color: "var(--brand-primary)", flexShrink: 0 }} />
        <span
          className="text-sm font-medium truncate"
          style={{ color: "var(--text-primary)", flex: "1 1 auto", minWidth: "8rem" }}
        >
          {kr.objective}
        </span>
        <Link
          href="/okrs"
          className="text-xs font-medium shrink-0 transition-colors hover:opacity-80"
          style={{ color: "var(--brand-primary)" }}
        >
          Atualizar progresso
        </Link>
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        KR · {kr.frente}
      </p>
      <p className="text-xs mt-0.5" style={{ color: "var(--status-late-text)" }}>
        {kr.dias === null ? "Nunca atualizado" : `Sem atualização há ${kr.dias} dias`}
      </p>
    </Card>
  );
}

// ─── Card "Precisa de você" ──────────────────────────────────────────────────

/**
 * O resumo do que a pessoa precisa fazer na semana — no lugar do antigo
 * "Esta semana", que listava por frente e deixava para o leitor achar o que
 * estava atrasado.
 *
 * Mesma gramática da Weekly de Rituais de propósito: o card do item é o
 * `ActivityItemCard`, os checkpoints são `WeeklyCheckpoints` (concluir,
 * renomear, remarcar e excluir ali mesmo), a estrela é a do foco da semana e as
 * ações são o `AcoesDaSemana`. O que muda é só a ordem: prioridade primeiro,
 * depois o prazo.
 */
export function PrecisaDeVoce({
  grupos,
  acoesRestantes,
  contagem,
  aviso,
  semanaLabel,
  weekOf,
  weekEnd,
  dono,
  podeMarcarFoco,
  mostrarEstrela,
  podeEditarAcoes,
  acoesFocadas,
  frentes,
  proximaSemana,
}: {
  grupos: PrecisaGrupo[];
  /** Ações sem estrela: o "Também nesta semana" do fim do card. */
  acoesRestantes: AcaoDaSemana[];
  contagem: { prioridades: number; atrasado: number; hoje: number; semana: number };
  /** Aviso das prioridades (mesma regra da Weekly); null = sem aviso. */
  aviso: string | null;
  semanaLabel: string;
  weekOf: string;
  weekEnd: Date;
  /** De quem é o card: a prioridade e as ações são dessa pessoa. */
  dono: string;
  podeMarcarFoco: boolean;
  /**
   * Estrela e grupo de prioridades só com uma pessoa no filtro. Em "Todos" a
   * lista é do time, e a estrela marcaria como prioridade de quem está olhando
   * o item de outra pessoa.
   */
  mostrarEstrela: boolean;
  podeEditarAcoes: boolean;
  acoesFocadas: string[];
  frentes: { id: string; name: string }[];
  proximaSemana: PrecisaProximaSemana | null;
}) {
  const ocultarConcluidos = useSyncExternalStore(assinarOcultar, lerOcultar, () => false);
  const alternarOcultar = () => gravarOcultar(!ocultarConcluidos);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const focadas = new Set(acoesFocadas);

  function alternar(id: string) {
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const filtrarAcoes = (acoes: AcaoDaSemana[]) =>
    ocultarConcluidos ? acoes.filter((a) => !a.concluida) : acoes;

  // Com o filtro ligado, some o card que só tinha checkpoints concluídos — a
  // não ser que ainda diga algo (lançamento, análise, prioridade).
  const gruposVisiveis = grupos
    .map((g) => ({
      ...g,
      entradas: g.entradas.filter(
        (e) =>
          !ocultarConcluidos ||
          e.foco ||
          e.banners.length > 0 ||
          e.alertas.length > 0 ||
          e.checkpoints.length === 0 ||
          e.checkpoints.some((c) => !c.isCompleted)
      ),
      acoes: filtrarAcoes(g.acoes),
    }))
    .filter((g) => g.entradas.length > 0 || g.acoes.length > 0 || g.krs.length > 0);

  const restantes = filtrarAcoes(acoesRestantes);
  const vazio = gruposVisiveis.length === 0 && restantes.length === 0;

  const resumo = [
    { n: contagem.prioridades, rotulo: contagem.prioridades === 1 ? "prioridade" : "prioridades", familia: "butter" as const },
    { n: contagem.atrasado, rotulo: contagem.atrasado === 1 ? "atrasado" : "atrasados", familia: "peach" as const },
    { n: contagem.hoje, rotulo: "para hoje", familia: "sky" as const },
    { n: contagem.semana, rotulo: "nesta semana", familia: "neutral" as const },
  ].filter((r) => r.n > 0);

  return (
    <Card padding={28} className="h-full flex flex-col" style={{ borderRadius: "var(--radius-lg)" }}>
      <CardHeader
        icon={ListChecks}
        title="Precisa de você"
        subtitle={`${mostrarEstrela ? "Prioridades da semana primeiro; o resto, por prazo" : "Por prazo"} · ${semanaLabel}`}
        className="mb-4"
        actions={
          // O mesmo FilterPill do painel de checkpoints (CheckpointSection).
          <FilterPill
            active={ocultarConcluidos}
            onClick={alternarOcultar}
            icon={ocultarConcluidos ? <EyeOff size={12} /> : <Eye size={12} />}
          >
            {ocultarConcluidos ? "Concluídos ocultos" : "Ocultar concluídos"}
          </FilterPill>
        }
      />

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {resumo.map((r) => (
            <Badge
              key={r.rotulo}
              bg={familyBg(r.familia)}
              color={familyStrong(r.familia)}
              borderColor={familyBorder(r.familia)}
            >
              <span className="font-mono tabular-nums font-bold">{r.n}</span>
              {r.rotulo}
            </Badge>
          ))}
        </div>
      )}

      {aviso && (
        <Alert variant="warning" className="mb-4">
          {aviso}
        </Alert>
      )}

      {vazio ? (
        <EmptyState
          icon={CircleCheck}
          title="Tudo em dia"
          description="Nada atrasado nem vencendo esta semana."
          density="compact"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {gruposVisiveis.map((g) => (
            <div key={g.chave} className="flex flex-col gap-2">
              <ActivityGroupLabel>
                <span className="inline-flex items-center gap-1.5">
                  {g.chave === "prioridades" && (
                    <Star
                      size={12}
                      strokeWidth={2}
                      fill="currentColor"
                      style={{ color: "var(--butter-strong)" }}
                      aria-hidden="true"
                    />
                  )}
                  {ROTULO[g.chave]} · {g.entradas.length + g.acoes.length + g.krs.length}
                </span>
              </ActivityGroupLabel>
              {g.krs.map((kr) => (
                <KrCard key={kr.id} kr={kr} />
              ))}
              {g.entradas.map((e) => (
                <ItemCard
                  key={`${e.kind}-${e.id}`}
                  entrada={e}
                  ocultarConcluidos={ocultarConcluidos}
                  recolhido={recolhidos.has(e.id)}
                  onAlternar={() => alternar(e.id)}
                  weekOf={weekOf}
                  weekEnd={weekEnd}
                  dono={dono}
                  podeMarcarFoco={podeMarcarFoco}
                  mostrarEstrela={mostrarEstrela}
                />
              ))}
              {g.acoes.length > 0 && (
                <AcoesDaSemana
                  acoes={g.acoes}
                  weekOf={weekOf}
                  memberId={dono}
                  focadas={focadas}
                  podeEditar={podeEditarAcoes}
                  frentes={frentes}
                  comRotulo={false}
                  comCriar={false}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ações sem estrela, no fim: elas não têm dia, então não entram nos
          grupos de prazo. O componente da Weekly também é onde se cria ação. */}
      <div
        className={vazio ? "" : "mt-4 pt-4"}
        style={vazio ? undefined : { borderTop: "1px solid var(--border-subtle)" }}
      >
        <AcoesDaSemana
          acoes={restantes}
          weekOf={weekOf}
          memberId={dono}
          focadas={focadas}
          podeEditar={podeEditarAcoes}
          frentes={frentes}
        />
      </div>

      {proximaSemana && (
        <div
          className="mt-4 pt-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Próxima semana: {resumoDaProxima(proximaSemana)}
          </span>
          <Link
            href={proximaSemana.href}
            className="text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--brand-primary)" }}
          >
            Ver na Weekly
          </Link>
        </div>
      )}
    </Card>
  );
}

/** "3 checkpoints · 1 lançamento" — some o que estiver zerado. */
function resumoDaProxima(p: PrecisaProximaSemana): string {
  const partes: string[] = [];
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  if (p.checkpoints > 0) partes.push(plural(p.checkpoints, "checkpoint", "checkpoints"));
  if (p.lancamentos > 0) partes.push(plural(p.lancamentos, "lançamento", "lançamentos"));
  if (p.analises > 0) partes.push(plural(p.analises, "análise", "análises"));
  return partes.length > 0 ? partes.join(" · ") : "nada combinado ainda";
}
