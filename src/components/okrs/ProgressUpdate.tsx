"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { updateOKRProgress, updateOKRMonthlyValues } from "@/actions/okrs";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Field";
import { formatOKRValue } from "./OKRCard";
import { PaceChip } from "./OKRTracking";
import { OKRUnit, OKRMeasurementType } from "@/generated/prisma/enums";
import {
  computeMonthlyAverage,
  computeProgress,
  getQuarterMonths,
  monthLabel,
  paceStatus,
  quarterElapsedPercent,
} from "@/lib/okr";
import { acaoSegura } from "@/lib/acao-segura";

type OKRItem = {
  id: string;
  initialValue: number;
  currentValue: number;
  targetValue: number;
  unit: OKRUnit;
  measurementType: OKRMeasurementType;
  monthValue1: number | null;
  monthValue2: number | null;
  monthValue3: number | null;
  quarterStart: Date | string;
  quarterEnd: Date | string;
};

interface ProgressUpdateProps {
  okr: OKRItem;
  /** Instante do servidor — a régua do ritmo usa o mesmo relógio da tela. */
  nowMs: number;
  onSuccess: () => void;
  onCancel: () => void;
}

// Variação que costuma ser digitação errada (vírgula que faltou, zero a mais):
// o valor novo é 10× maior ou menor que o anterior.
const FATOR_SUSPEITO = 10;

function mudaMuito(de: number | null, para: number | null): boolean {
  if (de === null || para === null || de <= 0 || para <= 0) return false;
  const razao = para / de;
  return razao >= FATOR_SUSPEITO || razao <= 1 / FATOR_SUSPEITO;
}

/**
 * O valor como será gravado, já com separador de milhar: "18471156" lido de
 * relance parece certo, "R$ 18.471.156,00" não. Aparece embaixo do campo.
 */
function formatarDigitado(valor: number, unit: OKRUnit): string {
  if (unit === "REAL") return formatOKRValue(valor, unit);
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(valor);
  return unit === "PORCENTAGEM" ? `${n}%` : n;
}

/** Ritmo que o KR passa a ter se o valor for salvo agora. */
function RitmoDepois({ progresso, okr, nowMs }: { progresso: number; okr: OKRItem; nowMs: number }) {
  const decorrido = quarterElapsedPercent(okr.quarterStart, okr.quarterEnd, new Date(nowMs));
  const gap = progresso - decorrido;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      depois de salvar:
      <PaceChip status={paceStatus(progresso, decorrido)} gap={gap} />
    </span>
  );
}

function AvisoValorGrande({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
      style={{ background: "var(--butter-soft)", color: "var(--butter-strong)" }}
    >
      <AlertTriangle size={13} className="shrink-0 mt-px" />
      <span>{children}</span>
    </p>
  );
}

