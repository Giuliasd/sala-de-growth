/**
 * Histórico de mudanças de iniciativas e experimentos — as regras puras.
 *
 * Cada edição grava "o que mudou": o item é fotografado ANTES e DEPOIS da
 * gravação (`Snapshot`, valores já legíveis: "Em andamento", "Q3 2026", nomes) e a
 * diferença vira uma linha por campo (`Mudanca`). Guardar o texto legível, e não
 * o id, é de propósito: o histórico precisa continuar fazendo sentido depois que
 * uma frente é renomeada, um OKR some ou um membro é desativado.
 *
 * O banco fica em `historico-db.ts`; aqui não há I/O.
 */

export type EntidadeDoHistorico = "iniciativa" | "experimento";

export type CampoDoHistorico =
  | "nome"
  | "status"
  | "prioridade"
  | "frente"
  | "quarter"
  | "okr"
  | "inicio"
  | "fim"
  | "lancamento"
  | "analise"
  | "resultado"
  | "link"
  | "responsaveis"
  | "descricao"
  | "objetivo"
  | "ice"
  | "criado"
  | "excluido"
  | "convertido"
  | "checkpoint"
  /** Ordem dos checkpoints mudou (arrastar). */
  | "ordem"
  /** Tags de checkpoint do item: criada, renomeada, cor, excluída. */
  | "tag";

/** Ordem em que as mudanças de uma mesma edição aparecem. */
const ORDEM: CampoDoHistorico[] = [
  "nome", "status", "prioridade", "resultado", "responsaveis", "frente", "quarter", "okr",
  "inicio", "fim", "lancamento", "analise", "link", "descricao", "objetivo", "ice",
  "criado", "excluido", "convertido", "checkpoint", "ordem", "tag",
];

export const ROTULO_DO_CAMPO: Record<CampoDoHistorico, string> = {
  nome: "Nome",
  status: "Status",
  prioridade: "Prioridade",
  frente: "Frente",
  quarter: "Quarter",
  okr: "OKR",
  inicio: "Início",
  fim: "Fim",
  lancamento: "Lançamento",
  analise: "Análise",
  resultado: "Resultado",
  link: "Link do documento",
  responsaveis: "Responsáveis",
  descricao: "Descrição",
  objetivo: "Objetivo",
  ice: "ICE",
  criado: "Criação",
  excluido: "Exclusão",
  convertido: "Conversão",
  checkpoint: "Checkpoint",
  ordem: "Ordem dos checkpoints",
  tag: "Tags",
};

/** Texto longo: grava só que mudou, não os dois textos inteiros. */
const CAMPOS_LONGOS = new Set<CampoDoHistorico>(["descricao", "objetivo"]);

/** Valores legíveis por campo; "" = vazio. */
export type Snapshot = Partial<Record<CampoDoHistorico, string>>;

export type Mudanca = {
  campo: CampoDoHistorico;
  de: string | null;
  para: string | null;
  /** Contexto extra (ex.: o nome do checkpoint). */
  detalhe?: string | null;
};

/**
 * O que mudou entre as duas fotos. Só compara campos presentes nas DUAS: campo
 * ausente de uma foto é "não rastreado" (iniciativa não tem ICE), e tratá-lo como
 * vazio registraria uma mudança que ninguém fez. Ignora o que ficou igual.
 */
export function diffDeSnapshots(antes: Snapshot, depois: Snapshot): Mudanca[] {
  const mudancas: Mudanca[] = [];
  for (const campo of ORDEM) {
    if (!(campo in antes) || !(campo in depois)) continue;
    const a = antes[campo] ?? "";
    const d = depois[campo] ?? "";
    if (a === d) continue;
    const longo = CAMPOS_LONGOS.has(campo);
    mudancas.push({ campo, de: longo ? null : a || null, para: longo ? null : d || null });
  }
  return mudancas;
}

/** Nomes de uma lista guardada como "Ana, Bia". */
export function nomesDaLista(valor: string | null | undefined): string[] {
  return (valor ?? "").split(",").map((n) => n.trim()).filter(Boolean);
}

/** Junta nomes em ordem alfabética: a foto não varia com a ordem do banco. */
export function juntarNomes(nomes: string[]): string {
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).join(", ");
}

