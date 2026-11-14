import { CalendarOff } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { AusenciaTypeBadge } from "@/components/shared/AusenciaTypeBadge";
import { formatDayMonth } from "@/lib/date-utils";
import { QuickAusencia } from "./QuickAusencia";

export type WeeklyAusencia = {
  id: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  member: { id: string; name: string };
};

/** A ausência toca a janela quando os intervalos se cruzam — não só quando começa dentro. */
function tocaJanela(a: WeeklyAusencia, inicio: Date, fim: Date): boolean {
  return (
    new Date(a.startDate).getTime() <= fim.getTime() &&
    new Date(a.endDate).getTime() >= inicio.getTime()
  );
}

function Bloco({
  titulo,
  inicio,
  fim,
  ausencias,
}: {
  titulo: string;
  inicio: Date;
  fim: Date;
  ausencias: WeeklyAusencia[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {titulo} · {formatDayMonth(inicio)} – {formatDayMonth(fim)}
      </p>
      {ausencias.length === 0 ? (
        <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
          Time completo.
        </p>
      ) : (
        <ul>
          {ausencias.map((a, idx) => (
            <li
              key={a.id}
              className="list-row flex items-start justify-between gap-3 py-2"
              style={{
                borderBottom: idx < ausencias.length - 1 ? "1px solid var(--border-subtle)" : "none",
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {a.member.name}
                </p>
                {/* O intervalo é o da ausência inteira, não o recorte da semana:
                    saber que as férias vão até dia 20 muda o planejamento. */}
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {formatDayMonth(a.startDate)} – {formatDayMonth(a.endDate)}
                </p>
              </div>
              <div className="shrink-0 mt-0.5">
                <AusenciaTypeBadge type={a.type} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Quem falta na semana em exibição e na seguinte.
 *
 * As duas janelas acompanham o filtro de semana, não o calendário de hoje: numa
 * Weekly de outra semana, "esta semana" é a semana selecionada. É a pergunta do
 * ritual — com quem eu conto para o que combinamos agora, e o que já dá para
 * antecipar da semana que vem.
 */
export function WeeklyAusencias({
  ausencias,
  weekStart,
  weekEnd,
  nextWeekStart,
  nextWeekEnd,
  membrosParaAusencia,
}: {
  /** Ausências que cruzam a janela das duas semanas, já vindas do banco. */
  ausencias: WeeklyAusencia[];
  weekStart: Date;
  weekEnd: Date;
  nextWeekStart: Date;
  nextWeekEnd: Date;
  /**
   * Quem pode receber uma ausência criada daqui, já recortado pela permissão.
   * Lista vazia (visitante) esconde o botão: ele nunca aparece para quem a
   * action barraria depois do submit.
   */
  membrosParaAusencia: { id: string; name: string; isActive: boolean }[];
}) {
  // Uma ausência longa aparece nos dois blocos — de propósito: cada bloco
  // responde por sua semana, e omiti-la na segunda faria parecer que a pessoa
  // volta na segunda-feira.
  const daSemana = ausencias.filter((a) => tocaJanela(a, weekStart, weekEnd));
  const daProxima = ausencias.filter((a) => tocaJanela(a, nextWeekStart, nextWeekEnd));

  return (
    <SectionCard
      icon={CalendarOff}
      iconBg="var(--blush-soft)"
      iconColor="var(--blush-strong)"
      title="Ausências do time"
      count={daSemana.length + daProxima.length}
      action={{ label: "Ver todas →", href: "/ausencias" }}
      headerAction={
        membrosParaAusencia.length > 0 ? (
          <QuickAusencia members={membrosParaAusencia} />
        ) : undefined
      }
      className="h-full"
    >
      <div className="flex flex-col gap-3">
        <Bloco titulo="Esta semana" inicio={weekStart} fim={weekEnd} ausencias={daSemana} />
        <div style={{ borderTop: "1px solid var(--border-subtle)" }} />
        <Bloco
          titulo="Semana seguinte"
          inicio={nextWeekStart}
          fim={nextWeekEnd}
          ausencias={daProxima}
        />
      </div>
    </SectionCard>
  );
}
