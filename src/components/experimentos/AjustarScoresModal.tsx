"use client";

import { useState, useMemo } from "react";
import { X, Check, AlertTriangle, Zap, ArrowRight, Inbox, Archive } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { IconButton } from "@/components/shared/IconButton";
import { updateExperimentoScores } from "@/actions/experimentos";
import { calculateICEScore, getICEAction, getIceActionLabel, ICE_RANGES } from "@/lib/ice";
import { IceAction } from "@/generated/prisma/enums";
import type { ExperimentoItem } from "./ExperimentoCard";
import { acaoSegura } from "@/lib/acao-segura";

interface AjustarScoresModalProps {
  experimento: ExperimentoItem;
  acaoDestino: IceAction;
  open: boolean;
  onClose: () => void;
  /** Recebe os scores salvos — quem chama move o card de coluna na hora. */
  onSuccess: (scores: { impactScore: number; confidenceScore: number; effortScore: number }) => void;
}

const ACTION_ICONS = {
  [IceAction.EXECUTAR_AGORA]: Zap,
  [IceAction.EM_SEGUIDA]: ArrowRight,
  [IceAction.BACKLOG]: Inbox,
  [IceAction.ARQUIVAR]: Archive,
};

const ACTION_COLORS = {
  [IceAction.EXECUTAR_AGORA]: { bg: "var(--peach-soft)", text: "var(--text-primary)", border: "var(--peach)" },
  [IceAction.EM_SEGUIDA]: { bg: "var(--butter-soft)", text: "var(--text-primary)", border: "var(--butter)" },
  [IceAction.BACKLOG]: { bg: "var(--sky-soft)", text: "var(--text-primary)", border: "var(--sky)" },
  [IceAction.ARQUIVAR]: { bg: "var(--color-cream)", text: "var(--text-muted)", border: "var(--border-default)" },
};

function ScoreButtons({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="flex-1 py-2 text-sm font-semibold transition-all"
              style={{
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
                background: active ? "var(--brand-primary)" : "var(--bg-app)",
                color: active ? "white" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AjustarScoresModal({
  experimento,
  acaoDestino,
  open,
  onClose,
  onSuccess,
}: AjustarScoresModalProps) {
  const [impactScore, setImpactScore] = useState(experimento.impactScore);
  const [confidenceScore, setConfidenceScore] = useState(experimento.confidenceScore);
  const [effortScore, setEffortScore] = useState(experimento.effortScore);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const liveScore = useMemo(
    () => calculateICEScore(impactScore, confidenceScore, effortScore),
    [impactScore, confidenceScore, effortScore]
  );
  
  const liveAction = useMemo(() => getICEAction(liveScore), [liveScore]);
  const actionMatch = liveAction === acaoDestino;
  const currentActionColors = ACTION_COLORS[liveAction];
  const ActionIcon = ACTION_ICONS[liveAction];

  const hasChanged = 
    impactScore !== experimento.impactScore || 
    confidenceScore !== experimento.confidenceScore || 
    effortScore !== experimento.effortScore;

  async function handleSave() {
    setLoading(true);
    setSaveError(null);
    const res = await acaoSegura(updateExperimentoScores(experimento.id, {
      impactScore,
      confidenceScore,
      effortScore,
    }));
    setLoading(false);
    if (res.success) {
      onSuccess({ impactScore, confidenceScore, effortScore });
      onClose();
    } else {
      setSaveError(res.error || "Erro ao atualizar scores");
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={440} labelledBy="ajustar-scores-title">
        <div className="flex items-center justify-between mb-2">
          <h2 id="ajustar-scores-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Ajustar scores
          </h2>
          <IconButton boxSize={32} onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </IconButton>
        </div>

        <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Pra mover esse experimento pra <span className="font-semibold">{getIceActionLabel(acaoDestino)}</span>, ajuste I, C e E. O ICE Score vai recalcular automaticamente.
        </p>

        {/* Faixas de referência */}
        <div 
          className="rounded-md p-3 mt-4"
          style={{ background: "var(--forest-soft)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--forest)" }}>
            Faixas de referência
          </p>
          <div className="space-y-1">
            {ICE_RANGES.map((r) => (
              <div 
                key={r.action} 
                className="flex items-center justify-between text-[11px]"
                style={{ 
                  color: r.action === acaoDestino ? "var(--forest)" : "var(--text-secondary)",
                  fontWeight: r.action === acaoDestino ? 600 : 400
                }}
              >
                <span>{r.label}</span>
                <span className="font-mono">{r.range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sliders/Buttons */}
        <div className="space-y-4 mt-6">
          <ScoreButtons label="Impacto" value={impactScore} onChange={setImpactScore} />
          <ScoreButtons label="Confiança" value={confidenceScore} onChange={setConfidenceScore} />
          <ScoreButtons label="Esforço" value={effortScore} onChange={setEffortScore} />
        </div>

        {/* Real-time Preview */}
        <div 
          className="flex items-center justify-between p-4 mt-6 rounded-lg border"
          style={{ 
            background: "var(--bg-surface)", 
            borderColor: "var(--border-default)" 
          }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
              ICE Score
            </p>
            <p className="text-3xl font-bold font-mono tabular-nums" style={{ color: "var(--forest)" }}>
              {liveScore.toFixed(1)}
            </p>
          </div>
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold"
            style={{ 
              background: currentActionColors.bg,
              color: currentActionColors.text,
              borderColor: currentActionColors.border
            }}
          >
            <ActionIcon size={14} />
            {getIceActionLabel(liveAction)}
          </div>
        </div>

        {/* Feedback Destino */}
        <div className="mt-3">
          {actionMatch ? (
            <div 
              className="p-2 rounded-md border flex items-center gap-2 text-xs"
              style={{ background: "var(--status-done-bg)", borderColor: "var(--status-done-text)33", color: "var(--status-done-text)" }}
            >
              <Check size={14} />
              Vai parar em {getIceActionLabel(acaoDestino)}
            </div>
          ) : (
            <div 
              className="p-2 rounded-md border flex items-center gap-2 text-xs"
              style={{ background: "var(--status-review-bg)", borderColor: "var(--status-review-text)33", color: "var(--status-review-text)" }}
            >
              <AlertTriangle size={14} />
              Com esses scores, vai parar em {getIceActionLabel(liveAction)}, não em {getIceActionLabel(acaoDestino)}
            </div>
          )}
        </div>

        {saveError && (
          <p className="text-xs px-3 py-2 rounded-lg mt-3" style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}>
            {saveError}
          </p>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-8">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!hasChanged || loading}
            onClick={handleSave}
          >
            {loading ? "Salvando..." : "Salvar scores"}
          </Button>
        </div>
    </Modal>
  );
}