function CampoNota({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
        Observação <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span>
      </label>
      <Input
        type="text"
        maxLength={280}
        className="text-sm"
        placeholder="Por que o valor mudou? Ex.: fechamento do mês, correção"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function ProgressUpdate(props: ProgressUpdateProps) {
  if (props.okr.measurementType === "MEDIA_MENSAL") {
    return <MonthlyUpdate {...props} />;
  }
  return <CumulativeUpdate {...props} />;
}

// ── Modo acumulado (comportamento original) ───────────────────────────
function CumulativeUpdate({ okr, nowMs, onSuccess, onCancel }: ProgressUpdateProps) {
  const [newValue, setNewValue] = useState(String(okr.currentValue));
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmouSalto, setConfirmouSalto] = useState(false);

  const val = Number(newValue);
  const valido = newValue.trim() !== "" && !isNaN(val);

  const preview = useMemo(() => {
    if (!valido || okr.targetValue === okr.initialValue) return null;
    const pct = ((val - okr.initialValue) / (okr.targetValue - okr.initialValue)) * 100;
    return Math.round(pct * 10) / 10;
  }, [val, valido, okr]);

  const delta = val - okr.currentValue;
  const isUp = delta > 0;
  const isDown = delta < 0;
  const salto = valido && mudaMuito(okr.currentValue, val);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    // Primeiro clique num valor 10× fora do anterior só mostra o aviso.
    if (salto && !confirmouSalto) {
      setConfirmouSalto(true);
      return;
    }
    setLoading(true);
    const res = await acaoSegura(updateOKRProgress(okr.id, val, note));
    setLoading(false);
    if (res.success) {
      onSuccess();
    } else {
      setErrorMsg(res.error);
    }
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Valor atual:{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatOKRValue(okr.currentValue, okr.unit)}</span>
        {" "}· Meta:{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatOKRValue(okr.targetValue, okr.unit)}</span>
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <Input
              type="number"
              step="any"
              min="0"
              autoFocus
              className="text-sm font-mono tabular-nums"
              style={{ width: 160 }}
              value={newValue}
              onChange={(e) => {
                setNewValue(e.target.value);
                setConfirmouSalto(false);
              }}
              required
            />
            {valido && (
              <p className="mt-1 text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                = {formatarDigitado(val, okr.unit)}
              </p>
            )}
          </div>

          {preview !== null && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {isUp && <TrendingUp size={14} style={{ color: "var(--color-forest)" }} />}
              {isDown && <TrendingDown size={14} style={{ color: "var(--status-error-text)" }} />}
              <span className="text-sm font-bold font-mono tabular-nums" style={{ color: "var(--color-forest)" }}>
                {preview.toFixed(1)}%
              </span>
              {delta !== 0 && (
                <span
                  className="text-xs font-mono tabular-nums"
                  style={{ color: isUp ? "var(--color-forest)" : "var(--status-error-text)" }}
                >
                  ({isUp ? "+" : ""}{formatOKRValue(delta % 1 === 0 ? delta : Number(delta.toFixed(1)), okr.unit)})
                </span>
              )}
              <RitmoDepois progresso={Math.max(0, preview)} okr={okr} nowMs={nowMs} />
            </div>
          )}
        </div>

        {confirmouSalto && salto && (
          <AvisoValorGrande>
            O valor vai de <strong>{formatarDigitado(okr.currentValue, okr.unit)}</strong> para{" "}
            <strong>{formatarDigitado(val, okr.unit)}</strong> — mais de {FATOR_SUSPEITO}× de diferença.
            Confira se não falta ou sobra uma vírgula; se estiver certo, confirme de novo.
          </AvisoValorGrande>
        )}

        <CampoNota value={note} onChange={setNote} />

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading}>
            {loading ? "Salvando..." : confirmouSalto && salto ? "Confirmar mesmo assim" : "Confirmar"}
          </Button>
        </div>

        {errorMsg && (
          <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}>
            {errorMsg}
          </p>
        )}
      </form>
    </div>
  );
}

