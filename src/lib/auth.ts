import NextAuth, { type DefaultSession } from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma, withDbRetry } from "./prisma"
import { normalizarEmail } from "./email"

/**
 * Bypass de login para desenvolvimento local.
 *
 * Só ativa quando AMBAS as condições forem verdadeiras:
 *   1. NODE_ENV !== "production"  — garante que nunca roda em prod
 *   2. DEV_BYPASS_AUTH === "true" — exige opt-in explícito no .env local
 *
 * Use no seu .env.local:
 *   DEV_BYPASS_AUTH=true
 */
export const isDevBypassEnabled =
  process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "true"

/**
 * E-mail que é promovido automaticamente para LIDERANCA no primeiro login.
 * Configure via env var ADMIN_EMAIL (sem valor default: em ambientes sem a
 * env var, ninguém é auto-promovido — contas existentes seguem com o role
 * que já têm no banco).
 */
export const ADMIN_EMAIL = normalizarEmail(process.env.ADMIN_EMAIL || "")

/**
 * Código de erro do login quando o banco está indisponível.
 *
 * Falha de banco no gate de login **não é falta de permissão**. Se a exceção
 * escapar do callback `signIn`, o Auth.js a converte em `AccessDenied` e a tela
 * mostra "Sua conta não possui acesso autorizado" — acusando a conta da pessoa
 * por um problema de infraestrutura.
 *
 * Aconteceu em produção em 04/08/2026: o `essential-0` cortou a conexão durante
 * o signIn e o time foi informado de que não tinha acesso à própria conta.
 */
export const DB_UNAVAILABLE_ERROR = "DatabaseUnavailable"

/**
 * O callback `signIn` aceita `boolean | string`; string redireciona. Usamos isso
 * para separar "banco caiu" de "não autorizado", que sem isso colapsam no mesmo
 * `AccessDenied`.
 */
function dbUnavailableRedirect(error: unknown): string {
  console.error("[auth] signIn: banco indisponível ao verificar acesso —", error)
  return `/login?error=${DB_UNAVAILABLE_ERROR}`
}

/**
 * Cria a conta do ADMIN_EMAIL quando ainda não existe membro com esse e-mail.
 *
 * "Não existe" tem dois sentidos, e só um deles autoriza criar:
 *  - primeiro acesso / recuperação: ninguém ativo na liderança. É para isso que
 *    o ADMIN_EMAIL existe — subir o primeiro líder, ou destravar um time que
 *    ficou sem nenhum.
 *  - a pessoa foi desativada: `toggleMemberActive` apaga o e-mail do registro,
 *    então o upsert antigo não achava a linha e criava uma conta NOVA e ativa,
 *    desfazendo a desativação (achado da auditoria de segurança de 13/11/2026).
 *    Aqui vale a mesma regra de qualquer pessoa desativada: volta só com convite.
 *
 * Sem permissão, devolve null: o token fica sem membro e `getCurrentMember()`
 * barra o acesso (AccessRevokedError).
 */
async function criarAdmin(email: string, nome: string | null | undefined) {
  const [convite, liderancaAtiva] = await Promise.all([
    prisma.invite.findUnique({ where: { email } }),
    prisma.teamMember.count({ where: { role: "LIDERANCA", isActive: true } }),
  ])
  const conviteId =
    convite && !convite.usedAt && convite.expiresAt > new Date() ? convite.id : null
  if (!conviteId && liderancaAtiva > 0) return null

  const dados = {
    name: nome || email.split("@")[0],
    email,
    role: "LIDERANCA" as const,
    isActive: true,
  }
  if (!conviteId) return prisma.teamMember.create({ data: dados })

  // Mesmo ato do convite comum: criar o membro e consumir o convite juntos.
  return prisma.$transaction(async (tx) => {
    const criado = await tx.teamMember.create({ data: dados })
    await tx.invite.update({ where: { id: conviteId }, data: { usedAt: new Date() } })
    return criado
  })
}

