import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Camada de defesa que faz:
 *   1. Rate limiting por IP
 *   2. Redirect pra /login se não houver cookie de sessão
 *   3. CSP estrita com nonce em produção (em dev, mantém o CSP permissivo
 *      definido em next.config.ts pra HMR funcionar)
 *
 * Não valida o conteúdo da sessão — só checa se EXISTE um cookie. A validação
 * real (assinatura JWT, isActive, role) acontece em:
 *   - `auth()` no layout do grupo (app)
 *   - `requireEditPermission()` / `getCurrentMember()` em cada server action
 *
 * Roda no edge runtime: não importa nenhum módulo node:* nem o Prisma.
 */

// /api/mcp: o Claude chama sem cookie. A rota se autentica sozinha (Bearer do
// Google + membro ativo) e responde 401 sem isso — ver src/app/api/mcp/route.ts.
const PUBLIC_PATHS = new Set(["/login", "/api/mcp"]);
// Auth API routes must be publicly accessible — NextAuth calls them during
// login and session hydration before any session cookie exists.
// /invite/* is the invite acceptance page — accessible before login.
// /.well-known/oauth-protected-resource: discovery do OAuth do MCP (público por
// definição, sem dado sensível).
const PUBLIC_PREFIXES = ["/api/auth/", "/invite/", "/.well-known/oauth-protected-resource"];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/**
 * Limites POR IP. O detalhe que importa: o time todo acessa pelo mesmo IP de
 * saída do escritório, então na prática cada bucket é compartilhado entre todas
 * as pessoas — e os valores antigos (20/min e 300/min) eram fáceis de estourar
 * com uso normal, devolvendo 429 no meio da navegação.
 *
 * `general` cobre navegação de páginas, payloads RSC, prefetch do <Link> e
 * server actions. Um único carregamento de dashboard já dispara vários desses.
 */
const RATE_LIMITS = {
  auth: { limit: 60, windowMs: 60_000 },
  general: { limit: 1200, windowMs: 60_000 },
} as const;

/**
 * Só os endpoints que INICIAM ou CONCLUEM autenticação entram no bucket estreito
 * — são os únicos com valor de freio contra brute force.
 *
 * `/api/auth/session` ficava aqui e não devia: é leitura de sessão, chamada com
 * frequência alta e legítima pelo cliente do NextAuth. Ela consumia o bucket de
 * 20/min compartilhado pelo escritório e, quando estourava, o 429 caía também
 * sobre `/api/auth/callback/google` — quebrando o próprio login.
 */
const AUTH_RATE_LIMITED_PREFIXES = ["/api/auth/signin", "/api/auth/callback"];

/** Exportada para teste: decide se o path cai no bucket estreito de auth. */
export function isAuthRateLimited(pathname: string): boolean {
  return (
    pathname === "/login" ||
    AUTH_RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

// Métodos que mutam estado — os únicos que um ataque de CSRF explora.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const isProd = process.env.NODE_ENV === "production";

/**
 * Defesa em profundidade contra CSRF: uma mutação é cross-origin quando o
 * header `Origin` existe e seu host difere do host da requisição.
 *
 * O Next.js já valida Origin↔Host nas Server Actions internamente; esta é uma
 * segunda barreira explícita, no edge, para qualquer requisição mutante.
 *
 * - Métodos seguros (GET/HEAD/OPTIONS) nunca são bloqueados.
 * - `Origin` ausente NÃO bloqueia: navegadores enviam Origin em toda mutação,
 *   então a ausência indica cliente não-browser (healthcheck, curl) — que não
 *   é vetor de CSRF. Bloquear quebraria integrações legítimas sem ganho.
 * - `Origin` malformado é tratado como cross-origin (bloqueia).
 *
 * `x-forwarded-host` tem prioridade sobre `host` porque em prod (Heroku) o app
 * roda atrás de proxy e o host real chega no header encaminhado.
 */
export function isCrossOriginMutation(req: NextRequest): boolean {
  if (!UNSAFE_METHODS.has(req.method)) return false;

  const origin = req.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return originHost !== host;
}

function attachRateLimitHeaders(res: NextResponse, result: RateLimitResult) {
  res.headers.set("X-RateLimit-Limit", String(result.limit));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  res.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));
}

