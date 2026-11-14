/**
 * Formatação de lista de responsáveis em texto puro.
 *
 * Vive aqui, e não em `components/shared/MemberChips`, porque aquele módulo é
 * `"use client"`: chamar estas funções de um componente de servidor (a Weekly de
 * Rituais, por exemplo) estourava em runtime. `MemberChips` reexporta as duas
 * para os call sites antigos não precisarem mudar.
 */

export type NomeDeMembro = { name: string };

/** Nomes completos, separados por vírgula. "—" quando não há ninguém. */
export function formatMemberNames(members: NomeDeMembro[]): string {
  return members.length > 0 ? members.map((m) => m.name).join(", ") : "—";
}

/** Só os primeiros nomes, para colunas estreitas. */
export function formatMemberFirstNames(members: NomeDeMembro[]): string {
  return members.length > 0 ? members.map((m) => m.name.split(" ")[0]).join(", ") : "—";
}
