import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { isAuthRateLimited, isCrossOriginMutation } from "./middleware";

// O helper só lê req.method e req.headers.get() — um shape mínimo basta.
function req(
  method: string,
  headers: Record<string, string> = {},
): NextRequest {
  return { method, headers: new Headers(headers) } as unknown as NextRequest;
}

describe("isCrossOriginMutation (CSRF)", () => {
  it("ignora métodos seguros mesmo com Origin cross-site", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        isCrossOriginMutation(
          req(method, { origin: "https://evil.com", host: "app.example.com" }),
        ),
      ).toBe(false);
    }
  });

  it("bloqueia POST com Origin de outro host", () => {
    expect(
      isCrossOriginMutation(
        req("POST", { origin: "https://evil.com", host: "app.example.com" }),
      ),
    ).toBe(true);
  });

  it("permite POST same-origin (Origin === host)", () => {
    expect(
      isCrossOriginMutation(
        req("POST", {
          origin: "https://app.example.com",
          host: "app.example.com",
        }),
      ),
    ).toBe(false);
  });

  it("prioriza x-forwarded-host sobre host (app atrás de proxy)", () => {
    expect(
      isCrossOriginMutation(
        req("POST", {
          origin: "https://app.example.com",
          "x-forwarded-host": "app.example.com",
          host: "internal-heroku-dyno.local",
        }),
      ),
    ).toBe(false);
  });

  it("bloqueia quando Origin bate no host interno mas não no forwarded-host", () => {
    expect(
      isCrossOriginMutation(
        req("POST", {
          origin: "https://internal-heroku-dyno.local",
          "x-forwarded-host": "app.example.com",
          host: "internal-heroku-dyno.local",
        }),
      ),
    ).toBe(true);
  });

  it("Origin ausente NÃO bloqueia (cliente não-browser, sem vetor de CSRF)", () => {
    expect(
      isCrossOriginMutation(req("POST", { host: "app.example.com" })),
    ).toBe(false);
  });

  it("Origin malformado é tratado como cross-origin (bloqueia)", () => {
    expect(
      isCrossOriginMutation(
        req("DELETE", { origin: "not-a-url", host: "app.example.com" }),
      ),
    ).toBe(true);
  });

  it("cobre PUT e PATCH cross-origin", () => {
    for (const method of ["PUT", "PATCH"]) {
      expect(
        isCrossOriginMutation(
          req(method, { origin: "https://evil.com", host: "app.example.com" }),
        ),
      ).toBe(true);
    }
  });
});

// O bucket de auth é estreito (freio de brute force) e, como o time todo sai
// pelo mesmo IP do escritório, é compartilhado entre todas as pessoas. Só os
// endpoints que iniciam/concluem autenticação podem cair nele.
describe("isAuthRateLimited (classificação de bucket)", () => {
  it("/api/auth/session NÃO entra no bucket estreito", () => {
    // Regressão: leitura de sessão é frequente e legítima. No bucket de auth,
    // ela estourava o limite do escritório e o 429 respingava no
    // /api/auth/callback/google — quebrando o próprio login.
    expect(isAuthRateLimited("/api/auth/session")).toBe(false);
  });

  it("endpoints de signin e callback entram no bucket estreito", () => {
    expect(isAuthRateLimited("/api/auth/signin")).toBe(true);
    expect(isAuthRateLimited("/api/auth/signin/google")).toBe(true);
    expect(isAuthRateLimited("/api/auth/callback/google")).toBe(true);
  });

  it("a tela de login entra no bucket estreito", () => {
    expect(isAuthRateLimited("/login")).toBe(true);
  });

  it("navegação normal fica no bucket geral", () => {
    expect(isAuthRateLimited("/dashboard")).toBe(false);
    expect(isAuthRateLimited("/iniciativas")).toBe(false);
    expect(isAuthRateLimited("/api/auth/csrf")).toBe(false);
  });
});

// Regressão: em produção o 429 (rate limit) e o 403 (CSRF) eram recriados como
// `NextResponse.next()` ao receber a CSP — o status e o corpo do bloqueio se
// perdiam e a requisição seguia para o app. Os describes acima só exercitavam
// helpers; nenhum chamava `middleware()`. `isProd` é lido na carga do módulo,
// por isso o ambiente é fixado antes de importar.
describe("middleware() em produção", () => {
  async function loadProdMiddleware() {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { NextRequest } = await import("next/server");
    const mod = await import("./middleware");
    return {
      middleware: mod.middleware,
      request: (
        url: string,
        init: { method?: string; headers?: Record<string, string> } = {},
      ) => new NextRequest(url, init),
    };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mutação cross-origin recebe 403 de verdade (não segue para o app)", async () => {
    const { middleware, request } = await loadProdMiddleware();
    const res = middleware(
      request("https://app.example.com/iniciativas", {
        method: "POST",
        headers: {
          origin: "https://evil.com",
          host: "app.example.com",
          cookie: "authjs.session-token=x",
        },
      }),
    );

    expect(res.status).toBe(403);
    expect(res.headers.has("x-middleware-next")).toBe(false);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("estourar o limite devolve 429 com Retry-After", async () => {
    const { middleware, request } = await loadProdMiddleware();
    const headers = { "x-forwarded-for": "203.0.113.7" };
    let last = middleware(request("https://app.example.com/login", { headers }));
    // Bucket de auth = 60/min; a 61ª passa do limite.
    for (let i = 0; i < 60; i++) {
      last = middleware(request("https://app.example.com/login", { headers }));
    }

    expect(last.status).toBe(429);
    expect(last.headers.has("x-middleware-next")).toBe(false);
    expect(last.headers.get("Retry-After")).toBeTruthy();
    expect(last.headers.get("Content-Security-Policy")).toBeTruthy();
  });

  it("IP forjado no início do x-forwarded-for não escapa do limite", async () => {
    const { middleware, request } = await loadProdMiddleware();
    let last = middleware(request("https://app.example.com/login"));
    for (let i = 0; i < 61; i++) {
      // O router do Heroku acrescenta o IP real ao FIM; o início é do cliente.
      last = middleware(
        request("https://app.example.com/login", {
          headers: { "x-forwarded-for": `10.0.0.${i}, 198.51.100.9` },
        }),
      );
    }
    expect(last.status).toBe(429);
  });

  it("requisição normal com sessão passa e recebe CSP com nonce", async () => {
    const { middleware, request } = await loadProdMiddleware();
    const res = middleware(
      request("https://app.example.com/dashboard", {
        headers: { cookie: "authjs.session-token=x", "x-forwarded-for": "198.51.100.20" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.has("x-middleware-next")).toBe(true);
    expect(res.headers.get("Content-Security-Policy")).toMatch(/nonce-/);
  });

  it("sem sessão redireciona para /login e mantém a CSP", async () => {
    const { middleware, request } = await loadProdMiddleware();
    const res = middleware(
      request("https://app.example.com/dashboard", {
        headers: { "x-forwarded-for": "198.51.100.21" },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});
