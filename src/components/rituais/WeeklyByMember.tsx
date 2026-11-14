import { Card } from "@/components/shared/Card";
import { Avatar } from "@/components/shared/Avatar";
import { ActivityGroupLabel, ActivityItemCard } from "@/components/shared/ActivityItemCard";
import { AnalysisBanner, LaunchBanner } from "@/components/shared/LaunchBanner";
import { Star } from "lucide-react";
import { Alert } from "@/components/shared/Alert";
import { QuickCheckpoint } from "./QuickCheckpoint";
import { FocoDaSemanaStar } from "./FocoDaSemanaStar";
import { AcoesDaSemana } from "./AcoesDaSemana";
import type { AcaoDaSemana } from "@/actions/acoes-semana";
import { getAusenciaLabel } from "@/components/shared/AusenciaTypeBadge";
import { formatMemberFirstNames } from "@/lib/members";
import type { FocoDaSemana } from "@/actions/weekly-focus";
import { RotuloPill, WeeklyCheckpoints, type WeeklyCheckpointRow } from "./WeeklyCheckpoints";
import { AgrupamentoPorTag, AgrupamentoPorTagToggle } from "./AgrupamentoPorTag";
import { resumir, rotulosDoRegistro, type AnotacaoDoRegistro, type ResumoDaSemana } from "@/lib/registro-semanal";
import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";
import {
  agruparPorFrente,
  checkpointDaWeekly,
  comAncestrais,
  ordenarPorTag,
  emAndamentoNaSemana,
  estaAtrasado,
  HIDDEN_STATUS,
  type Entrada,
  type FlatCheckpoint,
  type TaggedItem,
} from "@/lib/weekly-grouping";
import { hasOwnershipAccess } from "@/lib/session";
import type { MemberRole } from "@/generated/prisma/enums";

type Member = { id: string; name: string };



/**
 * Achata a árvore mantendo um nó SE ele mesmo satisfaz `pred` OU algum
 * descendente satisfaz — do contrário um filho que cai na semana aparecia
 * sozinho, sem o pai acima dele (o pai só é filtrado pela própria data, que
 * pode estar fora da semana mesmo com um subcheckpoint nela). É a mesma regra
 * que o detalhe da iniciativa/experimento já aplica ao esconder itens
 * concluídos: o ancestral fica visível para dar contexto, mesmo sem qualificar
 * sozinho. Um filho que não qualifica nem tem descendente que qualifique
 * continua fora, como antes.
 */
function achatarComAncestrais(
  cps: CheckpointItem[],
  pred: (cp: CheckpointItem) => boolean,
  depth = 0
): FlatCheckpoint[] {
  const out: FlatCheckpoint[] = [];
  for (const cp of cps) {
    const filhos = achatarComAncestrais(cp.children ?? [], pred, depth + 1);
    if (pred(cp) || filhos.length > 0) {
      out.push({ cp, depth });
      out.push(...filhos);
    }
  }
  return out;
}


/**
 * O resumo da pessoa na semana, pelo registro: o que ela tinha com prazo na
 * semana e como terminou. É a pergunta da reunião de sexta.
 */
function ResumoDaPessoa({ resumo }: { resumo: ResumoDaSemana }) {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Resumo da semana">
      {resumo.total > 0 && (
        <RotuloPill rotulo={{ texto: `${resumo.concluidos} de ${resumo.total} concluídos`, familia: "sage" }} />
      )}
      {resumo.remarcados > 0 && (
        <RotuloPill rotulo={{ texto: plural(resumo.remarcados, "remarcado", "remarcados"), familia: "butter" }} />
      )}
      {resumo.abertos > 0 && (
        <RotuloPill rotulo={{ texto: plural(resumo.abertos, "aberto", "abertos"), familia: "neutral" }} />
      )}
      {resumo.entraram > 0 && (
        <RotuloPill
          rotulo={{ texto: `+${resumo.entraram} ${resumo.entraram === 1 ? "entrou" : "entraram"} na semana`, familia: "sky" }}
        />
      )}
      {resumo.excluidos > 0 && (
        <RotuloPill rotulo={{ texto: plural(resumo.excluidos, "excluído", "excluídos"), familia: "neutral" }} />
      )}
    </div>
  );
}

