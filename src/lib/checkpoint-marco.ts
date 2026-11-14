/**
 * Regras do marco com checkpoints necessários.
 *
 * Um checkpoint de categoria MARCO pode listar os checkpoints que precisam
 * estar entregues para ele acontecer. A ligação mora fora da árvore (tabela
 * própria, N:N): o checkpoint continua onde está na hierarquia, e um mesmo
 * entregável pode destravar mais de um marco.
 *
 * Módulo puro (sem React nem Prisma): as server actions validam com
 * `podeSerRequisito`, e lista, roadmap, calendário, Weekly e dashboard
 * desenham com `progressoDoMarco` — uma regra só para todas as telas.
 */

/** O mínimo de um checkpoint para as regras de marco. */
export type MarcoCheckpoint = {
  id: string;
  name: string;
  parentId: string | null;
  categoria?: string | null;
  isCompleted: boolean;
  dueDate: Date | string;
  /** Só em marco: ids dos checkpoints necessários. */
  requisitoIds?: string[];
};

export function ehMarco(cp: { categoria?: string | null }): boolean {
  return cp.categoria === "MARCO";
}

/**
 * Quem pode ser atrelado a um marco: qualquer checkpoint que não seja marco —
 * do nível principal ou subcheckpoint. Cada um entra SOZINHO: atrelar um
 * subcheckpoint não leva o pai nem os irmãos, e atrelar um pai não leva os
 * filhos. Marco de fora evita cadeia de marcos.
 */
export function podeSerRequisito(cp: { categoria?: string | null }): boolean {
  return !ehMarco(cp);
}

/** Meia-noite UTC do dia — prazos são date-only gravados em UTC. */
function diaUTC(value: Date | string): number {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type MotivoDeRisco = "atrasado" | "depois_do_marco";

export type ProgressoDoMarco<T extends MarcoCheckpoint> = {
  /** Os necessários que ainda existem, na ordem em que vieram. */
  requisitos: T[];
  total: number;
  entregues: number;
  pendentes: T[];
  /** Pendências que põem a data do marco em risco, com o motivo. */
  riscos: { item: T; motivo: MotivoDeRisco }[];
  /** Marco aberto com alguma pendência atrasada ou que vence depois dele. */
  emRisco: boolean;
};

/**
 * Progresso de um marco. `null` quando não há necessários: marco sem ligação
 * continua sendo só uma data, sem pill nem alerta.
 *
 * Risco só vale com o marco ABERTO — depois de concluído, a pendência que
 * sobrou foi uma decisão (o aviso de concluir mostrou), não um alarme.
 * Quando os dois motivos valem, fica `atrasado`: é o mais urgente.
 */
export function progressoDoMarco<T extends MarcoCheckpoint>(
  marco: MarcoCheckpoint,
  porId: Map<string, T>,
  hoje: Date = new Date()
): ProgressoDoMarco<T> | null {
  const requisitos = (marco.requisitoIds ?? []).flatMap((id) => {
    const cp = porId.get(id);
    return cp ? [cp] : [];
  });
  if (requisitos.length === 0) return null;

  const pendentes = requisitos.filter((r) => !r.isCompleted);
  const riscos: { item: T; motivo: MotivoDeRisco }[] = [];
  if (!marco.isCompleted) {
    const hojeDia = diaUTC(hoje);
    const fimDoMarco = diaUTC(marco.dueDate);
    for (const p of pendentes) {
      const fim = diaUTC(p.dueDate);
      if (fim < hojeDia) riscos.push({ item: p, motivo: "atrasado" });
      else if (fim > fimDoMarco) riscos.push({ item: p, motivo: "depois_do_marco" });
    }
  }
  return {
    requisitos,
    total: requisitos.length,
    entregues: requisitos.length - pendentes.length,
    pendentes,
    riscos,
    emRisco: riscos.length > 0,
  };
}

/**
 * Dias inteiros de `hoje` até o marco: 0 é hoje, negativo é vencido. Conta em
 * dias de calendário (meia-noite UTC dos dois lados), não em 24h corridas.
 */
export function diasAteOMarco(dueDate: Date | string, hoje: Date): number {
  return Math.round((diaUTC(dueDate) - diaUTC(hoje)) / (24 * 60 * 60 * 1000));
}

/** "hoje", "amanhã", "faltam 5 dias", "venceu ontem", "venceu há 3 dias". */
export function rotuloDosDias(dias: number): string {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias > 1) return `faltam ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  return `venceu há ${-dias} dias`;
}

/** "2 checkpoints atrasados · 1 vence depois do marco" — o porquê do risco. */
export function resumoDoRisco(riscos: { motivo: MotivoDeRisco }[]): string {
  const atrasados = riscos.filter((r) => r.motivo === "atrasado").length;
  const depois = riscos.length - atrasados;
  const partes: string[] = [];
  if (atrasados > 0) partes.push(`${atrasados} ${atrasados === 1 ? "checkpoint atrasado" : "checkpoints atrasados"}`);
  if (depois > 0) partes.push(`${depois} ${depois === 1 ? "vence" : "vencem"} depois do marco`);
  return partes.join(" · ");
}

/** Os marcos (dentre `itens`) que têm `id` como necessário. */
export function marcosQueExigem<T extends MarcoCheckpoint>(id: string, itens: T[]): T[] {
  return itens.filter((i) => ehMarco(i) && (i.requisitoIds ?? []).includes(id));
}

/** Lista de nomes curta para avisos: "A", "A e B", "A, B e mais 2". */
export function listarNomes(nomes: string[], max = 3): string {
  const q = nomes.map((n) => `"${n}"`);
  if (q.length <= 1) return q.join("");
  if (q.length <= max) return `${q.slice(0, -1).join(", ")} e ${q[q.length - 1]}`;
  return `${q.slice(0, max).join(", ")} e mais ${q.length - max}`;
}
