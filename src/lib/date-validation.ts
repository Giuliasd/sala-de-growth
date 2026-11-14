import { z } from "zod";

/**
 * Trava de datas plausíveis — vale para TODA data que o usuário digita.
 *
 * Por que existe: o campo de data do navegador aceita qualquer ano de 4+
 * dígitos, e os schemas só conferiam o formato "yyyy-mm-dd" (alguns nem isso).
 * Em produção, um experimento ficou com início em 24/09/2926 (2026 com um
 * dígito trocado). A timeline do Roadmap, que vai da menor à maior data, passou
 * a cobrir ~900 anos e a página inteira travou. A faixa abaixo é larga o
 * suficiente para qualquer planejamento real e estreita o bastante para pegar
 * um dígito trocado no ano.
 */
export const ANO_MINIMO = 2000;
export const ANO_MAXIMO = 2100;

export const MENSAGEM_DATA_INVALIDA = `Data inválida. Confira o ano: ele precisa estar entre ${ANO_MINIMO} e ${ANO_MAXIMO}.`;
export const MENSAGEM_ORDEM_DATAS = "A data de fim deve ser igual ou posterior à data de início.";

// "2026-09-24" (o que os formulários mandam) ou um ISO completo
// ("2026-09-24T00:00:00.000Z"), que alguns chamadores repassam.
const FORMATO = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function isDataPlausivel(valor: string): boolean {
  if (!FORMATO.test(valor)) return false;
  const ano = Number(valor.slice(0, 4));
  if (ano < ANO_MINIMO || ano > ANO_MAXIMO) return false;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return false;
  // Só a data: o dia precisa existir no calendário (31/02 vira 03/03 no Date).
  if (valor.length === 10) return data.toISOString().slice(0, 10) === valor;
  return true;
}

/** Data obrigatória. */
export const dataSchema = z.string().refine(isDataPlausivel, MENSAGEM_DATA_INVALIDA);

/** Data opcional: ausente, null ou "" (campo limpo) significam "sem data". */
export const dataOpcionalSchema = dataSchema.nullable().optional().or(z.literal(""));

/**
 * Para as actions que recebem a data como argumento solto (marcos de
 * lançamento/análise, arraste no roadmap), fora de um schema.
 */
export function conferirData(valor: string | null | undefined): string | null {
  return valor && !isDataPlausivel(valor) ? MENSAGEM_DATA_INVALIDA : null;
}

/**
 * Início ≤ fim numa edição PARCIAL. Os schemas só comparam quando as duas
 * datas chegam juntas; editar só o início (o campo do detalhe faz isso) passava
 * sem conferir — foi assim que o início em 2926 ficou depois do fim em 2026.
 * Aqui a data que não veio na edição é a que já está salva.
 *
 * Devolve a mensagem de erro, ou null se estiver tudo certo.
 */
export function conferirOrdemDatas(
  edicao: { startDate?: string | null; endDate?: string | null },
  salvo: { startDate: Date | null; endDate: Date | null }
): string | null {
  const inicio = "startDate" in edicao ? (edicao.startDate ? new Date(edicao.startDate) : null) : salvo.startDate;
  const fim = "endDate" in edicao ? (edicao.endDate ? new Date(edicao.endDate) : null) : salvo.endDate;
  if (inicio && fim && fim < inicio) return MENSAGEM_ORDEM_DATAS;
  return null;
}

/**
 * Início ≤ fim quando as duas datas chegam juntas (criar e editar checkpoint,
 * edição em massa que muda as duas). Início vazio passa: o checkpoint sem
 * início é um prazo solto. Para `.refine` nos schemas.
 */
export function datasEmOrdem(v: { startDate?: string | null; dueDate?: string }): boolean {
  if (!v.startDate || !v.dueDate) return true;
  return new Date(v.dueDate) >= new Date(v.startDate);
}

/**
 * Edição em massa que muda UMA das datas: quais itens ficariam com o fim antes
 * do início, comparando com a outra data já salva em cada um. Devolve os nomes
 * (para a mensagem dizer quem barrou), vazio se todos ficam em ordem.
 */
export function nomesComDatasInvertidas(
  edicao: { startDate?: string | null; dueDate?: string },
  itens: { name: string; startDate: Date | null; dueDate: Date }[]
): string[] {
  const parcial: { startDate?: string | null; endDate?: string | null } = {};
  if (edicao.startDate !== undefined) parcial.startDate = edicao.startDate;
  if (edicao.dueDate !== undefined) parcial.endDate = edicao.dueDate;
  return itens
    .filter((i) => conferirOrdemDatas(parcial, { startDate: i.startDate, endDate: i.dueDate }) !== null)
    .map((i) => i.name);
}