/** "2 itens · 3 ações" — some o que estiver zerado; nada, vira "sem itens". */
function contagem(itens: number, acoes: number): string {
  const partes: string[] = [];
  if (itens > 0) partes.push(`${itens} ${itens === 1 ? "item" : "itens"}`);
  if (acoes > 0) partes.push(`${acoes} ${acoes === 1 ? "ação" : "ações"}`);
  return partes.length > 0 ? partes.join(" · ") : "sem itens";
}

/**
 * Permissão de edição na Weekly: visitante nunca; fora disso vale a regra de
 * ownership das actions (liderança em tudo, colaborador no que responde ou no
 * que não tem responsável).
 */
function podeMexer(
  member: { id: string; role: MemberRole },
  ownerIds: Array<string | null | undefined>
): boolean {
  return member.role !== "VISITANTE" && hasOwnershipAccess(member, ownerIds);
}

export function WeeklyByMember({
  members,
  iniciativas,
  experimentos,
  weekStart,
  weekEnd,
  weekOf,
  focos,
  acoes,
  frentes,
  ausencias,
  currentMember,
  semanaFechada = false,
}: {
  members: Member[];
  iniciativas: WeeklyItem[];
  experimentos: WeeklyItem[];
  weekStart: Date;
  weekEnd: Date;
  /** Segunda-feira da semana exibida, "yyyy-mm-dd" — a chave do foco. */
  weekOf: string;
  /** Prioridades já marcadas na semana, de todas as pessoas. */
  focos: FocoDaSemana[];
  /** Ações da semana (trabalho recorrente e miúdo), de todas as pessoas. */
  acoes: AcaoDaSemana[];
  /** Frentes ativas: opções para criar e mover ação. */
  frentes: { id: string; name: string }[];
  /** Ausências que cruzam a semana — quem está fora não é cobrado. */
  ausencias: { memberId: string; type: string; startDate: Date | string; endDate: Date | string }[];
  /**
   * Quem está olhando. O atalho de criar checkpoint segue a mesma regra da
   * action: visitante nunca; liderança em qualquer item; colaborador só nos
   * itens sob sua responsabilidade (ou sem responsável). Mostrar o atalho para
   * todo mundo daria erro só depois do Enter, no item de outra pessoa.
   */
  currentMember: { id: string; role: MemberRole };
  /**
   * A semana fechou (no fechamento do ritual) e a lista vem da foto do registro: nada
   * se edita — mexer hoje não pode reescrever o passado.
   */
  semanaFechada?: boolean;
}) {
  const all: TaggedItem[] = [
    ...iniciativas.map((i) => ({ ...i, kind: "iniciativa" as const })),
    ...experimentos.map((e) => ({ ...e, kind: "experimento" as const })),
  ].filter((item) => !HIDDEN_STATUS.has(item.status));

  // Só agrupamos sob membros "visíveis" (a página já exclui visitantes e inativos).
  // Item sem responsável — ou só de gente que não aparece (visitante/inativo) —
  // fica fora da visão: não há linha de pessoa onde encaixá-lo (ver o `continue`
  // no laço abaixo).
  //
  // Item com vários responsáveis aparece sob CADA um deles: a pergunta do ritual
  // é "o que essa pessoa está tocando?", e a resposta inclui o que ela divide.
  // A contagem por pessoa, portanto, soma mais que o total de itens da semana.
  //
  // O checkpoint tem responsável próprio, e é ele que manda: um checkpoint da
  // Camila num experimento do Rafael é trabalho da Camila, aparece na linha
  // dela — e some da dele. Checkpoint sem responsável fica com quem responde
  // pelo item, que é quem responde por ele na prática.
  // Quem está fora, e desde quando: a ausência que cobre a SEMANA INTEIRA
  // isenta a pessoa da cobrança de prioridade (cobrar quem está de férias é
  // ruído que ninguém pode resolver). A ausência parcial só marca a linha.
  const foraDaSemana = new Map<string, { tipo: string; todaSemana: boolean }>();
  for (const a of ausencias) {
    const ini = new Date(a.startDate).getTime();
    const fim = new Date(a.endDate).getTime();
    if (ini > weekEnd.getTime() || fim < weekStart.getTime()) continue;
    const todaSemana = ini <= weekStart.getTime() && fim >= weekEnd.getTime();
    const atual = foraDaSemana.get(a.memberId);
    // Uma pessoa pode ter duas ausências na semana; a que cobre tudo manda.
    if (!atual || (todaSemana && !atual.todaSemana)) {
      foraDaSemana.set(a.memberId, { tipo: a.type, todaSemana });
    }
  }

  // Ações por pessoa: cada uma só vê as suas na própria linha.
  const acoesPorPessoa = new Map<string, AcaoDaSemana[]>();
  for (const a of acoes) {
    const lista = acoesPorPessoa.get(a.responsavelId) ?? [];
    lista.push(a);
    acoesPorPessoa.set(a.responsavelId, lista);
  }

  // "pessoa:item" — o mesmo item pode ser foco de uma pessoa e não de outra.
  const focados = new Set(focos.map((f) => f.memberId + ":" + f.itemId));
  // As ações marcadas, por pessoa: a linha de ação só precisa saber das suas.
  const focadosPorPessoa = new Map<string, Set<string>>();
  for (const f of focos) {
    if (f.kind !== "acao") continue;
    const set = focadosPorPessoa.get(f.memberId) ?? new Set<string>();
    set.add(f.itemId);
    focadosPorPessoa.set(f.memberId, set);
  }
  // Quem marca a prioridade: a própria pessoa ou liderança (regra da action).
  // Vale também para as ações da linha. Na semana fechada, ninguém: a estrela
  // e as ações viram leitura, como os checkpoints.
  const podeMarcarFoco = (memberId: string) =>
    !semanaFechada &&
    currentMember.role !== "VISITANTE" &&
    (currentMember.role === "LIDERANCA" || currentMember.id === memberId);

  const allowedIds = new Set(members.map((m) => m.id));
  const byMember = new Map<string, Entrada[]>();
  // O registro de cada pessoa: só os checkpoints DELA (não os ancestrais que
  // entram de contexto), para o resumo não contar o trabalho de outro.
  const registroPorPessoa = new Map<string, Map<string, AnotacaoDoRegistro>>();

  function adicionar(mapa: Map<string, Entrada[]>, memberId: string, entrada: Entrada) {
    const list = mapa.get(memberId) ?? [];
    list.push(entrada);
    mapa.set(memberId, list);
  }

  for (const item of all) {
    const owners = item.members.filter((m) => allowedIds.has(m.id)).map((m) => m.id);
    // O atrasado entra junto com o da semana: some da lista só quando alguém
    // fecha ou remarca — não por virar a segunda-feira. E o em andamento
    // (começou antes, vence depois) também: é trabalho desta semana.
    // O que veio do registro é da semana por definição — inclusive o que
    // saiu dela (remarcado, excluído): é isso que a sexta precisa ver. E em
    // ordem alfabética de tag: o card se lê por tema (ver ordenarPorTag).
    const daSemana = achatarComAncestrais(
      ordenarPorTag(item.checkpoints),
      (cp) => !!cp.registro || checkpointDaWeekly(cp, weekStart, weekEnd)
    );

    // Checkpoints por pessoa: os com responsável vão para ele; os sem herdam
    // do ancestral mais próximo que tenha responsável, e só na falta dele
    // caem em quem responde pelo item. Subcheckpoint sem dono de um
    // checkpoint da Juliana é trabalho da Juliana — ia para a linha de todo
    // responsável do item.
    const cpsPorPessoa = new Map<string, FlatCheckpoint[]>();
    const cpsSemDono: FlatCheckpoint[] = [];
    // donosPorNivel[d] = responsáveis efetivos do último nó visto no nível d.
    // A lista é pré-ordem e sempre traz os ancestrais, então o nível d-1 é o pai.
    const donosPorNivel: string[][] = [];
    for (const f of daSemana) {
      const donos = f.cp.members.filter((m) => allowedIds.has(m.id)).map((m) => m.id);
      const herdados = f.depth > 0 ? (donosPorNivel[f.depth - 1] ?? owners) : owners;
      const destino = donos.length > 0 ? donos : herdados;
      donosPorNivel.length = f.depth;
      donosPorNivel[f.depth] = destino;
      if (destino.length === 0) {
        cpsSemDono.push(f);
        continue;
      }
      for (const id of destino) {
        const list = cpsPorPessoa.get(id) ?? [];
        list.push(f);
        cpsPorPessoa.set(id, list);
      }
    }

    // Cada checkpoint foi para o PRÓPRIO dono. Quem responde só pelo filho
    // ficava com o filho solto, sem o pai que explica de que etapa ele é —
    // o pai tinha ido para a linha de outra pessoa. Os ancestrais entram como
    // contexto na lista de quem tem o descendente.
    for (const [id, lista] of cpsPorPessoa) {
      const doRegistro = registroPorPessoa.get(id) ?? new Map<string, AnotacaoDoRegistro>();
      for (const f of lista) if (f.cp.registro) doRegistro.set(f.cp.id, f.cp.registro);
      registroPorPessoa.set(id, doRegistro);
      cpsPorPessoa.set(id, comAncestrais(daSemana, new Set(lista)));
    }

    // Quem vê o item: quem responde por ele + quem tem checkpoint dele na
    // semana, mesmo sem responder pelo item.
    const pessoas = new Set<string>([...owners, ...cpsPorPessoa.keys()]);
    // Sem ninguém que responda, o item sai da Weekly. A visão é lida pessoa
    // por pessoa numa reunião: um bloco "Sem responsável" no fim não tinha
    // dono para responder por ele e virava lista que ninguém puxava.
    //
    // Cai aqui também o item cujos responsáveis são todos invisíveis nesta
    // visão (visitante ou inativo) — ele TEM responsável, mas nenhum que a
    // Weekly liste, e não há linha onde encaixá-lo.
    if (pessoas.size === 0) continue;
    for (const id of pessoas) {
      adicionar(byMember, id, { item, checkpoints: cpsPorPessoa.get(id) ?? [] });
    }
  }

  // Ordem alfabética, sempre. Ordenar por quantidade de itens fazia as
  // pessoas trocarem de posição de uma semana para a outra — numa reunião,
  // cada um procura a própria linha, e ela precisa estar onde estava.
  const ordered = [...members].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const cards: { key: string; name: string; items: Entrada[] }[] = ordered.map((m) => ({
    key: m.id,
    name: m.name,
    items: byMember.get(m.id) ?? [],
  }));


  return (
    <div className="flex flex-col gap-4">
      {/* A linha "Semana de X a Y" vive na página, logo abaixo dos filtros: ela
          rotula a semana inteira (cards de contexto incluídos), não só a lista
          de pessoas. */}
      {/* Um membro por linha: identidade à esquerda, itens preenchendo a largura. */}
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          /* 12px 16px é o padding de linha de lista do produto (mesmo das barras
             de filtro e dos cards densos); 16px 18px abria ar demais entre as
             pessoas. */
          <Card key={card.key} padding="12px 16px">

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              {/* Identidade do membro */}
              <div className="flex items-center gap-2.5 sm:w-52 sm:shrink-0">
                <Avatar name={card.name} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {card.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {/* A contagem soma as ações: quem tem a semana cheia de
                        acompanhamento aparecia como "sem itens". */}
                    {contagem(card.items.length, (acoesPorPessoa.get(card.key) ?? []).length)}
                  </p>
                  {/* Ausência na própria linha: no card de cima ela fica
                      longe de quem se está lendo. */}
                  {foraDaSemana.get(card.key) && (
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--blush-strong)" }}
                    >
                      {getAusenciaLabel(foraDaSemana.get(card.key)!.tipo)}
                      {foraDaSemana.get(card.key)!.todaSemana ? " · semana inteira" : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Iniciativas + experimentos da semana */}
              <div className="flex-1 min-w-0">
                  {(() => {
                    const resumo = resumir([...(registroPorPessoa.get(card.key)?.values() ?? [])]);
                    return resumo && (resumo.total > 0 || resumo.entraram > 0) ? (
                      <div className="mb-2">
                        <ResumoDaPessoa resumo={resumo} />
                      </div>
                    ) : null;
                  })()}
                {/* Nada a mostrar E nada a fazer: só aí a linha fica vazia.
                    Quem pode editar sempre recebe a seção de ações, senão não
                    teria por onde criar a primeira. */}
                {card.items.length === 0 &&
                (acoesPorPessoa.get(card.key) ?? []).length === 0 &&
                !podeMarcarFoco(card.key) ? (
                  <p className="text-xs italic sm:pt-1.5" style={{ color: "var(--text-muted)" }}>
                    Nada nesta semana.
                  </p>
                ) : (
                  /* Coluna única, como no "Precisa de você" do dashboard: cards
                     empilhados dão largura total ao nome do item (em grid de
                     2-3 colunas o nome truncava cedo demais ao lado da pill).
                     Dentro da coluna, os itens vêm agrupados por frente. */
                  <div className="flex flex-col gap-3">
                    {(() => {
                      // O combinado do ritual: uma ou duas prioridades por
                      // pessoa. Zero deixa a semana sem foco declarado; três
                      // ou mais é a escolha difícil sendo evitada. Nos dois
                      // casos a página avisa em vez de travar — quem decide é
                      // o time, na reunião.
                      //
                      // A faixa é POR PESSOA, na linha dela: o ritual é lido em
                      // conjunto, e cada um precisa ver a própria cobrança sem
                      // procurar num resumo.
                      //
                      // Fora a semana inteira: cobrança que ninguém pode
                      // resolver.
                      if (foraDaSemana.get(card.key)?.todaSemana) return null;
                      // Semana fechada: cobrar prioridade de uma semana que
                      // já passou é ruído que ninguém pode resolver.
                      if (semanaFechada) return null;
                      // Ação também pode ser prioridade, então conta junto.
                      const marcados =
                        card.items.filter(({ item }) => focados.has(card.key + ":" + item.id))
                          .length +
                        (acoesPorPessoa.get(card.key) ?? []).filter((a) =>
                          focados.has(card.key + ":" + a.id)
                        ).length;
                      // Sem iniciativa nem experimento, a falta de prioridade
                      // não é cobrada: uma semana só de ações pode não ter uma
                      // escolha difícil a fazer. O excesso continua avisado.
                      if (card.items.length === 0 && marcados <= 2) return null;
                      if (marcados === 0) {
                        return (
                          <Alert variant="warning">
                            Sem prioridade da semana. Marque com a estrela até 2 atividades de
                            mais impacto.
                          </Alert>
                        );
                      }
                      if (marcados > 2) {
                        return (
                          <Alert variant="warning">
                            {marcados} prioridades marcadas — o máximo são 2 prioridades na semana.
                          </Alert>
                        );
                      }
                      return null;
                    })()}
                    {agruparPorFrente(
                      card.items,
                      acoesPorPessoa.get(card.key) ?? []
                    ).map((grupo) => (
                      <div key={grupo.id} className="flex flex-col gap-1.5">
                        <ActivityGroupLabel>{grupo.frente}</ActivityGroupLabel>
                        <div className="flex flex-col gap-2">
                    {grupo.itens.map(({ item, checkpoints }) => {
                      const idsDoItem = item.members.map((m) => m.id);
                      // Excluir exige responsabilidade pelo ITEM (é o que a
                      // action checa); trocar a data aceita também quem
                      // responde pelo checkpoint.
                      const podeCriar = podeMexer(currentMember, idsDoItem);
                      const linhasDeCheckpoint: WeeklyCheckpointRow[] = checkpoints.map(
                        ({ cp, depth }) => {
                          const r = cp.registro;
                          // Linha que só existe pelo registro (saiu da semana) ou
                          // semana fechada: é registro, não se edita daqui.
                          const soLeitura = semanaFechada || !!r?.fantasma;
                          const excluido = r?.desfecho === "EXCLUIDO";
                          return {
                          id: cp.id,
                          name: cp.name,
                          categoria: cp.categoria,
                          tags: cp.tags,
                          progressoMarco: cp.progressoMarco,
                          dueDate: cp.dueDate,
                          isCompleted: cp.isCompleted,
                          atrasado: !excluido && estaAtrasado(cp, weekStart),
                          // Remarcado para depois da semana não está "em
                          // andamento" nela: a pill do registro já conta.
                          emAndamento:
                            r?.desfecho !== "REMARCADO" && emAndamentoNaSemana(cp, weekStart, weekEnd),
                          depth,
                          kind: item.kind,
                          podeEditar:
                            !soLeitura &&
                            podeMexer(currentMember, [...idsDoItem, ...cp.members.map((m) => m.id)]),
                          podeExcluir: !soLeitura && podeCriar,
                          rotulos: r ? rotulosDoRegistro(r, weekStart) : undefined,
                          excluido,
                          caminho: r?.fantasma ? r.caminho : null,
                          };
                        }
                      );
                      // Com checkpoint de tag, o card abre agrupado por tag e
                      // ganha o botão de alternar; sem tag, fica como sempre.
                      const agrupavel = linhasDeCheckpoint.some((l) => (l.tags?.length ?? 0) > 0);
                      // Estrela de prioridade: quem pode marca; quem não pode só vê.
                      const estrela =
                        podeMarcarFoco(card.key) ? (
                          <FocoDaSemanaStar
                            weekOf={weekOf}
                            memberId={card.key}
                            itemId={item.id}
                            kind={item.kind}
                            marcado={focados.has(card.key + ":" + item.id)}
                          />
                        ) : focados.has(card.key + ":" + item.id) ? (
                          // Sem permissão de marcar, a estrela ainda é
                          // informação: diz qual é a prioridade da pessoa.
                          <Star
                            size={13}
                            strokeWidth={2}
                            fill="currentColor"
                            style={{ color: "var(--butter-strong)" }}
                            aria-label="Prioridade da semana"
                          />
                        ) : undefined;
                      const cartao = (
                        // Sem chips de responsável: a seção já é da pessoa, e o
                        // chip do co-responsável se lia como se o item fosse
                        // dele — "Marina · 1 item" com a tag "Lucas" ao lado.
                        <ActivityItemCard
                          key={`${item.kind}-${item.id}`}
                          kind={item.kind}
                          name={item.name}
                          status={item.status}
                          statusEditId={semanaFechada ? undefined : item.id}
                          priority={item.kind === "iniciativa" ? item.priority : null}
                          priorityEditId={item.kind === "iniciativa" && !semanaFechada ? item.id : undefined}
                          detailId={item.id}
                          className="group/item"
                          afterName={
                            // O botão de agrupar mora ao lado da estrela: os
                            // dois são controles do card, e no fim da linha
                            // (depois de status e prioridade) se perdia.
                            estrela || agrupavel ? (
                              <>
                                {estrela}
                                {agrupavel && <AgrupamentoPorTagToggle />}
                              </>
                            ) : undefined
                          }
                        >
                          {/* Item com mais de um responsável aparece na linha
                              de cada um. Sem esta linha ele se lê como item
                              exclusivo repetido — parece erro, e a contagem
                              por pessoa passa do total do time. */}
                          {item.members.length > 1 && (
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                              com{" "}
                              {formatMemberFirstNames(
                                item.members.filter((m) => m.id !== card.key)
                              )}
                            </p>
                          )}
                          {/* Faixas de lançamento — mesmo padrão do "Precisa de você" do dashboard. */}
                          {item.launchThisWeek && item.launchDate && (
                            <LaunchBanner variant="semana" date={item.launchDate} className="mt-1.5" />
                          )}
                          {item.launchNextWeek && item.launchDate && (
                            <LaunchBanner variant="proxima" date={item.launchDate} className="mt-1.5" />
                          )}
                          {/* Análise de resultados — mesmo formato, família azul. */}
                          {item.analysisThisWeek && item.analysisDate && (
                            <AnalysisBanner variant="semana" date={item.analysisDate} className="mt-1.5" />
                          )}
                          {item.analysisNextWeek && item.analysisDate && (
                            <AnalysisBanner variant="proxima" date={item.analysisDate} className="mt-1.5" />
                          )}
                          <WeeklyCheckpoints checkpoints={linhasDeCheckpoint} enxuta />
                          {podeCriar && !semanaFechada && (
                            <QuickCheckpoint
                              kind={item.kind}
                              itemId={item.id}
                              weekEnd={weekEnd}
                              memberIds={item.members.map((m) => m.id)}
                            />
                          )}
                        </ActivityItemCard>
                      );
                      return agrupavel ? (
                        <AgrupamentoPorTag key={`${item.kind}-${item.id}`}>{cartao}</AgrupamentoPorTag>
                      ) : (
                        cartao
                      );
                    })}
                          {/* Ações da frente, embaixo dos itens dela. Sem
                              "+ Ação" aqui: criar mora só em "Também nesta
                              semana", senão cada pessoa ganhava um botão por
                              frente. Para pôr uma ação numa frente, cria-se
                              lá e move-se pelo chip da linha. */}
                          {grupo.acoes.length > 0 && (
                            <AcoesDaSemana
                              acoes={grupo.acoes}
                              weekOf={weekOf}
                              memberId={card.key}
                              focadas={focadosPorPessoa.get(card.key)}
                              podeEditar={podeMarcarFoco(card.key)}
                              frentes={frentes}
                              frenteId={grupo.id}
                              comRotulo={false}
                              comCriar={false}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Balde transversal: o que não é de frente nenhuma. */}
                    <AcoesDaSemana
                      acoes={(acoesPorPessoa.get(card.key) ?? []).filter((a) => !a.frente)}
                      weekOf={weekOf}
                      memberId={card.key}
                      focadas={focadosPorPessoa.get(card.key)}
                      podeEditar={podeMarcarFoco(card.key)}
                      frentes={frentes}
                      frenteId={null}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
