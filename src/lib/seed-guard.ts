import { ehBancoLocal } from "./db-url"

/**
 * Decide ONDE a seed de demonstração (prisma/seed.ts) pode escrever.
 *
 * Função pura de propósito: a trava é a única coisa entre dados fictícios e um
 * banco de verdade, então ela é testada (seed-guard.test.ts) em vez de confiada.
 *
 *   - local   → banco em localhost/127.0.0.1, fora de NODE_ENV=production. Como sempre.
 *   - staging → SÓ com `SEED_STAGING_CONFIRM=meu-app-staging` (o nome do app,
 *               digitado por quem roda) E um banco não-local. O chamador ainda
 *               exige que o banco esteja VAZIO antes de escrever: apontar isto
 *               para produção por engano aborta, porque produção tem dados.
 *   - refuse  → todo o resto. Não existe outro override.
 */

export const STAGING_APP = "meu-app-staging"

export type SeedTarget =
  | { kind: "local" }
  | { kind: "staging"; host: string }
  | { kind: "refuse"; reason: string }

export function resolveSeedTarget(env: {
  DATABASE_URL?: string
  NODE_ENV?: string
  SEED_STAGING_CONFIRM?: string
}): SeedTarget {
  const dbUrl = env.DATABASE_URL ?? ""
  if (!dbUrl) return { kind: "refuse", reason: "DATABASE_URL não está definida." }

  const isLocalDb = ehBancoLocal(dbUrl)
  const confirm = env.SEED_STAGING_CONFIRM

  // Variável presente mas errada (typo, outro app): recusa em vez de ignorar.
  if (confirm && confirm !== STAGING_APP) {
    return {
      kind: "refuse",
      reason: `SEED_STAGING_CONFIRM só aceita "${STAGING_APP}" (recebido: "${confirm}").`,
    }
  }

  if (confirm === STAGING_APP) {
    if (isLocalDb) {
      return {
        kind: "refuse",
        reason: "SEED_STAGING_CONFIRM definido, mas o DATABASE_URL é local. Remova a variável para semear o banco local.",
      }
    }
    try {
      return { kind: "staging", host: new URL(dbUrl).hostname }
    } catch {
      return { kind: "refuse", reason: "DATABASE_URL inválida." }
    }
  }

  if (env.NODE_ENV === "production") {
    return { kind: "refuse", reason: "Seed de demonstração não roda com NODE_ENV=production." }
  }
  if (!isLocalDb) {
    return {
      kind: "refuse",
      reason: "DATABASE_URL não aponta para um banco local (e SEED_STAGING_CONFIRM não foi informado).",
    }
  }
  return { kind: "local" }
}
