/**
 * Notificações — as regras, sem banco (o acesso está em `notificacoes-db.ts`).
 *
 * Quem recebe aviso, e de quê:
 *  - adicionada como responsável (iniciativa, experimento, checkpoint, KR, ação);
 *  - removida de responsável;
 *  - mencionada com @ num comentário;
 *  - comentário num item de que é responsável;
 *  - item de que é responsável foi convertido (iniciativa ⇄ experimento);
 *  - checkpoints de que é responsável foram duplicados.
 *
 * Três regras valem para tudo: quem fez a ação nunca recebe aviso dela; quem já
 * foi avisada de uma menção não recebe também o aviso genérico de comentário
 * (seriam dois avisos do mesmo comentário); e o que a pessoa desligou no Perfil
 * nem chega a ser criado.
 */

export type TipoDaNotificacao =
  | "RESPONSAVEL_ADICIONADO"
  | "RESPONSAVEL_REMOVIDO"
  | "MENCAO"
  | "COMENTARIO"
  | "ITEM_CONVERTIDO"
  | "ITEM_DUPLICADO";
export type AlvoDaNotificacao = "INICIATIVA" | "EXPERIMENTO" | "OKR" | "ACAO_SEMANA";

export type DadosDoAviso = {
  tipo: TipoDaNotificacao;
  alvo: AlvoDaNotificacao;
  alvoNome: string;
  /** Nome do checkpoint, quando o aviso é sobre um checkpoint do item. */
  subitem?: string | null;
  /** Quantos itens o aviso reúne (edição em massa, duplicação). Ausente = 1. */
  quantidade?: number;
  /** null = a pessoa que fez saiu do time. */
  autorNome: string | null;
};

const unicos = (ids: readonly string[]) => [...new Set(ids)];

/**
 * Quem entrou e quem saiu entre duas listas de responsáveis.
 * O autor fica de fora: ninguém é avisado do que fez a si mesmo.
 */
export function diffDeResponsaveis(
  antes: readonly string[],
  depois: readonly string[],
  autorId: string
): { adicionados: string[]; removidos: string[] } {
  const a = new Set(antes);
  const d = new Set(depois);
  return {
    adicionados: unicos(depois).filter((id) => !a.has(id) && id !== autorId),
    removidos: unicos(antes).filter((id) => !d.has(id) && id !== autorId),
  };
}

/** Minúsculas e sem acento: "José" e "jose" são a mesma menção. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const ehLetraOuNumero = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Quem foi mencionado com "@Nome Completo" no texto.
 *
 * O nome vem inteiro (o autocomplete do comentário insere o nome completo), e a
 * comparação ignora acento e caixa. Duas armadilhas tratadas:
 *  - "@Ana Paula" não pode contar também como "@Ana": os nomes mais longos são
 *    casados primeiro e o trecho casado fica reservado;
 *  - "@" colado numa palavra ("ana@dominio.com") é e-mail, não menção.
 */
export function extrairMencoes(
  texto: string,
  membros: readonly { id: string; name: string }[]
): string[] {
  const alvo = normalizar(texto);
  const reservado = new Array<boolean>(alvo.length).fill(false);
  const achados = new Set<string>();

  const ordenados = [...membros]
    .map((m) => ({ id: m.id, nome: normalizar(m.name).trim() }))
    .filter((m) => m.nome.length > 0)
    .sort((x, y) => y.nome.length - x.nome.length);

  for (const m of ordenados) {
    const chave = `@${m.nome}`;
    let de = 0;
    while (de < alvo.length) {
      const pos = alvo.indexOf(chave, de);
      if (pos === -1) break;
      de = pos + 1;
      const fim = pos + chave.length;
      if (ehLetraOuNumero(alvo[pos - 1])) continue; // e-mail
      if (ehLetraOuNumero(alvo[fim])) continue; // "@Ana" dentro de "@Anabela"
      if (reservado.slice(pos, fim).some(Boolean)) continue;
      for (let i = pos; i < fim; i++) reservado[i] = true;
      achados.add(m.id);
    }
  }
  return [...achados];
}

/**
 * Quem avisar por causa de um comentário novo.
 *  - `mencao`: mencionados (exceto o autor);
 *  - `comentario`: responsáveis do item que NÃO foram mencionados (exceto o autor).
 */
export function destinatariosDoComentario(args: {
  autorId: string;
  responsaveisIds: readonly string[];
  mencionadosIds: readonly string[];
}): { mencao: string[]; comentario: string[] } {
  const mencao = unicos(args.mencionadosIds).filter((id) => id !== args.autorId);
  const jaAvisados = new Set(mencao);
  const comentario = unicos(args.responsaveisIds).filter(
    (id) => id !== args.autorId && !jaAvisados.has(id)
  );
  return { mencao, comentario };
}

