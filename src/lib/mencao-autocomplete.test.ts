import { describe, expect, it } from "vitest";
import { aplicarMencao, detectarMencaoEmCurso, sugerirMembros } from "./mencao-autocomplete";
import { extrairMencoes } from "./notificacoes";

describe("detectarMencaoEmCurso", () => {
  it("'@' no começo do texto", () => {
    expect(detectarMencaoEmCurso("@An", 3)).toEqual({ inicio: 0, consulta: "An" });
  });

  it("'@' depois de espaço, no meio da frase", () => {
    expect(detectarMencaoEmCurso("oi @Bi", 6)).toEqual({ inicio: 3, consulta: "Bi" });
  });

  it("'@' depois de quebra de linha", () => {
    expect(detectarMencaoEmCurso("oi\n@", 4)).toEqual({ inicio: 3, consulta: "" });
  });

  it("só o '@' recém-digitado abre a lista com consulta vazia", () => {
    expect(detectarMencaoEmCurso("oi @", 4)).toEqual({ inicio: 3, consulta: "" });
  });

  it("e-mail não abre sugestão", () => {
    expect(detectarMencaoEmCurso("ana@dom", 7)).toBeNull();
  });

  it("sem '@' antes do cursor, nada", () => {
    expect(detectarMencaoEmCurso("oi tudo", 7)).toBeNull();
  });

  it("o cursor antes do '@' não conta (o '@' fica depois dele)", () => {
    expect(detectarMencaoEmCurso("oi @Bia", 2)).toBeNull();
  });

  it("quebra de linha entre o '@' e o cursor encerra", () => {
    expect(detectarMencaoEmCurso("@Ana\nvalor", 10)).toBeNull();
  });

  it("consulta enorme não é nome", () => {
    expect(detectarMencaoEmCurso("@" + "a".repeat(60), 61)).toBeNull();
  });

  it("aceita espaço (nome composto sendo digitado)", () => {
    expect(detectarMencaoEmCurso("@Ana Pa", 7)).toEqual({ inicio: 0, consulta: "Ana Pa" });
  });
});

describe("sugerirMembros", () => {
  const time = [
    { id: "1", name: "José Silva" },
    { id: "2", name: "Ana Paula" },
    { id: "3", name: "Ana" },
    { id: "4", name: "Bia Souza" },
    { id: "5", name: "Carlos" },
  ];

  it("começa-com vem antes de 'palavra do meio'", () => {
    expect(sugerirMembros("s", time).map((m) => m.id)).toEqual(["4", "1"]); // Souza (começa) antes de José Silva
  });

  it("ignora acento e caixa", () => {
    expect(sugerirMembros("JOSE", time).map((m) => m.id)).toEqual(["1"]);
  });

  it("acha pelo sobrenome", () => {
    expect(sugerirMembros("silva", time).map((m) => m.id)).toEqual(["1"]);
  });

  it("consulta vazia lista em ordem alfabética, até o limite", () => {
    expect(sugerirMembros("", time, 3).map((m) => m.id)).toEqual(["3", "2", "4"]);
  });

  it("sem correspondência, lista vazia", () => {
    expect(sugerirMembros("zzz", time)).toEqual([]);
  });

  it("consulta que já virou o nome inteiro mais um espaço some (a pessoa seguiu escrevendo)", () => {
    expect(sugerirMembros("Ana Paula oi", time)).toEqual([]);
  });
});

describe("aplicarMencao", () => {
  it("troca '@consulta' pelo nome completo e põe o cursor depois do espaço", () => {
    const r = aplicarMencao("oi @An aqui", { inicio: 3, consulta: "An" }, 6, "Ana Paula");
    expect(r.texto).toBe("oi @Ana Paula  aqui");
    expect(r.cursor).toBe(3 + "@Ana Paula ".length);
  });

  it("no fim do texto", () => {
    const r = aplicarMencao("@Bi", { inicio: 0, consulta: "Bi" }, 3, "Bia Souza");
    expect(r).toEqual({ texto: "@Bia Souza ", cursor: 11 });
  });

  it("o texto produzido é reconhecido pelo servidor como menção", () => {
    const time = [{ id: "bia", name: "Bia Souza" }];
    const r = aplicarMencao("@Bi", { inicio: 0, consulta: "Bi" }, 3, "Bia Souza");
    expect(extrairMencoes(r.texto + "olha isso", time)).toEqual(["bia"]);
  });
});
