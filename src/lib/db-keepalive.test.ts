import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEEPALIVE_INTERVAL_MS, startDbKeepalive } from "./db-keepalive";

describe("startDbKeepalive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pinga a cada intervalo, não imediatamente", async () => {
    const ping = vi.fn().mockResolvedValue(1);
    const handle = startDbKeepalive({ ping, intervalMs: 20_000 });

    expect(ping).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(ping).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(ping).toHaveBeenCalledTimes(4);

    handle.stop();
  });

  it("usa KEEPALIVE_INTERVAL_MS por padrão, que cabe na janela de idle de 30s", async () => {
    // A razão de existir do keepalive: zerar o relógio de ociosidade ANTES do
    // idleTimeoutMillis de 30s (lib/prisma.ts) reciclar a conexão.
    expect(KEEPALIVE_INTERVAL_MS).toBeLessThan(30_000);

    const ping = vi.fn().mockResolvedValue(1);
    const handle = startDbKeepalive({ ping });

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("falha de ping não propaga e não interrompe os próximos", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("P1001"));
    const handle = startDbKeepalive({ ping, intervalMs: 1_000, onError: () => {} });

    // Se a rejeição vazasse, o advance estouraria unhandled rejection.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ping).toHaveBeenCalledTimes(3);

    handle.stop();
  });

  it("loga só nas transições: uma linha ao falhar, uma ao voltar", async () => {
    const onError = vi.fn();
    const onLog = vi.fn();
    const ping = vi
      .fn()
      .mockRejectedValueOnce(new Error("blip 1"))
      .mockRejectedValueOnce(new Error("blip 2"))
      .mockRejectedValueOnce(new Error("blip 3"))
      .mockResolvedValue(1);

    const handle = startDbKeepalive({ ping, intervalMs: 1_000, onError, onLog });

    // 3 falhas seguidas → 1 única linha de erro (não inunda o log na indisponibilidade).
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain("blip 1");

    // Recupera → 1 única linha de volta, e sucesso contínuo fica silencioso.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog.mock.calls[0][0]).toContain("restabelecida");
    expect(onError).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("não sobrepõe pings quando um fica pendurado além do intervalo", async () => {
    // Cenário real: ping esperando connectionTimeout (3s) com intervalo menor.
    let resolveHang!: (v: unknown) => void;
    const ping = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveHang = r; }))
      .mockResolvedValue(1);

    const handle = startDbKeepalive({ ping, intervalMs: 1_000 });

    // 1º tick abre o ping pendurado; os 2 ticks seguintes devem ser pulados.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ping).toHaveBeenCalledTimes(1);

    resolveHang(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ping).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("stop() encerra os pings", async () => {
    const ping = vi.fn().mockResolvedValue(1);
    const handle = startDbKeepalive({ ping, intervalMs: 1_000 });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(ping).toHaveBeenCalledTimes(2);

    handle.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(ping).toHaveBeenCalledTimes(2);
  });
});
