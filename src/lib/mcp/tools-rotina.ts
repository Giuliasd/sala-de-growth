import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { MemberRole } from "@/generated/prisma/enums"
import { buscarNoApp, type TipoDeResultado } from "@/actions/busca"
import {
  getAguardandoProximoPasso,
  getMarcosDoTime,
  getPrazosVencidos,
  getTravasDaPessoa,
  getTravasDoTime,
} from "@/actions/dashboard"
import { getTeamMembers } from "@/actions/team-members"
import { getAusencias, getConflicts } from "@/actions/ausencias"
import { getEventosDoCalendario } from "@/actions/calendario"
import { FILTROS_PADRAO, filtrarEventos, formatMes, parseMes, TIPOS_DE_EVENTO } from "@/lib/calendario"
import { BUSCA_MIN_GLOBAL } from "@/lib/busca"
import { resumoDoRisco } from "@/lib/checkpoint-marco"
import {
  hojeUTC,
  parseISODateUTC,
  semanaDoRitualAtual,
  startOfWeekMondayUTC,
} from "@/lib/date-utils"
import { lerVigenciasDoRitual } from "@/lib/horario-do-ritual-db"
import { lerRegistroDaSemana } from "@/lib/registro-semanal-db"
import { getAppUrl } from "./app-url"
import { audited, clip, day, fail, ok, people } from "./kit"
import type { McpMember } from "./member-context"

/**
 * Ferramentas "da rotina" do MCP — as perguntas do dia a dia depois de "o que
 * eu tenho essa semana": achar algo por nome, o que está travado, como foi a
 * semana passada, quem está fora. Mesmas regras de tools.ts: só leitura, sobre
 * as actions/leitores que as telas já usam, sem e-mail, tudo auditado.
 */

const readOnly = { readOnlyHint: true, openWorldHint: false } as const

const TIPOS_DE_BUSCA = [
  "iniciativa",
  "experimento",
  "checkpoint",
  "kr",
  "objetivo",
  "acao",
  "comentario",
  "playbook",
] as const satisfies readonly TipoDeResultado[]

/**
 * Qual ferramenta abre o resultado, a partir do link interno da busca. O link
 * é a fonte porque checkpoint, comentário e ação apontam para o item dono.
 */
export function abrirCom(href: string): { ferramenta: string; id?: string; quarterId?: string } | null {
  const item = /^\/(iniciativas|experimentos)\/([0-9a-f-]{36})$/.exec(href)
  if (item) {
    return { ferramenta: item[1] === "iniciativas" ? "ver_iniciativa" : "ver_experimento", id: item[2] }
  }
  const okr = /^\/okrs\?quarter=([0-9a-f-]{36})$/.exec(href)
  if (okr) return { ferramenta: "listar_okrs", quarterId: okr[1] }
  return null
}

/**
 * Tipo de ausência como sai para o Claude. As duas licenças viram só
 * "licença": "licença médica" é dado de saúde, e a pergunta que a ferramenta
 * responde (quem está fora, até quando) não precisa do motivo. As observações
 * da ausência nunca saem.
 */
export function tipoDeAusencia(type: string): string {
  if (type === "FERIAS") return "férias"
  if (type === "DAY_OFF") return "day off"
  if (type.startsWith("LICENCA")) return "licença"
  return "outro"
}

const AUSENCIA_MAX_DIAS = 120

