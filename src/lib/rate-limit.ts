/**
 * Rate limiter simples em memória (Map + janela fixa).
 *
 * Pensado pra rodar dentro do middleware do Next.js (edge runtime). O Map fica
 * no escopo do módulo, o que significa:
 *   - Persiste durante a vida do worker
 *   - NÃO compartilha entre instâncias (cada worker tem seu próprio contador)
 *
 * Para um app interno com tráfego baixo isso é aceitável. Para escala maior
 * com múltiplos workers/regiões, migrar pra Redis (ex: @upstash/ratelimit).
 *
 * Janela fixa em vez de sliding por simplicidade — pico no fim/início da
 * janela pode dobrar o limite efetivo, mas é trade-off aceitável.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Limpeza oportunística: a cada N chamadas, remove entradas expiradas.
let opCount = 0;
const CLEANUP_INTERVAL = 1000;

function cleanup(now: number) {
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
};

/**
 * Consome 1 token do bucket identificado por `key`.
 *
 * @param key      Identificador do bucket (ex: `auth:${ip}` ou `general:${ip}`)
 * @param limit    Máximo de requisições por janela
 * @param windowMs Duração da janela em ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  opCount++;
  if (opCount % CLEANUP_INTERVAL === 0) cleanup(now);

  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, limit, resetAt };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, limit, resetAt: entry.resetAt };
  }

  entry.count++;
  return { ok: true, remaining: limit - entry.count, limit, resetAt: entry.resetAt };
}

/**
 * Extrai o IP do cliente do request, dando preferência aos headers de proxy
 * (x-forwarded-for / x-real-ip). Cai num placeholder se nada estiver disponível
 * — limite por IP-desconhecido vira limite global de fato.
 *
 * Em `x-forwarded-for` vale o ÚLTIMO item, não o primeiro. O router do Heroku
 * ACRESCENTA o IP de quem conectou ao fim da lista; tudo antes disso veio do
 * próprio cliente e pode ser inventado. Com o primeiro item, bastava girar o
 * header a cada request para nunca cair no limite — ou, pior, fixar o IP do
 * escritório para esgotar o bucket compartilhado do time.
 * (Pressupõe um único proxy de confiança na frente do app, que é o Heroku.)
 */
export function getClientIp(req: { headers: Headers }): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