/** A frase que a tela mostra para um evento. */
export function descreverMudanca(m: Mudanca): string {
  switch (m.campo) {
    case "criado":
      return m.detalhe ? `Criou o item (${m.detalhe})` : "Criou o item";
    case "excluido":
      return "Excluiu o item";
    case "convertido":
      return m.para ? `Converteu em ${m.para}` : "Converteu o item";
    case "checkpoint":
      return `Checkpoint "${m.detalhe ?? "—"}": ${m.para ?? "alterado"}`;
    case "ordem":
      return "Reordenou os checkpoints";
    case "tag":
      return `Tags: ${m.para ?? "alteradas"}`;
    case "descricao":
    case "objetivo":
      return `Alterou ${ROTULO_DO_CAMPO[m.campo].toLowerCase()}`;
    case "responsaveis": {
      const antes = new Set(nomesDaLista(m.de));
      const depois = new Set(nomesDaLista(m.para));
      const entraram = [...depois].filter((n) => !antes.has(n));
      const sairam = [...antes].filter((n) => !depois.has(n));
      const partes = [
        entraram.length ? `adicionou ${entraram.join(", ")}` : "",
        sairam.length ? `removeu ${sairam.join(", ")}` : "",
      ].filter(Boolean);
      return `Responsáveis: ${partes.join("; ") || "alterados"}`;
    }
    default:
      return `${ROTULO_DO_CAMPO[m.campo]}: ${m.de ?? "—"} → ${m.para ?? "—"}`;
  }
}

export const ROTULO_DA_PRIORIDADE: Record<string, string> = {
  URGENTE: "Urgente",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

export const ROTULO_DO_RESULTADO: Record<string, string> = {
  SUCESSO: "Sucesso",
  PARCIAL: "Parcial",
  FALHA: "Falha",
};

export const ROTULO_DA_ACAO_ICE: Record<string, string> = {
  EXECUTAR_AGORA: "Executar agora",
  EM_SEGUIDA: "Em seguida",
  BACKLOG: "Backlog",
  ARQUIVAR: "Arquivar",
};

// ─── Checkpoints ──────────────────────────────────────────────────────────────

export const ROTULO_DA_CATEGORIA: Record<string, string> = {
  COMUNICACAO: "Comunicação",
  MARCO: "Marco",
};

/**
 * O checkpoint como o usuário o vê, em texto (nomes, não ids — mesma razão do
 * `Snapshot` do item). As listas vêm em ordem alfabética.
 */
export type FotoDoCheckpoint = {
  nome: string;
  /** dd/mm/aaaa */
  prazo: string;
  /** Rótulo da categoria; "" = comum. */
  categoria: string;
  responsaveis: string[];
  tags: string[];
  /** Marco: os checkpoints necessários para ele. */
  requisitos: string[];
  /** Os marcos de que este checkpoint é necessário. */
  marcos: string[];
};

/** "adicionou A, B; removeu C" — ou null se as listas são iguais. */
function diffDeLista(antes: readonly string[], depois: readonly string[]): string | null {
  const a = new Set(antes);
  const d = new Set(depois);
  const entraram = depois.filter((x) => !a.has(x));
  const sairam = antes.filter((x) => !d.has(x));
  const partes = [
    entraram.length ? `adicionou ${entraram.join(", ")}` : "",
    sairam.length ? `removeu ${sairam.join(", ")}` : "",
  ].filter(Boolean);
  return partes.length ? partes.join("; ") : null;
}

/**
 * O que mudou num checkpoint: uma linha por aspecto (prazo, nome, categoria,
 * responsáveis, tags, necessários, marcos), todas com o nome do checkpoint como
 * contexto. Ordem e conclusão têm eventos próprios.
 */
export function diffDeCheckpoint(antes: FotoDoCheckpoint, depois: FotoDoCheckpoint): Mudanca[] {
  const linhas: string[] = [];
  if (antes.prazo !== depois.prazo) linhas.push(`prazo ${antes.prazo} → ${depois.prazo}`);
  if (antes.nome !== depois.nome) linhas.push(`renomeado (era "${antes.nome}")`);
  if (antes.categoria !== depois.categoria) {
    linhas.push(`categoria: ${antes.categoria || "comum"} → ${depois.categoria || "comum"}`);
  }
  const listas: [string, keyof FotoDoCheckpoint][] = [
    ["responsáveis", "responsaveis"],
    ["tags", "tags"],
    ["necessários", "requisitos"],
    ["marcos", "marcos"],
  ];
  for (const [rotulo, campo] of listas) {
    const d = diffDeLista(antes[campo] as string[], depois[campo] as string[]);
    if (d) linhas.push(`${rotulo}: ${d}`);
  }
  return linhas.map((para) => ({ campo: "checkpoint" as const, de: null, para, detalhe: depois.nome }));
}
