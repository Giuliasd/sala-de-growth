import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientIp, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite até o limite, bloqueia depois", () => {
    const key = `test:basic:${Math.random()}`;
    const limit = 3;
    const windowMs = 1000;

    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    expect(rateLimit(key, limit, windowMs).ok).toBe(false);
    expect(rateLimit(key, limit, windowMs).ok).toBe(false);
  });

  it("decrementa remaining a cada chamada", () => {
    const key = `test:remaining:${Math.random()}`;
    expect(rateLimit(key, 5, 1000).remaining).toBe(4);
    expect(rateLimit(key, 5, 1000).remaining).toBe(3);
    expect(rateLimit(key, 5, 1000).remaining).toBe(2);
  });

  it("reseta após a janela expirar", () => {
    const key = `test:reset:${Math.random()}`;
    const windowMs = 1000;

    expect(rateLimit(key, 2, windowMs).ok).toBe(true);
    expect(rateLimit(key, 2, windowMs).ok).toBe(true);
    expect(rateLimit(key, 2, windowMs).ok).toBe(false);

    // Avança o relógio além da janela
    vi.advanceTimersByTime(windowMs + 1);

    // Primeira chamada após reset: bucket zerado, deve aceitar com remaining=1
    const afterReset = rateLimit(key, 2, windowMs);
    expect(afterReset.ok).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });

  it("buckets independentes por key (rate limit não vaza entre IPs)", () => {
    const limit = 2;
    const windowMs = 1000;
    const a = `test:ip-a:${Math.random()}`;
    const b = `test:ip-b:${Math.random()}`;

    expect(rateLimit(a, limit, windowMs).ok).toBe(true);
    expect(rateLimit(a, limit, windowMs).ok).toBe(true);
    expect(rateLimit(a, limit, windowMs).ok).toBe(false); // a estourou

    // b ainda tem espaço — buckets isolados
    expect(rateLimit(b, limit, windowMs).ok).toBe(true);
    expect(rateLimit(b, limit, windowMs).ok).toBe(true);
  });

  it("retorna resetAt no futuro próximo", () => {
    const key = `test:resetAt:${Math.random()}`;
    const now = Date.now();
    const windowMs = 60_000;

    const result = rateLimit(key, 1, windowMs);
    expect(result.resetAt).toBeGreaterThanOrEqual(now + windowMs - 100);
    expect(result.resetAt).toBeLessThanOrEqual(now + windowMs + 100);
  });
});

describe("getClientIp", () => {
  function makeReq(headers: Record<string, string>) {
    return { headers: new Headers(headers) };
  }

  it("usa x-forwarded-for quando presente", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("pega o ÚLTIMO IP da lista (o que o router do proxy acrescentou, não o do cliente)", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" })),
    ).toBe("9.10.11.12");
  });

  it("IP forjado pelo cliente no início da lista não vira a chave do bucket", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" })),
    ).toBe("198.51.100.9");
  });

  it("trimm whitespace do IP", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "  1.2.3.4  " }))).toBe("1.2.3.4");
  });

  it("usa x-real-ip se x-forwarded-for ausente", () => {
    expect(getClientIp(makeReq({ "x-real-ip": "9.8.7.6" }))).toBe("9.8.7.6");
  });

  it("prefere x-forwarded-for a x-real-ip", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" })),
    ).toBe("1.1.1.1");
  });

  it("retorna 'unknown' quando nenhum header está presente", () => {
    expect(getClientIp(makeReq({}))).toBe("unknown");
  });
});
