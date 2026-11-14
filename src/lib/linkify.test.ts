import { describe, expect, it } from "vitest";
import { dividirEmLinks } from "./linkify";

const links = (texto: string) =>
  dividirEmLinks(texto).flatMap((t) => (t.tipo === "link" ? [t.href] : []));

describe("dividirEmLinks", () => {
  it("texto sem link volta inteiro", () => {
    expect(dividirEmLinks("só texto")).toEqual([{ tipo: "texto", texto: "só texto" }]);
  });

  it("texto vazio não gera trechos", () => {
    expect(dividirEmLinks("")).toEqual([]);
  });

  it("separa o link do texto em volta", () => {
    expect(dividirEmLinks("veja https://exemplo.com/doc agora")).toEqual([
      { tipo: "texto", texto: "veja " },
      { tipo: "link", texto: "https://exemplo.com/doc", href: "https://exemplo.com/doc" },
      { tipo: "texto", texto: " agora" },
    ]);
  });

  it("www sem esquema ganha https no href, mas mostra como foi escrito", () => {
    expect(dividirEmLinks("www.exemplo.com")).toEqual([
      { tipo: "link", texto: "www.exemplo.com", href: "https://www.exemplo.com" },
    ]);
  });

  it("mantém http", () => {
    expect(links("http://exemplo.com")).toEqual(["http://exemplo.com"]);
  });

  it("não leva a pontuação da frase para dentro do link", () => {
    expect(links("acesse https://exemplo.com/a.")).toEqual(["https://exemplo.com/a"]);
    expect(links("https://exemplo.com/a, depois")).toEqual(["https://exemplo.com/a"]);
    expect(links("pronto?! https://exemplo.com/a!")).toEqual(["https://exemplo.com/a"]);
  });

  it("parêntese que fecha a frase fica de fora, o que é do endereço fica", () => {
    expect(links("(https://exemplo.com/a)")).toEqual(["https://exemplo.com/a"]);
    expect(links("https://pt.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      "https://pt.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });

  it("acha mais de um link, também em linhas diferentes", () => {
    expect(links("a https://um.com\nb www.dois.com")).toEqual([
      "https://um.com",
      "https://www.dois.com",
    ]);
  });

  it("mantém query e âncora", () => {
    expect(links("https://exemplo.com/a?x=1&y=2#topo")).toEqual(["https://exemplo.com/a?x=1&y=2#topo"]);
  });

  it("nunca vira link com esquema perigoso", () => {
    expect(links("javascript:alert(1)")).toEqual([]);
    expect(links("data:text/html,<b>oi</b>")).toEqual([]);
  });

  it("esquema ou www sozinhos são texto", () => {
    expect(links("https:// e www. soltos")).toEqual([]);
  });

  it("www no meio de uma palavra não é link", () => {
    expect(links("meuwww.site")).toEqual([]);
  });

  it("a concatenação dos trechos devolve o texto original", () => {
    const original = "ver https://exemplo.com/a. e (www.outro.com) fim";
    expect(
      dividirEmLinks(original)
        .map((t) => t.texto)
        .join("")
    ).toBe(original);
  });
});
