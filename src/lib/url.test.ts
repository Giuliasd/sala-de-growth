import { describe, expect, it } from "vitest";
import { safeHttpUrl, safeInternalPath } from "./url";

describe("safeHttpUrl", () => {
  describe("rejeita schemes perigosos (anti-XSS)", () => {
    const dangerous = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "  javascript:alert(1)",
      "\tjavascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.com",
      "blob:https://example.com/abc",
      "about:blank",
    ];

    for (const url of dangerous) {
      it(`rejeita ${JSON.stringify(url)}`, () => {
        const result = safeHttpUrl.safeParse(url);
        expect(result.success).toBe(false);
      });
    }
  });

  describe("aceita URLs http/https válidas", () => {
    const valid = [
      "http://example.com",
      "https://exemplo.com.br",
      "https://exemplo.com.br/path/to/page",
      "https://exemplo.com.br/path?query=1&other=2",
      "https://sub.exemplo.com.br:8080/path#hash",
      "HTTP://EXAMPLE.COM",
      "HTTPS://example.com",
    ];

    for (const url of valid) {
      it(`aceita ${JSON.stringify(url)}`, () => {
        const result = safeHttpUrl.safeParse(url);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("rejeita inputs malformados", () => {
    const malformed = ["", "not a url", "://", "http:", "://example.com"];

    for (const input of malformed) {
      it(`rejeita ${JSON.stringify(input)}`, () => {
        const result = safeHttpUrl.safeParse(input);
        expect(result.success).toBe(false);
      });
    }
  });

  it("rejeita não-string", () => {
    expect(safeHttpUrl.safeParse(123).success).toBe(false);
    expect(safeHttpUrl.safeParse(null).success).toBe(false);
    expect(safeHttpUrl.safeParse(undefined).success).toBe(false);
  });
});

/**
 * Achado da auditoria de segurança (13/11/2026): o filtro antigo da tela de
 * logout olhava só o 2º caractere, e "/\t/site.com" passava — o browser remove
 * o tab ao resolver e o "Voltar" levava para //site.com.
 */
describe("safeInternalPath", () => {
  it.each([
    "/dashboard",
    "/iniciativas/123?modal=1",
    "/rituais?semana=2026-11-09#weekly",
  ])("mantém caminho interno: %s", (caminho) => {
    expect(safeInternalPath(caminho)).toBe(caminho);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "\t//evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
  ])("cai no fallback quando sairia do app: %j", (valor) => {
    expect(safeInternalPath(valor)).toBe("/dashboard");
  });

  it("nunca devolve algo que resolva para outra origem", () => {
    for (const ch of ["\t", "\n", "\r", "\\", "/"]) {
      const resolvido = new URL(safeInternalPath(`/${ch}/evil.example`), "https://app.test");
      expect(resolvido.origin).toBe("https://app.test");
    }
  });

  it("usa o primeiro valor quando o parâmetro vem repetido, e respeita o fallback", () => {
    expect(safeInternalPath(["/okrs", "//evil.example"])).toBe("/okrs");
    expect(safeInternalPath(undefined, "/login")).toBe("/login");
  });
});
