import { describe, expect, it } from "vitest"
import { resolveSeedTarget, STAGING_APP } from "./seed-guard"

const LOCAL = "postgresql://postgres:x@localhost:5432/sala_de_growth"
const REMOTE = "postgres://user:pass@ec2-1-2-3-4.compute-1.amazonaws.com:5432/dbname"

describe("resolveSeedTarget", () => {
  it("banco local fora de produção: libera, como sempre", () => {
    expect(resolveSeedTarget({ DATABASE_URL: LOCAL })).toEqual({ kind: "local" })
    expect(resolveSeedTarget({ DATABASE_URL: "postgres://a@127.0.0.1/db", NODE_ENV: "development" })).toEqual({ kind: "local" })
  })

  it("banco local com NODE_ENV=production: recusa", () => {
    expect(resolveSeedTarget({ DATABASE_URL: LOCAL, NODE_ENV: "production" }).kind).toBe("refuse")
  })

  it("banco remoto SEM confirmação: recusa (staging e produção ficam protegidos por padrão)", () => {
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE }).kind).toBe("refuse")
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE, NODE_ENV: "production" }).kind).toBe("refuse")
  })

  it("banco remoto com a confirmação exata: vira staging (a checagem de banco vazio é do chamador)", () => {
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE, SEED_STAGING_CONFIRM: STAGING_APP })).toEqual({
      kind: "staging",
      host: "ec2-1-2-3-4.compute-1.amazonaws.com",
    })
  })

  it("staging aceita rodar de NODE_ENV=production (heroku run), pois quem protege é o banco vazio", () => {
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE, NODE_ENV: "production", SEED_STAGING_CONFIRM: STAGING_APP }).kind).toBe("staging")
  })

  it("confirmação com nome errado (ex.: o app de produção): recusa", () => {
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE, SEED_STAGING_CONFIRM: "meu-app-production" }).kind).toBe("refuse")
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE, SEED_STAGING_CONFIRM: "true" }).kind).toBe("refuse")
    expect(resolveSeedTarget({ DATABASE_URL: REMOTE, SEED_STAGING_CONFIRM: "meu-app-staging " }).kind).toBe("refuse")
  })

  it("confirmação de staging com banco local: recusa em vez de ignorar", () => {
    expect(resolveSeedTarget({ DATABASE_URL: LOCAL, SEED_STAGING_CONFIRM: STAGING_APP }).kind).toBe("refuse")
  })

  it("sem DATABASE_URL ou com URL inválida: recusa", () => {
    expect(resolveSeedTarget({}).kind).toBe("refuse")
    expect(resolveSeedTarget({ DATABASE_URL: "isso nao e url", SEED_STAGING_CONFIRM: STAGING_APP }).kind).toBe("refuse")
  })

  it("o motivo da recusa nunca contém a URL do banco (tem senha)", () => {
    const r = resolveSeedTarget({ DATABASE_URL: REMOTE })
    expect(r.kind).toBe("refuse")
    if (r.kind === "refuse") expect(r.reason).not.toContain("pass")
  })
})
