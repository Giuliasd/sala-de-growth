/**
 * Hook de instrumentação do Next.js — roda uma vez quando o servidor sobe.
 *
 * Faz duas coisas, ambas para tirar o handshake TCP+TLS ao RDS do caminho
 * crítico de quem navega:
 *
 * 1. **Aquece o pool no boot** com um `SELECT 1` — sem isso, a PRIMEIRA visita
 *    (ex: /dashboard) paga a conexão inteira, somando centenas de ms a >1s.
 * 2. **Mantém 1 conexão viva** com um keepalive periódico (`lib/db-keepalive`).
 *    Sem ele, o aquecimento do boot dura só até o `idleTimeoutMillis` de 30s do
 *    pool: em ambiente de tráfego esparso (staging, madrugada), toda visita
 *    após uma pausa voltava a pagar reconexão — e no essential-0, que recusa
 *    conexão esporadicamente (P1001), isso virava segundos de espera.
 */
export async function register() {
  // O Prisma/pg só funcionam no runtime nodejs (não no edge, onde roda o middleware).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$queryRaw`SELECT 1`
    console.log('[instrumentation] pool do Postgres aquecido no boot')
  } catch (err) {
    // Não derrubar o boot se o banco estiver momentaneamente indisponível —
    // o pool reabre sob demanda no primeiro request.
    console.error(
      '[instrumentation] falha ao aquecer o pool no boot (seguindo mesmo assim):',
      err instanceof Error ? err.message : err,
    )
  }

  // Guarda em globalThis pelo mesmo motivo do client do Prisma: em dev o HMR
  // pode reavaliar módulos, e um segundo intervalo dobraria os pings à toa.
  const globalForKeepalive = globalThis as unknown as {
    dbKeepalive?: import('@/lib/db-keepalive').DbKeepaliveHandle
  }
  if (!globalForKeepalive.dbKeepalive) {
    const { startDbKeepalive } = await import('@/lib/db-keepalive')
    const { prisma } = await import('@/lib/prisma')
    globalForKeepalive.dbKeepalive = startDbKeepalive({
      ping: () => prisma.$queryRaw`SELECT 1`,
    })
    console.log('[instrumentation] keepalive do pool ativo')
  }
}
