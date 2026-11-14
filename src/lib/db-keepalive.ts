/**
 * Keepalive de aplicação para o pool do Postgres.
 *
 * O problema que resolve: o pool recicla conexão ociosa após 30s
 * (`idleTimeoutMillis` em `lib/prisma.ts`) — necessário porque o essential-0
 * derruba conexões silenciosamente. Só que em ambiente de tráfego esparso
 * (staging, madrugada em prod) isso significa que TODA visita após uma pausa
 * paga reconexão TCP+TLS ao RDS no caminho crítico, e o essential-0 ainda
 * recusa conexão esporadicamente (P1001), empilhando timeout + retry na cara
 * da pessoa.
 *
 * Um `SELECT 1` periódico, DENTRO da janela de idle, zera o relógio de
 * ociosidade de uma conexão — mantendo 1 conexão genuinamente viva. As demais
 * continuam expirando, que é o comportamento desejado.
 *
 * Vive em módulo próprio (e não inline no `instrumentation.ts`) para ser
 * testável com fake timers, no padrão dos outros módulos de lib.
 */

/**
 * 20s: precisa ser menor que os 30s de `idleTimeoutMillis` com folga para o
 * próprio ping (que pode demorar até `connectionTimeoutMillis` = 3s num blip).
 * Custo: 3 queries triviais por minuto — irrelevante até para o essential-0.
 */
export const KEEPALIVE_INTERVAL_MS = 20_000;

export interface DbKeepaliveHandle {
  stop(): void;
}

/**
 * Dispara `ping` a cada `intervalMs`, tolerando falhas.
 *
 * Falha de ping NUNCA propaga: o pool reabre sob demanda no próximo request,
 * exatamente como hoje — o keepalive é uma otimização, não um requisito. Para
 * não inundar o log durante uma indisponibilidade longa (um erro a cada 20s),
 * loga só nas TRANSIÇÕES: uma linha quando começa a falhar, uma quando volta.
 */
export function startDbKeepalive(opts: {
  ping: () => Promise<unknown>;
  intervalMs?: number;
  onLog?: (message: string) => void;
  onError?: (message: string) => void;
}): DbKeepaliveHandle {
  const intervalMs = opts.intervalMs ?? KEEPALIVE_INTERVAL_MS;
  const onLog = opts.onLog ?? ((m) => console.log(m));
  const onError = opts.onError ?? ((m) => console.error(m));

  let failing = false;
  // Evita pings sobrepostos se um deles ficar pendurado além do intervalo
  // (ex.: esperando connectionTimeout durante um blip).
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await opts.ping();
      if (failing) {
        failing = false;
        onLog("[keepalive] conexão com o Postgres restabelecida");
      }
    } catch (err) {
      if (!failing) {
        failing = true;
        onError(
          `[keepalive] ping ao Postgres falhou (novas tentativas seguem a cada ${Math.round(intervalMs / 1000)}s): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  // unref: o keepalive não deve segurar o processo vivo — sem isso, shutdown
  // do dyno (SIGTERM) e término de workers de build esperariam o timer.
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
