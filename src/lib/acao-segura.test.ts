import { describe, expect, it, vi } from "vitest";
import { acaoSegura, MENSAGEM_FALHA_DE_REDE } from "./acao-segura";

describe("acaoSegura", () => {
  it("resposta da action passa intacta (sucesso ou erro dela)", async () => {
    expect(await acaoSegura(Promise.resolve({ success: true, data: 1 }))).toEqual({ success: true, data: 1 });
    expect(await acaoSegura(Promise.resolve({ success: false, error: "Nome curto." }))).toEqual({
      success: false,
      error: "Nome curto.",
    });
  });

  it("chamada que rejeita (rede, deploy no meio) vira erro comum — nunca rejeita", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await acaoSegura(Promise.reject(new Error("Failed to fetch")));
    expect(r).toEqual({ success: false, error: MENSAGEM_FALHA_DE_REDE });
    spy.mockRestore();
  });
});
