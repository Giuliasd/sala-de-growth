import { describe, expect, it } from "vitest";
import { ehBancoLocal } from "./db-url";

describe("ehBancoLocal", () => {
  it.each([
    "postgresql://postgres:x@localhost:5432/sala_de_growth",
    "postgres://a@127.0.0.1/db",
    "postgres://a@[::1]:5432/db",
    "postgresql://postgres:x@LOCALHOST:5432/db",
  ])("local: %s", (url) => {
    expect(ehBancoLocal(url)).toBe(true);
  });

  it.each([
    // O que o `includes("localhost")` antigo deixava passar:
    "postgres://u:p@localhost.example.com:5432/db",
    "postgres://u:senha-localhost@db.remoto.com:5432/db",
    "postgres://u:p@db.remoto.com:5432/db?application_name=localhost",
    "postgres://u:p@127.0.0.1.nip.io:5432/db",
    "postgres://u:p@ec2-1-2-3-4.compute-1.amazonaws.com:5432/d1",
    "não é url",
    "",
    undefined,
  ])("não local: %s", (url) => {
    expect(ehBancoLocal(url)).toBe(false);
  });
});
