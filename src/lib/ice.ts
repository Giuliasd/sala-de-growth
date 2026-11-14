import { IceAction } from "@/generated/prisma/enums";

/**
 * ICE (Impacto × Confiança ÷ Esforço) — a ÚNICA fonte da conta e das faixas.
 *
 * Havia duas cópias (`ice.ts` e `ice-calculator.ts`) com a mesma fórmula e
 * nomes diferentes: o formulário e a tabela usavam uma, o kanban e o ajuste de
 * scores a outra. Mudar a faixa numa só deixaria a tela dizendo uma coisa e o
 * servidor gravando outra.
 */
export function calculateICEScore(impact: number, confidence: number, effort: number): number {
  if (effort === 0) return 0;
  return Math.round(((impact * confidence) / effort) * 10) / 10;
}

/** Faixa do score → ação recomendada. */
export function getICEAction(score: number): IceAction {
  if (score >= 4) return IceAction.EXECUTAR_AGORA;
  if (score >= 3) return IceAction.EM_SEGUIDA;
  if (score >= 2) return IceAction.BACKLOG;
  return IceAction.ARQUIVAR;
}

export function getIceActionLabel(action: IceAction): string {
  switch (action) {
    case IceAction.EXECUTAR_AGORA:
      return "Executar Agora";
    case IceAction.EM_SEGUIDA:
      return "Em Seguida";
    case IceAction.BACKLOG:
      return "Backlog";
    case IceAction.ARQUIVAR:
      return "Arquivar";
    default:
      return action;
  }
}

/** As faixas, como o ajuste de scores as explica. Batem com `getICEAction`. */
export const ICE_RANGES = [
  { action: IceAction.EXECUTAR_AGORA, label: "Executar Agora", range: "≥ 4.0" },
  { action: IceAction.EM_SEGUIDA, label: "Em Seguida", range: "3.0 – 3.99" },
  { action: IceAction.BACKLOG, label: "Backlog", range: "2.0 – 2.99" },
  { action: IceAction.ARQUIVAR, label: "Arquivar", range: "< 2.0" },
];
