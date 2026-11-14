import { cache } from "react"
import { auth } from "./auth"
import { prisma, withDbRetry } from "./prisma"
import { MemberRole } from "@/generated/prisma/enums"
import { getMcpMember } from "./mcp/member-context"

/**
 * Falta de sessão: ninguém logado neste request.
 *
 * A mensagem mantém "não autenticado" porque os callers (e os testes) tratam a
 * família toda por esse texto.
 */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("Usuário não autenticado.")
    this.name = "NotAuthenticatedError"
  }
}

/**
 * Sessão válida, mas a conta não tem mais acesso (desativada ou removida).
 *
 * Separado de `NotAuthenticatedError` e — principalmente — de um erro de banco.
 * O layout de `(app)` reage a cada caso de forma diferente: só ESTE justifica
 * mandar a pessoa para `/logout?revogado=1` ("sua conta foi desativada"). Antes
 * o layout usava `catch {}` sem distinção, então um timeout do Postgres
 * anunciava desativação de conta para um membro perfeitamente ativo.
 */
export class AccessRevokedError extends Error {
  constructor() {
    super("Usuário não autenticado. Acesso revogado.")
    this.name = "AccessRevokedError"
  }
}

// Memoizado por render: quase toda action chama getCurrentMember() internamente,
// então numa página com N actions pagávamos N× o mesmo auth() + SELECT teamMember.
// O cache() do React desduplica dentro do mesmo render (não persiste entre
// requests). ⚠️ Dentro de uma server action NÃO há render ativo e o cache()
// vira no-op: cada chamada vai ao banco. Por isso as actions carregam o membro
// uma vez e o repassam (ver `requireOwnershipPermission`).
//
// Esta é a ÚNICA checagem de isActive/role por request — o callback jwt de
// lib/auth.ts não consulta o banco (ver o comentário lá).
const getSessionMember = cache(async function getSessionMember(): Promise<{
  id: string
  name: string
  email: string
  role: MemberRole
}> {
  const session = await auth()

  if (!session || !session.user) {
    throw new NotAuthenticatedError()
  }

  const memberId = session.user.id as string
  // Leitura no caminho crítico de toda página autenticada — com retry, para que
  // um blip do essential-0 não derrube a navegação. Um erro de banco que
  // sobrevive ao retry PROPAGA como erro mesmo (não vira AccessRevokedError):
  // quem decide o que fazer com falha de infra é o error boundary, não o gate.
  const member = await withDbRetry(() =>
    prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  )

  // Membro removido ou desativado: trata como não autenticado. É esta
  // checagem, a cada request, que garante que desativar um membro corta
  // o acesso na hora — sem esperar o token expirar.
  if (!member || !member.isActive) {
    throw new AccessRevokedError()
  }

  return {
    id: member.id,
    name: member.name,
    // Membro ativo sempre tem e-mail (só é apagado ao desativar); o `?? ""` é só
    // para satisfazer o tipo, já que o campo passou a ser nullable no schema.
    email: member.email ?? "",
    role: member.role as MemberRole,
  }
})

// Quem está agindo neste request. Dentro de uma chamada MCP já autenticada
// (lib/mcp/auth.ts → runAsMcpMember) é o membro do token — e isso tem
// precedência sobre qualquer cookie. Fora dela é a sessão do navegador, como
// sempre. O contexto MCP só existe dentro de /api/mcp, depois da validação do
// token, então não abre porta nova para as páginas.
export async function getCurrentMember(): Promise<{
  id: string
  name: string
  email: string
  role: MemberRole
}> {
  const mcpMember = getMcpMember()
  if (mcpMember) return mcpMember
  return getSessionMember()
}

export async function requireEditPermission() {
  const member = await getCurrentMember()
  if (member.role === MemberRole.VISITANTE) {
    throw new Error("Permissão negada. Visitantes não podem realizar edições.")
  }
  return member
}

export async function requireLeadershipPermission() {
  const member = await getCurrentMember()
  if (member.role !== MemberRole.LIDERANCA) {
    throw new Error("Permissão negada. Apenas lideranças podem realizar esta ação.")
  }
  return member
}

// Regra de ownership: LIDERANCA edita qualquer item; COLABORADOR só edita itens
// sob sua responsabilidade ou sem responsável definido. `ownerIds` recebe os
// responsáveis possíveis do item (ex.: responsável da iniciativa + responsável
// do checkpoint) — basta um deles ser o membro atual para liberar.
//
// Versão que devolve boolean, para quem precisa AVALIAR sem abortar: a edição em
// massa checa vários itens e monta uma mensagem nomeando os que barraram. A regra
// vive só aqui — `requireOwnershipPermission` abaixo é a mesma coisa que lança.
export function hasOwnershipAccess(
  member: { id: string; role: MemberRole },
  ownerIds: Array<string | null | undefined>
): boolean {
  if (member.role === MemberRole.LIDERANCA) return true

  const assigned = ownerIds.filter((id): id is string => !!id)
  return assigned.length === 0 || assigned.includes(member.id)
}

export type OwnershipMember = Awaited<ReturnType<typeof getCurrentMember>>

// `member` é o membro que a action JÁ carregou com `requireEditPermission()`.
// Passe-o sempre que tiver: o `cache()` do getCurrentMember só desduplica
// durante o render — dentro de uma server action cada chamada vai ao banco de
// novo, e o padrão "gate + checagem de posse" pagava o SELECT duas vezes.
export async function requireOwnershipPermission(
  ownerIds: Array<string | null | undefined>,
  member?: OwnershipMember
) {
  if (!member) member = await requireEditPermission()
  else if (member.role === MemberRole.VISITANTE) {
    throw new Error("Permissão negada. Visitantes não podem realizar edições.")
  }
  if (hasOwnershipAccess(member, ownerIds)) return member

  throw new Error(
    "Permissão negada. Você só pode editar itens sob sua responsabilidade."
  )
}
