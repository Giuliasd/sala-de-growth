import { describe, expect, it, vi } from "vitest";
import { withDbRetry } from "./prisma";

// O `prisma` exportado por ./prisma é um Proxy lazy: importar o módulo não abre
// conexão nenhuma (o pool só é criado no primeiro acesso a uma propriedade).
// Por isso este teste roda sem banco e sem DATABASE_URL.

describe("withDbRetry", () => {
  it("devolve o resultado quando a primeira tentativa dá certo", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withDbRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // O caso que motivou o helper: o essential-0 recusa conexão esporadicamente,
  // e essas leituras estão no caminho crítico de toda página autenticada.
  it("absorve UMA falha transitória e devolve o resultado da segunda", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockResolvedValue("ok");
    await expect(withDbRetry(fn, 0)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propaga o erro se a segunda tentativa também falhar (indisponibilidade real)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("connection refused"));
    await expect(withDbRetry(fn, 0)).rejects.toThrow(/connection refused/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("não tenta uma terceira vez", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await withDbRetry(fn, 0).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

/**
 * O `connectionTimeoutMillis` do pool não é um número solto: ele tem que caber no
 * orçamento de 30s do router do Heroku, contando que `withDbRetry` tenta DUAS
 * vezes e que uma página faz várias leituras em sequência.
 *
 * Com 10s (o valor antigo), uma request do /dashboard chegava a ~60s no pior
 * caso: o router cortava em 30s com H12 e a pessoa via carregamento infinito em
 * vez do error boundary. Aconteceu em staging em 05/08/2026.
 *
 * Estes testes existem para quem for mexer no valor bater de frente com a conta.
 */
// `vi.hoisted` porque as factories de `vi.mock` sobem acima das declarações do
// módulo — sem isso o array não existe ainda quando a factory é avaliada.
const spy = vi.hoisted(() => ({ poolCalls: [] as Record<string, number>[] }));

vi.mock("pg", () => ({
  // Classe de verdade: `createClient` faz `new Pool(...)`, e um `vi.fn` dentro da
  // factory hoisted não chega construtível.
  Pool: class {
    constructor(config: Record<string, number>) {
      spy.poolCalls.push(config);
    }
    on() {}
  },
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../generated/prisma/client", () => ({ PrismaClient: class {} }));

async function poolConfig(env: Record<string, string> = {}) {
  vi.resetModules();
  spy.poolCalls.length = 0;
  // O módulo guarda o client em globalThis (para sobreviver ao hot reload do
  // dev), e isso atravessa o resetModules: sem limpar, a segunda carga reusa o
  // client da primeira e nenhum Pool novo é construído.
  delete (globalThis as unknown as Record<string, unknown>).prisma;
  const snapshot = { ...process.env };
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  delete process.env.DB_CONNECT_TIMEOUT_MS;
  delete process.env.DB_POOL_MAX;
  Object.assign(process.env, env);

  const mod = await import("./prisma");
  // O client é um Proxy lazy: acessar qualquer propriedade constrói o Pool.
  void (mod.prisma as unknown as Record<string, unknown>).teamMember;

  process.env = snapshot;
  return spy.poolCalls.at(-1)!;
}

describe("pool do pg — timeout de conexão cabe no orçamento do router", () => {
  it("o default é 3s, não 10s: 6 esperas com retry cabem nos 30s do router", async () => {
    const cfg = await poolConfig();
    expect(cfg.connectionTimeoutMillis).toBe(3_000);
    // A conta que justifica o valor: gate de sessão (1 bloco com retry) +
    // getWeeklyActivity (2 blocos) = 6 esperas por conexão numa request.
    expect(cfg.connectionTimeoutMillis * 6).toBeLessThan(30_000);
  });

  it("é ajustável por env var, para não precisar de deploy", async () => {
    const cfg = await poolConfig({ DB_CONNECT_TIMEOUT_MS: "1500" });
    expect(cfg.connectionTimeoutMillis).toBe(1_500);
  });

  it("env var inválida cai no default em vez de virar 0 (que desabilitaria o timeout)", async () => {
    const cfg = await poolConfig({ DB_CONNECT_TIMEOUT_MS: "abc" });
    expect(cfg.connectionTimeoutMillis).toBe(3_000);
  });
});