const TAMANHO_DO_TRECHO = 140;

/** O começo do comentário, numa linha, para caber no aviso. */
export function trechoDoComentario(conteudo: string): string {
  const limpo = conteudo.replace(/\s+/g, " ").trim();
  if (limpo.length <= TAMANHO_DO_TRECHO) return limpo;
  return `${limpo.slice(0, TAMANHO_DO_TRECHO).trimEnd()}…`;
}

// ─── Aviso agrupado ───────────────────────────────────────────────────────────

/** "A, B, C e mais 2": os primeiros nomes e quantos ficaram de fora. */
export function resumirNomes(nomes: readonly string[], max = 3): string {
  const lista = nomes.filter((n) => n.trim() !== "");
  if (lista.length <= max) return lista.join(", ");
  return `${lista.slice(0, max).join(", ")} e mais ${lista.length - max}`;
}

/** Um aviso ainda por criar, antes de saber se vai ser agrupado. */
export type AvisoCandidato = {
  destinatarioId: string;
  tipo: TipoDaNotificacao;
  alvo: AlvoDaNotificacao;
  alvoId: string;
  alvoNome: string;
  subitem: string | null;
};

export type AvisoAgrupado = AvisoCandidato & {
  quantidade: number;
  /** Lista de nomes quando reúne itens (o aviso individual não usa). */
  trecho: string | null;
};

/**
 * Junta, por pessoa, os avisos de uma mesma operação: uma edição em massa que
 * põe Ana em 5 iniciativas vira UM aviso ("em 5 iniciativas"), não cinco.
 *
 * A chave é pessoa + tipo + tipo de alvo. Em checkpoint a chave inclui também o
 * item (checkpoints de itens diferentes não viram um aviso só, porque o clique
 * abriria um item e esconderia o outro). Um aviso sozinho passa intacto.
 */
export function agruparAvisos(candidatos: readonly AvisoCandidato[]): AvisoAgrupado[] {
  const grupos = new Map<string, AvisoCandidato[]>();
  for (const c of candidatos) {
    const chave = [c.destinatarioId, c.tipo, c.alvo, c.subitem !== null ? c.alvoId : ""].join("|");
    const g = grupos.get(chave);
    if (g) g.push(c);
    else grupos.set(chave, [c]);
  }
  return [...grupos.values()].map((g) => {
    const primeiro = g[0];
    if (g.length === 1) return { ...primeiro, quantidade: 1, trecho: null };
    if (primeiro.subitem !== null) {
      // Checkpoints do mesmo item: o item continua sendo o destino.
      return { ...primeiro, quantidade: g.length, subitem: resumirNomes(g.map((x) => x.subitem ?? "")), trecho: null };
    }
    return { ...primeiro, quantidade: g.length, trecho: resumirNomes(g.map((x) => x.alvoNome)) };
  });
}

/** Aviso que reúne VÁRIOS itens (não checkpoints de um item): o clique leva à lista. */
export function ehGrupoDeItens(a: { quantidade?: number; subitem?: string | null }): boolean {
  return (a.quantidade ?? 1) > 1 && !a.subitem;
}

// ─── Texto ────────────────────────────────────────────────────────────────────

const EM: Record<AlvoDaNotificacao, string> = {
  INICIATIVA: "na iniciativa",
  EXPERIMENTO: "no experimento",
  OKR: "no KR",
  ACAO_SEMANA: "na ação",
};

const PLURAL: Record<AlvoDaNotificacao, string> = {
  INICIATIVA: "iniciativas",
  EXPERIMENTO: "experimentos",
  OKR: "KRs",
  ACAO_SEMANA: "ações",
};

/** "do/da" para o item que contém um checkpoint. */
const DE: Partial<Record<AlvoDaNotificacao, string>> = {
  INICIATIVA: "da iniciativa",
  EXPERIMENTO: "do experimento",
};

/** "na iniciativa “X”" ou, num checkpoint, "no checkpoint “C” da iniciativa “X”". */
function onde(d: Pick<DadosDoAviso, "alvo" | "alvoNome" | "subitem">): string {
  if (d.subitem) {
    return `no checkpoint “${d.subitem}” ${DE[d.alvo] ?? "de"} “${d.alvoNome}”`;
  }
  return `${EM[d.alvo]} “${d.alvoNome}”`;
}

/** Onde, quando o aviso reúne vários: "em 5 iniciativas" ou "em 3 checkpoints da iniciativa “X”". */
function ondeNoPlural(d: Pick<DadosDoAviso, "alvo" | "alvoNome" | "subitem">, quantidade: number): string {
  if (d.subitem) return `em ${quantidade} checkpoints ${DE[d.alvo] ?? "de"} “${d.alvoNome}”`;
  return `em ${quantidade} ${PLURAL[d.alvo]}`;
}