export function registrarFerramentasDaRotina(server: McpServer, member: McpMember): void {
  server.registerTool(
    "buscar",
    {
      title: "Buscar na Sala",
      description:
        "Busca por texto em tudo (a mesma busca do Ctrl+K): iniciativas, experimentos, checkpoints, KRs, objetivos, ações, comentários e links do playbook. Ignora acento e maiúsculas. Devolve até 6 resultados por tipo, os mais recentes; cada um diz qual ferramenta abre o detalhe.",
      inputSchema: {
        texto: z.string().trim().min(BUSCA_MIN_GLOBAL).max(200),
        tipos: z
          .array(z.enum(TIPOS_DE_BUSCA))
          .max(TIPOS_DE_BUSCA.length)
          .optional()
          .describe("Só estes tipos. Omitido: todos."),
      },
      annotations: readOnly,
    },
    (args) =>
      audited(member, "buscar", args, async () => {
        const r = await buscarNoApp(args.texto)
        if (!r.success) return fail(r.error)
        const base = getAppUrl()
        const resultados = r.data
          .filter((x) => !args.tipos || args.tipos.includes(x.tipo))
          .map((x) => ({
            tipo: x.tipo,
            id: x.id,
            titulo: clip(x.titulo, 300),
            onde: clip(x.detalhe, 300),
            link: x.externo ? x.href : `${base}${x.href}`,
            abrirCom: x.externo ? null : abrirCom(x.href),
          }))
        return ok({ total: resultados.length, resultados }, true)
      })
  )

  server.registerTool(
    "o_que_esta_travado",
    {
      title: "O que está travado, parado ou em risco",
      description:
        "Use para \"o que está travado / bloqueado / parado / em risco / pendente / esquecido?\" — já aplica as regras da Sala, não liste e cruze itens por conta própria. Traz: itens ainda em andamento com o prazo final vencido (provavelmente terminaram e não foram fechados, ou estão atrasados), itens em andamento sem nenhum checkpoint aberto (sem próximo passo), experimentos com análise vencida ou relatório pronto esperando apresentação, e marcos em risco (algum checkpoint necessário atrasado ou vencendo depois do marco). Sem argumentos: o de quem pergunta. Com todoTime (só liderança): o time inteiro, mais o que espera espaço no ritual e os marcos das próximas duas semanas com o que falta.",
      inputSchema: {
        memberId: z
          .string()
          .uuid()
          .optional()
          .describe("De quem (id de contexto_da_sala). Omitido: de quem está perguntando. Colaborador só vê o próprio."),
        todoTime: z.boolean().optional().describe("true = visão do time (só liderança)."),
      },
      annotations: readOnly,
    },
    (args) =>
      audited(member, "o_que_esta_travado", args, async () => {
        type Item = {
          id: string
          name: string
          status: string
          kind?: "iniciativa" | "experimento"
          members: { id: string; name: string }[]
          frente?: { name: string }
        }
        const doItem = (i: Item) => ({
          tipo: i.kind ?? "experimento",
          id: i.id,
          nome: i.name,
          status: i.status,
          frente: i.frente?.name ?? null,
          responsaveis: people(i.members).map((p) => p.nome),
        })
        const hojeMs = hojeUTC().getTime()
        const vencidos = (v: Awaited<ReturnType<typeof getPrazosVencidos>>) =>
          v.map((i) => ({
            ...doItem(i),
            fim: day(i.endDate),
            diasVencido: i.endDate ? Math.round((hojeMs - i.endDate.getTime()) / 86_400_000) : null,
            checkpointsAbertos: i._count.checkpoints,
          }))
        const travas = (t: Awaited<ReturnType<typeof getTravasDoTime>>) => ({
          semProximoPasso: t.semProximoPasso.map(doItem),
          analiseParada: t.parados.map((e) => ({ ...doItem(e), analise: day(e.analysisDate) })),
        })

        if (args.todoTime) {
          if (member.role !== MemberRole.LIDERANCA) {
            return fail("A visão do time é só da liderança, como no dashboard. Sem todoTime você vê a sua.")
          }
          const [t, aguardando, marcos, prazos] = await Promise.all([
            getTravasDoTime(),
            getAguardandoProximoPasso(),
            getMarcosDoTime(),
            getPrazosVencidos(),
          ])
          const hoje = hojeUTC().getTime()
          const pendencia = (p: { name: string; dueDate: Date; members: { id: string; name: string }[] }) => ({
            nome: p.name,
            prazo: day(p.dueDate),
            responsaveis: people(p.members).map((x) => x.nome),
          })
          return ok(
            {
              de: "time todo",
              prazoFinalVencido: vencidos(prazos),
              ...travas(t),
              aguardandoProximoPasso: aguardando.map((i) => ({
                ...doItem(i),
                analise: day(i.analysisDate),
                analiseVencida: !!i.analysisDate && i.analysisDate.getTime() < hoje,
              })),
              marcos: marcos.map((m) => ({
                id: m.id,
                nome: m.name,
                prazo: day(m.dueDate),
                diasAtePrazo: Math.round((m.dueDate.getTime() - hoje) / 86_400_000),
                responsaveis: people(m.members).map((p) => p.nome),
                item: { tipo: m.item.kind, id: m.item.id, nome: m.item.name },
                necessarios: m.progresso
                  ? {
                      entregues: m.progresso.entregues,
                      total: m.progresso.total,
                      emRisco: m.progresso.emRisco,
                      risco: m.progresso.emRisco ? resumoDoRisco(m.progresso.riscos) : null,
                      pendentes: m.progresso.pendentes.map(pendencia),
                    }
                  : null,
                subcheckpointsPendentes: m.subPendentes.map(pendencia),
              })),
            },
            true
          )
        }

        const alvo = args.memberId ?? member.id
        const [t, prazos, membros] = await Promise.all([
          getTravasDaPessoa(alvo),
          getPrazosVencidos(alvo),
          getTeamMembers(),
        ])
        return ok(
          {
            de: membros.find((m) => m.id === alvo)?.name ?? "pessoa não encontrada",
            prazoFinalVencido: vencidos(prazos),
            ...travas(t),
            marcosEmRisco: t.marcosEmRisco.map((m) => ({
              marco: { id: m.marco.id, nome: m.marco.name },
              risco: m.resumo,
              item: { tipo: m.item.kind, id: m.item.id, nome: m.item.name },
            })),
          },
          true
        )
      })
  )

  server.registerTool(
    "ver_semana_fechada",
    {
      title: "Ver uma semana que já fechou",
      description:
        "Como uma semana JÁ FECHADA terminou, pelo registro da Weekly dos Rituais (a semana fecha no horário do ritual, por padrão sexta 14:59). Para cada checkpoint que passou pela semana: se era planejado (estava na Weekly até o planejamento) ou entrou depois, e o desfecho — CONCLUIDO, REMARCADO (prazo empurrado para outra semana), ABERTO (não foi entregue), EM_ANDAMENTO (checkpoint longo que segue) ou EXCLUIDO. Inclui quantas vezes cada um já foi remarcado. Sem argumentos: a última semana fechada de quem pergunta. Para a semana em andamento, use ver_semana.",
      inputSchema: {
        semana: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Qualquer dia da semana desejada (yyyy-mm-dd). Omitido: a última semana fechada."),
        memberId: z
          .string()
          .uuid()
          .optional()
          .describe("De quem (id de contexto_da_sala). Omitido: de quem está perguntando."),
        todoTime: z.boolean().optional().describe("true = o time todo (ignora memberId)."),
      },
      annotations: readOnly,
    },
    (args) =>
      audited(member, "ver_semana_fechada", args, async () => {
        const vigencias = await lerVigenciasDoRitual()
        const aberta = semanaDoRitualAtual(new Date(), vigencias)
        let weekStart: Date
        if (args.semana) {
          const d = parseISODateUTC(args.semana)
          if (!d) return fail("Data inválida: use yyyy-mm-dd.")
          weekStart = startOfWeekMondayUTC(d)
        } else {
          weekStart = new Date(aberta.getTime() - 7 * 86_400_000)
        }
        if (weekStart.getTime() >= aberta.getTime()) {
          return fail("Essa semana ainda não fechou. Para ela, use ver_semana.")
        }

        // Sem `fecharSemanasVencidas` (que a página de Rituais chama antes de
        // ler): ele GRAVA o congelamento, e o MCP é só leitura. Semana vencida
        // ainda não congelada tem o desfecho calculado pelo leitor com a mesma
        // regra — e como toda edição congela antes de gravar, o resultado é o
        // mesmo do congelamento.
        const [{ registros, fechada }, membros] = await Promise.all([
          lerRegistroDaSemana(weekStart, { verQuemExcluiu: member.role === MemberRole.LIDERANCA }),
          getTeamMembers(),
        ])
        const nomes = new Map(membros.map((m) => [m.id, m.name]))
        const alvo = args.todoTime ? undefined : (args.memberId ?? member.id)
        const semana = { inicio: day(weekStart), fim: day(new Date(weekStart.getTime() + 6 * 86_400_000)) }
        const de = alvo ? (nomes.get(alvo) ?? "pessoa não encontrada") : "time todo"

        if (registros.length === 0) {
          return ok({
            semana,
            de,
            aviso:
              "Essa semana não tem registro (o registro semanal só existe desde que foi ligado). Para o estado atual dos checkpoints daquela semana, use ver_semana com a mesma data.",
          })
        }

        const daPessoa = registros.filter((r) => !alvo || r.responsaveisIds.includes(alvo))
        const resumo: Record<string, number> = {}
        let planejados = 0
        const porItem = new Map<
          string,
          { tipo: string; id: string; nome: string; frente: string; checkpoints: unknown[] }
        >()
        for (const r of daPessoa) {
          resumo[r.desfecho] = (resumo[r.desfecho] ?? 0) + 1
          if (r.origem === "PLANEJADO") planejados++
          const chave = `${r.kind}:${r.itemId}`
          if (!porItem.has(chave)) {
            porItem.set(chave, { tipo: r.kind, id: r.itemId, nome: r.itemNome, frente: r.frente.name, checkpoints: [] })
          }
          porItem.get(chave)!.checkpoints.push({
            nome: r.nome,
            caminho: r.caminho,
            origem: r.origem === "PLANEJADO" ? "planejado" : "entrou_depois",
            desfecho: r.desfecho,
            prazoAoEntrar: day(r.prazoAoEntrar),
            prazo: day(r.prazo),
            concluidoEm: day(r.concluidoEm),
            remarcacoes: r.remarcacoes,
            responsaveis: r.responsaveisIds.map((id) => nomes.get(id) ?? "?"),
            excluidoEm: day(r.excluidoEm),
            excluidoPor: r.excluidoPor,
          })
        }

        return ok(
          {
            semana,
            de,
            congelada: fechada,
            resumo: { total: daPessoa.length, planejados, entraramDepois: daPessoa.length - planejados, ...resumo },
            itens: [...porItem.values()],
          },
          true
        )
      })
  )

  server.registerTool(
    "ver_ausencias",
    {
      title: "Ver ausências",
      description:
        "Quem do time está ou vai estar fora (férias, day off, licença, outro) num período, e as iniciativas com prazo no período cujo responsável estará ausente — o mesmo alerta de conflito da página de ausências. Sem argumentos: esta semana e a próxima. O motivo de licenças não é informado.",
      inputSchema: {
        de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Início (yyyy-mm-dd). Omitido: segunda desta semana."),
        ate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(`Fim (yyyy-mm-dd), no máximo ${AUSENCIA_MAX_DIAS} dias depois do início. Omitido: domingo da próxima semana.`),
      },
      annotations: readOnly,
    },
    (args) =>
      audited(member, "ver_ausencias", args, async () => {
        const segunda = startOfWeekMondayUTC(hojeUTC())
        const inicio = args.de ? parseISODateUTC(args.de) : segunda
        const fimDia = args.ate ? parseISODateUTC(args.ate) : new Date(segunda.getTime() + 13 * 86_400_000)
        if (!inicio || !fimDia) return fail("Data inválida: use yyyy-mm-dd.")
        const fim = new Date(fimDia.getTime() + 86_400_000 - 1) // até o fim do dia
        if (fim.getTime() < inicio.getTime()) return fail("O fim vem antes do início.")
        if (fim.getTime() - inicio.getTime() > AUSENCIA_MAX_DIAS * 86_400_000) {
          return fail(`Período longo demais: no máximo ${AUSENCIA_MAX_DIAS} dias.`)
        }

        const [ausencias, conflitos] = await Promise.all([
          getAusencias({ rangeStart: inicio, rangeEnd: fim }),
          getConflicts(inicio, fim),
        ])
        return ok(
          {
            periodo: { inicio: day(inicio), fim: day(fim) },
            ausencias: [...ausencias]
              .sort((x, y) => x.startDate.getTime() - y.startDate.getTime())
              .map((x) => ({
                pessoa: { id: x.member.id, nome: x.member.name },
                tipo: tipoDeAusencia(x.type),
                inicio: day(x.startDate),
                fim: day(x.endDate),
              })),
            conflitos: conflitos.map((c) => ({
              iniciativa: { id: c.iniciativa.id, nome: c.iniciativa.name, prazo: day(c.iniciativa.endDate) },
              pessoa: c.ausencia.member.name,
              ausencia: { tipo: tipoDeAusencia(c.ausencia.type), inicio: day(c.ausencia.startDate), fim: day(c.ausencia.endDate) },
            })),
          },
          true
        )
      })
  )

  server.registerTool(
    "ver_calendario",
    {
      title: "Ver calendário de datas-chave",
      description:
        "Calendário do mês com as datas-chave de iniciativas e experimentos: lançamentos, análises de resultados, comunicações (avisos, e-mails, posts, anúncios) e marcos — a mesma visão da página Calendário. Responde \"quando é o lançamento de X\", \"quais comunicações saem em novembro\", \"o que lança este mês\", \"que análise está atrasada\". Cada data diz se está atrasada, se foi concluída e quem dos responsáveis está fora (férias, licença) no dia; traz também as travas de férias do mês. Sem argumentos: o mês atual.",
      inputSchema: {
        mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Mês (yyyy-mm). Omitido: o mês atual."),
        tipos: z
          .array(z.enum(TIPOS_DE_EVENTO))
          .optional()
          .describe("Só estes tipos (LANCAMENTO, ANALISE, COMUNICACAO, MARCO). Omitido: todos."),
        tipoDeItem: z.enum(["iniciativa", "experimento"]).optional().describe("Só iniciativas ou só experimentos."),
        frenteId: z.string().uuid().optional().describe("Só esta frente (ids em contexto_da_sala)."),
        responsavelId: z.string().uuid().optional().describe("Só as datas em que esta pessoa é responsável."),
        apenasAtrasados: z.boolean().optional().describe("Só o que passou da data sem acontecer."),
      },
      annotations: readOnly,
    },
    (args) =>
      audited(member, "ver_calendario", args, async () => {
        const hoje = hojeUTC()
        const alvo = args.mes ? parseMes(args.mes) : { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() }
        if (!alvo) return fail("Mês inválido: use yyyy-mm.")
        const mes = formatMes(alvo.ano, alvo.mes)

        const { eventos, travas } = await getEventosDoCalendario(mes)
        // A action traz a grade (com dias do mês vizinho); aqui vale só o mês.
        const doMes = filtrarEventos(eventos, {
          tipos: args.tipos?.length ? new Set(args.tipos) : FILTROS_PADRAO.tipos,
          tipoDeItem: args.tipoDeItem ?? "todos",
          frenteId: args.frenteId ?? "",
          memberId: args.responsavelId ?? "",
          soAtrasados: args.apenasAtrasados ?? false,
        }).filter((e) => e.data.startsWith(`${mes}-`))

        return ok(
          {
            mes,
            total: doMes.length,
            datas: doMes.map((e) => ({
              data: e.data,
              tipo: e.tipo,
              titulo: clip(e.titulo, 200),
              item: {
                tipo: e.item.tipo,
                id: e.item.id,
                nome: clip(e.item.nome, 200),
                abrirCom: e.item.tipo === "iniciativa" ? "ver_iniciativa" : "ver_experimento",
              },
              frente: e.frente.name,
              responsaveis: e.members.map((m) => m.name),
              concluido: e.concluido ?? undefined,
              atrasado: e.atrasado || undefined,
              // Só o tipo genérico (`rotuloDeAusencia`): licença sai como "licença".
              foraNoDia: e.conflitos.length > 0 ? e.conflitos : undefined,
            })),
            travasDeFerias: travas.filter((t) => t.inicio <= `${mes}-31` && t.fim >= `${mes}-01`),
          },
          true
        )
      })
  )
}
