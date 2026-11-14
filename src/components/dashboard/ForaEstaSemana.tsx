import { CalendarOff } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { AusenciaTypeBadge } from "@/components/shared/AusenciaTypeBadge";
import { Alert } from "@/components/shared/Alert";
import { formatDayMonthNumeric } from "@/lib/date-utils";

export type AusenciaDaSemana = {
  id: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  member: { id: string; name: string };
};

/**
 * Quem do time está fora nesta semana — no lugar do contador "Próximas
 * Ausências" e da coluna de ausências do snapshot do mês. A pergunta do
 * dashboard é com quem eu NÃO conto agora, então o recorte é a semana.
 *
 * `avisos` explica por que a ausência importa para quem lê (corresponsável
 * fora, atraso de quem está fora); vem pronto da seção.
 */
export function ForaEstaSemana({
  ausencias,
  avisos,
}: {
  ausencias: AusenciaDaSemana[];
  avisos: string[];
}) {
  return (
    <SectionCard icon={CalendarOff} title="Fora esta semana" count={ausencias.length}>
      {ausencias.length === 0 ? (
        <p className="text-sm py-1" style={{ color: "var(--text-muted)" }}>
          Ninguém fora esta semana.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 py-1">
          {ausencias.map((a) => {
            const inicio = formatDayMonthNumeric(a.startDate);
            const fim = formatDayMonthNumeric(a.endDate);
            return (
              <div key={a.id} className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-sm font-medium flex-1 min-w-0 truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {a.member.name}
                </span>
                <AusenciaTypeBadge type={a.type} />
                <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {inicio === fim ? inicio : `${inicio} – ${fim}`}
                </span>
              </div>
            );
          })}
          {avisos.length > 0 && (
            <Alert variant="warning" className="mt-1">
              {avisos.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </Alert>
          )}
        </div>
      )}
    </SectionCard>
  );
}