// ── Modo média mensal (3 inputs, um por mês do quarter) ───────────────
function MonthlyUpdate({ okr, nowMs, onSuccess, onCancel }: ProgressUpdateProps) {
  const months = useMemo(
    () => getQuarterMonths(okr.quarterStart, okr.quarterEnd).slice(0, 3),
    [okr.quarterStart, okr.quarterEnd]
  );

  const anteriores = [okr.monthValue1, okr.monthValue2, okr.monthValue3];
  const initial = anteriores.map((v) => (v === null || v === undefined ? "" : String(v)));
  const [values, setValues] = useState<string[]>(initial);
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmouSalto, setConfirmouSalto] = useState(false);

  const numbers = values.map((s) => (s.trim() === "" ? null : Number(s)));

  const average = useMemo(
    () => computeMonthlyAverage(values.map((s) => (s.trim() === "" ? null : Number(s)))),
    [values]
  );
  const previewPct = useMemo(() => {
    if (average === null || okr.targetValue === 0) return null;
    // Mesma conta do card: com ponto de partida acima da meta o KR é de
    // redução, e média ÷ meta mostrava 125% num churn que estava caindo.
    const { progressPercent } = computeProgress({
      measurementType: "MEDIA_MENSAL",
      targetValue: okr.targetValue,
      initialValue: okr.initialValue,
      currentValue: okr.currentValue,
      monthValues: numbers,
    });
    return Math.round(progressPercent * 10) / 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [average, okr.targetValue, okr.initialValue, okr.currentValue, values]);

  // Mês cujo valor novo destoa do que ele tinha antes — ou, mês ainda vazio, da
  // média dos outros meses já lançados.
  const mesesSuspeitos = months
    .map((m, i) => {
      const novo = numbers[i];
      if (novo === null || isNaN(novo)) return null;
      const outros = anteriores.filter((_, j) => j !== i);
      const referencia = anteriores[i] ?? computeMonthlyAverage(outros);
      return mudaMuito(referencia, novo) ? monthLabel(m.year, m.month) : null;
    })
    .filter((m): m is string => m !== null);
  const salto = mesesSuspeitos.length > 0;

  function setAt(i: number, val: string) {
    setValues((prev) => prev.map((v, idx) => (idx === i ? val : v)));
    setConfirmouSalto(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    // Valida números não-negativos quando preenchidos.
    for (const n of numbers) {
      if (n !== null && (isNaN(n) || n < 0)) {
        setErrorMsg("Os valores mensais devem ser números não-negativos.");
        return;
      }
    }
    if (salto && !confirmouSalto) {
      setConfirmouSalto(true);
      return;
    }
    setLoading(true);
    const res = await acaoSegura(updateOKRMonthlyValues(okr.id, {
      monthValue1: numbers[0],
      monthValue2: numbers[1],
      monthValue3: numbers[2],
      note,
    }));
    setLoading(false);
    if (res.success) {
      onSuccess();
    } else {
      setErrorMsg(res.error);
    }
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Preencha cada mês do quarter. O valor do OKR é a média dos meses preenchidos · Meta:{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatOKRValue(okr.targetValue, okr.unit)}</span>
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {months.map((m, i) => (
            <div key={`${m.year}-${m.month}`}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                {monthLabel(m.year, m.month)}
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                autoFocus={i === 0}
                className="text-sm font-mono tabular-nums"
                placeholder="—"
                value={values[i]}
                onChange={(e) => setAt(i, e.target.value)}
              />
              {numbers[i] !== null && !isNaN(numbers[i] as number) && (
                <p className="mt-1 text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  = {formatarDigitado(numbers[i] as number, okr.unit)}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Média:{" "}
            <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--text-primary)" }}>
              {average === null ? "—" : formatOKRValue(Math.round(average * 100) / 100, okr.unit)}
            </span>
          </span>
          {previewPct !== null && (
            <>
              <span className="text-sm font-bold font-mono tabular-nums" style={{ color: "var(--color-forest)" }}>
                {previewPct.toFixed(1)}%
              </span>
              <RitmoDepois progresso={Math.max(0, previewPct)} okr={okr} nowMs={nowMs} />
            </>
          )}
        </div>

        {confirmouSalto && salto && (
          <AvisoValorGrande>
            {mesesSuspeitos.join(", ")}: o valor novo tem mais de {FATOR_SUSPEITO}× de diferença do
            anterior. Confira se não falta ou sobra uma vírgula; se estiver certo, confirme de novo.
          </AvisoValorGrande>
        )}

        <CampoNota value={note} onChange={setNote} />

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading}>
            {loading ? "Salvando..." : confirmouSalto && salto ? "Confirmar mesmo assim" : "Confirmar"}
          </Button>
        </div>

        {errorMsg && (
          <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}>
            {errorMsg}
          </p>
        )}
      </form>
    </div>
  );
}