const devProviders = isDevBypassEnabled
  ? [
      Credentials({
        id: "dev-bypass",
        name: "Dev Bypass",
        credentials: {
          email: { label: "E-mail", type: "email" },
        },
        authorize: async (credentials) => {
          // Aceita qualquer e-mail: o bypass é dev-only e opt-in (flag).
          // Sem e-mail informado, usa o ADMIN_EMAIL do .env.
          const email =
            (credentials?.email as string | undefined)?.trim() || ADMIN_EMAIL
          if (!email) return null
          return { id: email, email, name: email.split("@")[0] }
        },
      }),
    ]
  : []

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"]
  }
  interface JWT {
    memberId?: string
    memberRole?: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    ...devProviders,
  ],
  pages: {
    signIn: "/login",
    signOut: "/logout",
    error: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Minúsculas: o e-mail é a chave de login e é gravado normalizado (ver
      // lib/email.ts). Comparar como veio do provedor quebra com qualquer
      // diferença de caixa.
      const email = user.email ? normalizarEmail(user.email) : user.email

      // Bypass de dev: aceita conta existente no DB; cria como VISITANTE se não existir.
      if (isDevBypassEnabled && account?.provider === "dev-bypass" && email) {
        try {
          const tm = await withDbRetry(() =>
            prisma.teamMember.findUnique({ where: { email } })
          )
          if (tm && !tm.isActive) return false
          return true
        } catch (error) {
          return dbUnavailableRedirect(error)
        }
      }

      if (account?.provider === "google" && email) {
        // O e-mail é a chave de login (membro, convite e ADMIN_EMAIL): só vale se
        // o Google atesta que a conta controla esse endereço. O provider do
        // Auth.js não checa isso sozinho; a porta do MCP já exigia (mcp/auth.ts).
        if (profile?.email_verified !== true) return false

        // Admin configurado: sempre permitido (auto-promovido no jwt callback).
        // Não toca o banco — é a única porta que sobrevive a banco indisponível.
        // Desativado não volta por aqui: o jwt não recria a conta (ver criarAdmin)
        // e `getCurrentMember()` barra o token sem membro.
        if (ADMIN_EMAIL && email === ADMIN_EMAIL) return true

        try {
          const teamMember = await withDbRetry(() =>
            prisma.teamMember.findUnique({ where: { email } })
          )

          // Conta existente: respeita isActive
          if (teamMember) return teamMember.isActive

          // Conta nova: precisa de convite válido (qualquer domínio)
          const invite = await withDbRetry(() =>
            prisma.invite.findUnique({ where: { email } })
          )
          return !!(invite && !invite.usedAt && invite.expiresAt > new Date())
        } catch (error) {
          return dbUnavailableRedirect(error)
        }
      }
      return false
    },
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        const userEmail = normalizarEmail(user.email)
        let teamMember = await prisma.teamMember.findUnique({
          where: { email: userEmail }
        })

        // Admin configurado: auto-promoção para LIDERANCA.
        // NÃO força isActive: true no update — desativação não deve ser revertida por login.
        if (ADMIN_EMAIL && userEmail === ADMIN_EMAIL) {
          teamMember = teamMember
            ? await prisma.teamMember.update({
                where: { id: teamMember.id },
                data: { role: "LIDERANCA" },
              })
            : await criarAdmin(userEmail, user.name)
        }
        // Usuário novo sem TeamMember: cria a partir do convite.
        else if (!teamMember) {
          const email = userEmail
          const invite = await prisma.invite.findUnique({ where: { email } })
          if (invite && !invite.usedAt && invite.expiresAt > new Date()) {
            // Transação: criar o membro e consumir o convite são um ato só —
            // sem ela, uma falha no update deixaria o convite reutilizável.
            teamMember = await prisma.$transaction(async (tx) => {
              const created = await tx.teamMember.create({
                data: {
                  name: user.name || email.split("@")[0],
                  email,
                  role: invite.role,
                  isActive: true,
                }
              })
              await tx.invite.update({
                where: { id: invite.id },
                data: { usedAt: new Date() }
              })
              return created
            })
          }
          // Dev bypass sem conta: cria como VISITANTE
          else if (isDevBypassEnabled && account.provider === "dev-bypass") {
            teamMember = await prisma.teamMember.create({
              data: {
                name: user.name || userEmail.split("@")[0],
                email: userEmail,
                role: "VISITANTE",
                isActive: true,
              }
            })
          }
        }

        if (teamMember) {
          token.memberId = teamMember.id
          token.memberRole = teamMember.role
        } else {
          token.memberId = user.id
          token.memberRole = "VISITANTE"
        }
      }
      // Sem revalidação de isActive/role aqui, de propósito. Antes este callback
      // re-checava o membro no banco "no máximo 1x por minuto", gravando
      // `activeCheckAt` no token. Só que o token atualizado nunca voltava ao
      // cookie: o `auth()` chamado em Server Component/action descarta o
      // `Set-Cookie` (next-auth/lib/index.js → parseSessionResponse) e o app não
      // tem SessionProvider batendo em /api/auth/session. O carimbo ficava
      // congelado no login e, passado 1 minuto, TODA leitura de sessão fazia um
      // SELECT — logo seguido do SELECT idêntico do getCurrentMember().
      //
      // O corte de acesso continua imediato: `getCurrentMember()` (lib/session.ts)
      // checa isActive e lê o role do banco em toda página e action. Nada lê
      // `session.user.role` para decidir permissão.
      return token
    },
    async session({ session, token }) {
      if (token?.memberId && session.user) {
        // Repassa pra sessão do app pra uso em actions via session.user.id
        session.user.id = token.memberId as string
        session.user.role = token.memberRole as string
      }
      return session
    }
  }
})
