/**
 * Tipos do registro da semana que o `weekly-activity` precisa conhecer.
 *
 * Moram num arquivo sem nenhum import de propósito: o `weekly-activity` é
 * importado por quase tudo, e puxar `lib/registro-semanal` para ele fechava um
 * ciclo (o registro importa os tipos da Weekly) que deixava a carga do módulo
 * dez vezes mais lenta nos testes.
 */

export type Desfecho = "CONCLUIDO" | "REMARCADO" | "ABERTO" | "EXCLUIDO" | "EM_ANDAMENTO";
export type Origem = "PLANEJADO" | "ENTROU";

/** O que a linha do checkpoint mostra sobre a passagem dele pela semana. */
export type AnotacaoDoRegistro = {
  desfecho: Desfecho;
  origem: Origem;
  registradoEm: Date;
  prazoAoEntrar: Date;
  /** O prazo de hoje (semana aberta) ou o do fechamento. */
  prazo: Date;
  remarcacoes: number;
  excluidoEm: Date | null;
  excluidoPor: string | null;
  concluidoEm: Date | null;
  caminho: string | null;
  /** Já não está na lista viva da semana: aparece só pelo registro. */
  fantasma: boolean;
  /** A semana fechou: a linha é a foto, sem edição. */
  fechada: boolean;
};
