"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { salvarHorariosDoRitual } from "@/actions/horario-do-ritual";
import {
  aberturaDaSeguinte,
  formatDayMonth,
  formatMinuto,
  horariosValidos,
  HORARIOS_PADRAO,
  mesmosHorarios,
  nomeDoDia,
  parseISODateUTC,
  type HorariosDoRitual,
} from "@/lib/date-utils";
import { Alert } from "@/components/shared/Alert";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Dropdown } from "@/components/shared/Dropdown";
import { Field, Input } from "@/components/shared/Field";
import { toast } from "@/components/shared/Toast";
import { acaoSegura } from "@/lib/acao-segura";

const DIAS = [1, 2, 3, 4, 5, 6, 7].map((d) => {
  const nome = nomeDoDia(d);
  return { value: String(d), label: nome.charAt(0).toUpperCase() + nome.slice(1) };
});

/** "14:59" → 899; null se o campo está vazio ou incompleto. */
function paraMinuto(hora: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function HorariosDoRitualForm({
  horarios,
  semanaAtual,
}: {
  horarios: HorariosDoRitual;
  /** Segunda da semana em andamento, "yyyy-mm-dd". */
  semanaAtual: string;
}) {
  const router = useRouter();
  const [fechamentoDia, setFechamentoDia] = useState(horarios.fechamentoDia);
  const [fechamentoHora, setFechamentoHora] = useState(formatMinuto(horarios.fechamentoMinuto));
  const [planejamentoDia, setPlanejamentoDia] = useState(horarios.planejamentoDia);
  const [planejamentoHora, setPlanejamentoHora] = useState(formatMinuto(horarios.planejamentoMinuto));
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);

  const fechamentoMinuto = paraMinuto(fechamentoHora);
  const planejamentoMinuto = paraMinuto(planejamentoHora);
  const novos: HorariosDoRitual | null =
    fechamentoMinuto === null || planejamentoMinuto === null
      ? null
      : { fechamentoDia, fechamentoMinuto, planejamentoDia, planejamentoMinuto };
  const valido = novos !== null && horariosValidos(novos);
  const mudou = novos !== null && !mesmosHorarios(novos, horarios);
  const ehPadrao = novos !== null && mesmosHorarios(novos, HORARIOS_PADRAO);
  const abertura = novos ? aberturaDaSeguinte(novos) : null;

  const seg = parseISODateUTC(semanaAtual);
  const dom = seg ? new Date(seg.getTime() + 6 * 24 * 60 * 60 * 1000) : null;
  const rotuloDaSemana = seg && dom ? `${formatDayMonth(seg)} – ${formatDayMonth(dom)}` : semanaAtual;

  async function salvar(confirmarFechamento = false) {
    if (!novos || !valido) return;
    setSalvando(true);
    const res = await acaoSegura(salvarHorariosDoRitual(novos, { confirmarFechamento }));
    setSalvando(false);
    if (res.success) {
      setConfirmacao(null);
      toast("Horários do ritual salvos.");
      router.refresh();
    } else if ("precisaConfirmar" in res && res.precisaConfirmar) {
      setConfirmacao(res.error);
    } else {
      toast(res.error, "error");
    }
  }

  function restaurarPadrao() {
    setFechamentoDia(HORARIOS_PADRAO.fechamentoDia);
    setFechamentoHora(formatMinuto(HORARIOS_PADRAO.fechamentoMinuto));
    setPlanejamentoDia(HORARIOS_PADRAO.planejamentoDia);
    setPlanejamentoHora(formatMinuto(HORARIOS_PADRAO.planejamentoMinuto));
  }

  return (
    <Card padding="24px 28px">
      <div className="flex items-center gap-3 mb-6">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--radius-full)",
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Clock size={18} style={{ color: "var(--brand-primary)" }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Horários da Weekly
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Horário de São Paulo
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <Field
          label="Fechamento da semana"
          hint="Último minuto da semana. Depois dele a Weekly vira foto: nada mais se edita, e o que for concluído, remarcado ou excluído já conta para a semana seguinte."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              value={String(fechamentoDia)}
              options={DIAS}
              onChange={(v) => setFechamentoDia(Number(v))}
              title="Dia do fechamento"
              menuWidth={160}
            />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              às
            </span>
            <Input
              type="time"
              aria-label="Hora do fechamento"
              value={fechamentoHora}
              onChange={(e) => setFechamentoHora(e.target.value)}
              required
              style={{ width: 120 }}
            />
          </div>
        </Field>

        {abertura && (
          <p className="text-sm -mt-3" style={{ color: "var(--text-secondary)" }}>
            A semana seguinte abre{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {nomeDoDia(abertura.dia)} às {formatMinuto(abertura.minuto)}
            </span>
            , no minuto seguinte ao fechamento.
          </p>
        )}

        <Field
          label="Fim do planejamento"
          hint="Até esse minuto, o que entra na Weekly conta como planejado. Depois dele, o que entra conta como “entrou na semana”."
          error={novos && !valido ? "O fim do planejamento precisa ser antes do fechamento da semana." : undefined}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              value={String(planejamentoDia)}
              options={DIAS}
              onChange={(v) => setPlanejamentoDia(Number(v))}
              title="Dia do fim do planejamento"
              menuWidth={160}
            />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              até
            </span>
            <Input
              type="time"
              aria-label="Hora do fim do planejamento"
              value={planejamentoHora}
              onChange={(e) => setPlanejamentoHora(e.target.value)}
              required
              style={{ width: 120 }}
            />
          </div>
        </Field>

        <Alert variant="info">
          Vale a partir da semana em andamento ({rotuloDaSemana}) e das seguintes. Semanas que já
          fecharam ficam com os horários de quando fecharam.
        </Alert>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!ehPadrao && (
            <Button type="button" variant="ghost" size="sm" onClick={restaurarPadrao}>
              Restaurar padrão (sexta 14:59 · segunda 23:59)
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" disabled={!mudou || !valido || salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>

      {confirmacao && (
        <ConfirmDialog
          title="Fechar a semana agora?"
          message={confirmacao}
          confirmLabel="Salvar e fechar"
          variant="primary"
          onConfirm={() => salvar(true)}
          onCancel={() => setConfirmacao(null)}
        />
      )}
    </Card>
  );
}