function generateNonce(): string {
  // Edge-safe: btoa + crypto.randomUUID estão disponíveis no edge runtime.
  return btoa(crypto.randomUUID());
}

function buildStrictCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts carregados por um script com nonce/hash herdam
    // a confiança, eliminando a necessidade de whitelisting de hosts.
    `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
    // Tailwind v4 em prod gera CSS estático, mas Next/Tailwind ainda podem
    // injetar estilos inline em alguns casos. unsafe-inline em style é OK —
    // CSS injection é vetor de ataque muito mais limitado que JS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://accounts.google.com",
    // 'self' (não 'none'): o DetailModal do dashboard carrega a página de
    // detalhe em <iframe> do próprio site. Clickjacking externo continua
    // bloqueado — só o nosso próprio domínio pode nos embutir.
    "frame-ancestors 'self'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * `NextResponse.next()` marca a resposta com este header: é o sinal para o Next
 * seguir para a página/rota. Toda resposta SEM ele (429, 403, redirect) já é a
 * resposta final — recriar com `.next()` a transformaria em "pode passar".
 */
const PASS_THROUGH_HEADER = "x-middleware-next";

export function applySecurityHeaders(
  req: NextRequest,
  baseResponse: NextResponse,
): NextResponse {
  if (!isProd) return baseResponse;

  // Gera nonce por request e injeta na CSP.
  const nonce = generateNonce();
  const csp = buildStrictCsp(nonce);

  // Repassa o nonce pro RSC via header de request (Next.js auto-aplica em
  // scripts inline injetados pelo framework, e qualquer <Script> custom
  // pode lê-lo via next/headers().get('x-nonce')).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  // Resposta final (redirect, 429 do rate limit, 403 do CSRF): mantém status e
  // corpo originais e só anexa a CSP. Antes só o 3xx era preservado, e o 429/403
  // caíam no `NextResponse.next()` abaixo — o bloqueio sumia e a requisição
  // seguia para o app como se nada tivesse acontecido.
  if (!baseResponse.headers.has(PASS_THROUGH_HEADER)) {
    baseResponse.headers.set("Content-Security-Policy", csp);
    return baseResponse;
  }
  // Pass-through: recria o response com os headers de request atualizados (nonce).
  const next = NextResponse.next({
    request: { headers: requestHeaders },
  });
  // Preserva headers já setados (rate limit) no novo response.
  baseResponse.headers.forEach((v, k) => next.headers.set(k, v));
  next.headers.set("Content-Security-Policy", csp);
  return next;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limiting não faz sentido em dev: sem proxy, todos os requests caem
  // no mesmo bucket "unknown" e 300 req/min é fácil de atingir com HMR.
  if (!isProd) {
    if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
    if (hasSession) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const ip = getClientIp(req);

  const isAuthRoute = isAuthRateLimited(pathname);
  const bucket = isAuthRoute ? RATE_LIMITS.auth : RATE_LIMITS.general;
  const rl = rateLimit(`${isAuthRoute ? "auth" : "general"}:${ip}`, bucket.limit, bucket.windowMs);

  if (!rl.ok) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    const res = new NextResponse("Too Many Requests", { status: 429 });
    res.headers.set("Retry-After", String(retryAfter));
    attachRateLimitHeaders(res, rl);
    return applySecurityHeaders(req, res);
  }

  // CSRF: bloqueia mutações cross-origin. Isento /api/auth/* — o NextAuth tem
  // seu próprio token CSRF e os callbacks OAuth chegam por GET (não mutantes).
  if (!pathname.startsWith("/api/auth/") && isCrossOriginMutation(req)) {
    const res = new NextResponse("Forbidden", { status: 403 });
    attachRateLimitHeaders(res, rl);
    return applySecurityHeaders(req, res);
  }

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next();
    attachRateLimitHeaders(res, rl);
    return applySecurityHeaders(req, res);
  }

  const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (hasSessionCookie) {
    const res = NextResponse.next();
    attachRateLimitHeaders(res, rl);
    return applySecurityHeaders(req, res);
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  if (pathname !== "/") {
    url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  }
  const res = NextResponse.redirect(url);
  attachRateLimitHeaders(res, rl);
  return applySecurityHeaders(req, res);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot)$).*)",
  ],
};
