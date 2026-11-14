import { CircleCheck, Hourglass } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { CardHeader } from "@/components/shared/CardHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ActivityItemCard } from "@/components/shared/ActivityItemCard";
import { formatDayMonth } from "@/lib/date-utils";

export type ItemAguardando = {
  kind: "iniciativa" | "experimento";
  id: string;
  name: string;
  status: string;
  priority: string | null;
  analysisDate: Date | string | null;
  members: { id: string; name: string }[];
};

/**
 * O que terminou de rodar e espera o próximo passo para acontecer:
 * experimento aguardando resultados e iniciativa escrevendo relatório. É a
 * fila que a liderança abre espaço no ritual — a data de análise diz a vez de
 * cada um, e a vencida sai na cor de atraso.
 *
 * Sem botão novo — o nome abre o detalhe e o status muda pelo próprio pill,
 * como em qualquer `ActivityItemCard`.
 */
export function AguardandoProximoPasso({ itens, hoje }: { itens: ItemAguardando[]; hoje: Date }) {
  return (
    <Card padding={28} style={{ borderRadius: "var(--radius-lg)" }}>
      <CardHeader
        icon={Hourglass}
        title="Aguardando próximo passo"
        badge={itens.length > 0 ? String(itens.length) : undefined}
        subtitle="Aguardando resultados ou escrevendo relatório"
        className="mb-5"
      />
      {itens.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nada na fila"
          description="Nenhum experimento aguardando resultados nem iniciativa escrevendo relatório."
          density="compact"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map((i) => {
            const vencida = !!i.analysisDate && new Date(i.analysisDate).getTime() < hoje.getTime();
            return (
              <ActivityItemCard
                key={`${i.kind}-${i.id}`}
                kind={i.kind}
                name={i.name}
                status={i.status}
                statusEditId={i.id}
                priority={i.kind === "iniciativa" ? i.priority : null}
                priorityEditId={i.kind === "iniciativa" ? i.id : undefined}
                members={i.members}
                detailId={i.id}
              >
                <p
                  className="text-xs"
                  style={{ color: vencida ? "var(--status-late-text)" : "var(--text-muted)" }}
                >
                  {!i.analysisDate
                    ? "Sem data de análise de resultados"
                    : vencida
                      ? `Análise de resultados venceu em ${formatDayMonth(i.analysisDate)}`
                      : `Análise de resultados em ${formatDayMonth(i.analysisDate)}`}
                </p>
              </ActivityItemCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