/** A frase do aviso, como aparece na lista. */
export function descreverNotificacao(d: DadosDoAviso): string {
  const quem = d.autorNome ?? "Alguém que saiu do time";
  const n = d.quantidade ?? 1;
  switch (d.tipo) {
    case "RESPONSAVEL_ADICIONADO":
      return `${quem} adicionou você como responsável ${n > 1 ? ondeNoPlural(d, n) : onde(d)}`;
    case "RESPONSAVEL_REMOVIDO":
      return `${quem} removeu você dos responsáveis ${n > 1 ? ondeNoPlural(d, n) : onde(d)}`;
    case "MENCAO":
      return `${quem} mencionou você ${onde(d)}`;
    case "COMENTARIO":
      return `${quem} comentou ${onde(d)}`;
    case "ITEM_CONVERTIDO":
      // O alvo é o item NOVO: um experimento nasceu de uma iniciativa, e vice-versa.
      return d.alvo === "EXPERIMENTO"
        ? `${quem} converteu a iniciativa “${d.alvoNome}” em experimento (você é responsável)`
        : `${quem} converteu o experimento “${d.alvoNome}” em iniciativa (você é responsável)`;
    case "ITEM_DUPLICADO":
      return n > 1
        ? `${quem} duplicou ${n} checkpoints ${DE[d.alvo] ?? "de"} “${d.alvoNome}” (você é responsável pelas cópias)`
        : `${quem} duplicou o checkpoint “${d.subitem}” ${DE[d.alvo] ?? "de"} “${d.alvoNome}” (você é responsável pela cópia)`;
  }
}

/**
 * Para onde o aviso leva. KR e ação não têm página própria: vão para a lista.
 * Aviso que reúne vários itens também vai para a lista (não há um item só para abrir).
 */
export function destinoDaNotificacao(
  alvo: AlvoDaNotificacao,
  alvoId: string,
  agrupadoDeItens = false
): string {
  switch (alvo) {
    case "INICIATIVA":
      return agrupadoDeItens ? "/iniciativas" : `/iniciativas/${alvoId}`;
    case "EXPERIMENTO":
      return agrupadoDeItens ? "/experimentos" : `/experimentos/${alvoId}`;
    case "OKR":
      return "/okrs";
    case "ACAO_SEMANA":
      return "/rituais";
  }
}

// ─── Preferências ─────────────────────────────────────────────────────────────

/** Os tipos que a pessoa pode ligar/desligar no Perfil, na ordem em que aparecem. */
export const TIPOS_DE_AVISO: { tipo: TipoDaNotificacao; titulo: string; descricao: string }[] = [
  { tipo: "RESPONSAVEL_ADICIONADO", titulo: "Adicionado como responsável", descricao: "Alguém te coloca como responsável por um item, checkpoint, KR ou ação." },
  { tipo: "RESPONSAVEL_REMOVIDO", titulo: "Removido dos responsáveis", descricao: "Alguém te tira da lista de responsáveis." },
  { tipo: "MENCAO", titulo: "Menção em comentário", descricao: "Alguém te menciona com @ num comentário." },
  { tipo: "COMENTARIO", titulo: "Comentário em item seu", descricao: "Alguém comenta numa iniciativa ou experimento de que você é responsável." },
  { tipo: "ITEM_CONVERTIDO", titulo: "Item convertido", descricao: "Uma iniciativa vira experimento (ou o contrário) e você é responsável." },
  { tipo: "ITEM_DUPLICADO", titulo: "Checkpoints duplicados", descricao: "Alguém duplica checkpoints de que você é responsável." },
];

const TIPOS_VALIDOS = new Set<string>(TIPOS_DE_AVISO.map((t) => t.tipo));

export function ehTipoDeAviso(valor: unknown): valor is TipoDaNotificacao {
  return typeof valor === "string" && TIPOS_VALIDOS.has(valor);
}

/** O aviso passa pelo que a pessoa desligou? */
export function pessoaAceitaAviso(silenciadas: readonly string[], tipo: TipoDaNotificacao): boolean {
  return !silenciadas.includes(tipo);
}

/** Avisos com mais de N dias saem sozinhos. */
export const RETENCAO_EM_DIAS = 90;

/** O contador do sino: 1 a 99, depois "99+". */
export function rotuloDoContador(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/** Disparado no `window` quando a pessoa lê avisos: o sino refaz a contagem na hora. */
export const NOTIFICACOES_MUDARAM_EVENT = "sg:notificacoes-mudaram";
