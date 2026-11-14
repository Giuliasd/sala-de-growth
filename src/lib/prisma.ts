import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { ehBancoLocal } from './db-url'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL não está definida')
  const isLocal = ehBancoLocal(connectionString)
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    // Antes usávamos idleTimeoutMillis: 0 (nunca fechar conexão ociosa) para
    // manter o pool sempre quente e evitar o handshake TCP+TLS ao RDS a cada
    // load. O problema: num tier instável (Heroku Postgres essential-0), o
    // servidor derruba a conexão num blip, mas o pool continua achando que ela
    // está viva — e o próximo uso estoura "timeout exceeded when trying to
    // connect". Com um idle timeout finito, conexões ociosas (e as mortas) são
    // recicladas; durante uso ativo elas seguem quentes dentro da janela.
    idleTimeoutMillis: 30_000,   // recicla conexão ociosa após 30s
    keepAlive: true,             // TCP keepalive: evita drop silencioso da conexão ociosa
    // Teto de conexões POR DYNO. O essential-0 aceita 20 conexões no total, e
    // esse total é compartilhado entre todos os dynos + release phase + psql.
    // Com 2 dynos a 10, o limite do plano já está estourado — e conexão
    // recusada aparece como lentidão e erro de página. Ajuste via env ao
    // escalar dynos, em vez de editar o código.
    max: Number(process.env.DB_POOL_MAX) || 10,
    // Quanto esperar por uma conexão do pool antes de desistir. O valor tem que
    // caber no orçamento de 30s do router do Heroku, contando que `withDbRetry`
    // TENTA DUAS VEZES e que uma página faz várias leituras em sequência:
    //
    //   gate de sessão (1 bloco com retry) + getWeeklyActivity (2 blocos)
    //     = até 6 esperas por conexão numa request do /dashboard
    //
    // Com 10s isso dava ~60s no pior caso: o router cortava em 30s com H12 e a
    // pessoa via carregamento infinito em vez do error boundary. Com 3s cabe
    // (~18s), e a falha aparece como "Não foi possível carregar / Tentar
    // novamente" em segundos. Um banco saudável conecta em muito menos que 3s,
    // então isso não afeta o caminho felizmente.
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 3_000,
  })
  // Conexões de fundo podem cair (failover do RDS, blip de rede). O pg descarta
  // o client com erro do pool automaticamente; só precisamos não deixar o erro
  // não-tratado derrubar o processo do dyno.
  pool.on('error', (err) => {
    console.error('[prisma] erro em conexão ociosa do pool pg:', err.message)
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

/**
 * Executa uma query tolerando UMA falha transitória.
 *
 * O essential-0 do Heroku recusa conexão esporadicamente (P1001 / "timeout
 * exceeded when trying to connect"), e o gate de sessão faz leituras no caminho
 * crítico de TODA página autenticada. Sem retry, um blip de milissegundos no
 * banco virava erro de página — ou, pior, logout (ver `lib/auth.ts`).
 *
 * Uma tentativa extra, curta, absorve o blip. Se a segunda também falhar, o
 * erro sobe: aí é indisponibilidade real, não ruído.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, delayMs = 150): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return fn()
  }
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop: string | symbol) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createClient()
    }
    return (globalForPrisma.prisma as any)[prop]
  }
})
