"use client";

import { useState } from "react";
import { CalendarCheck, Check, ChevronDown, ChevronRight, CircleCheck } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { CardHeader } from "@/components/shared/CardHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ActivityGroupLabel, ActivityItemCard } from "@/components/shared/ActivityItemCard";
import { CategoriaIcon } from "@/components/shared/CheckpointCategoria";
import { MarcoProgressoContagem } from "@/components/shared/CheckpointMarco";
import { MemberChips } from "@/components/shared/MemberChips";
import { formatDayMonth } from "@/lib/date-utils";
import {
  diasAteOMarco,
  rotuloDosDias,
  type MarcoCheckpoint,
  type ProgressoDoMarco,
} from "@/lib/checkpoint-marco";

type Pessoa = { id: string; name: string };
type Pendencia = MarcoCheckpoint & { members: Pessoa[] };

export type MarcoDoTime = {
  id: string;
  name: string;
  dueDate: Date | string;
  members: Pessoa[];
  progresso: ProgressoDoMarco<Pendencia> | null;
  /** Sem necessários ligados: os subcheckpoints abertos do marco. */
  subPendentes: Pendencia[];
  item: {
    kind: "iniciativa" | "experimento";
    id: string;
    name: string;
    status: string;
    priority: string | null;
    members: Pessoa[];
  };
};

/** Os marcos de uma semana, um card por item (na ordem do marco mais próximo). */
function porItem(marcos: MarcoDoTime[]) {
  const grupos = new Map<string, { item: MarcoDoTime["item"]; marcos: MarcoDoTime[] }>();
  for (const m of marcos) {
    const chave = `${m.item.kind}:${m.item.id}`;
    const g = grupos.get(chave) ?? { item: m.item, marcos: [] };
    g.marcos.push(m);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

/** O que falta de um marco: necessários pendentes ou, sem eles, os filhos abertos. */
function OQueFalta({ marco, hoje }: { marco: MarcoDoTime; hoje: Date }) {
  const { progresso } = marco;
  if (progresso && progresso.pendentes.length === 0) {
    return (
      <p className="text-xs inline-flex items-center gap-1" style={{ color: "var(--status-done-text)" }}>
        <Check size={12} strokeWidth={2.5} />
        Todos os necessários entregues
      </p>
    );
  }
  const pendentes = progresso ? progresso.pendentes : marco.subPendentes;
  if (pendentes.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Nenhum checkpoint necessário ligado ao marco
      </p>
    );
  }
  const motivo = new Map(progresso?.riscos.map((r) => [r.item.id, r.motivo]));
  return (
    <ul className="flex flex-col gap-1">
      {pendentes.map((p) => {
        // Sem necessários ligados não há "depois do marco": vale só o atraso.
        const m = motivo.get(p.id) ?? (diasAteOMarco(p.dueDate, hoje) < 0 ? "atrasado" : undefined);
        return (
          // Quebra em card estreito: o nome ganha a linha (flex 8rem) e data,
          // aviso e chip descem, em vez de o nome sumir e o chip vazar.
          <li key={p.id} className="flex items-center gap-x-2 gap-y-0.5 flex-wrap min-w-0">
            {/* A caixa de pendente da lista de necessários (MarcoRequisitosLista),
                só leitura: concluir continua sendo na linha do checkpoint. */}
            <span aria-hidden="true" className="w-3.5 h-3.5 rounded border shrink-0 bg-paper border-line" />
            <span
              className="text-xs truncate min-w-0"
              style={{ color: "var(--text-secondary)", flex: "0 1 auto", minWidth: "min(8rem, 100%)" }}
            >
              {p.name}
            </span>
            <span
              className="text-[11px] font-mono shrink-0"
              style={{ color: m ? "var(--status-late-text)" : "var(--text-muted)", fontWeight: m ? 700 : undefined }}
            >
              {formatDayMonth(p.dueDate)}
            </span>
            {m && (
              <span className="text-[11px] shrink-0" style={{ color: "var(--status-late-text)" }}>
                {m === "atrasado" ? "atrasado" : "vence depois do marco"}
              </span>
            )}
            <MemberChips members={p.members} max={2} />
          </li>
        );
      })}
    </ul>
  );
}

function LinhaDoMarco({ marco, hoje }: { marco: MarcoDoTime; hoje: Date }) {
  // Começa aberto: o card existe para mostrar o que falta. Recolher é o
  // mesmo gesto do detalhe do item — chevron à esquerda ou a contagem "X/Y".
  const [aberto, setAberto] = useState(true);
  const alternar = () => setAberto((v) => !v);
  const dias = diasAteOMarco(marco.dueDate, hoje);
  // Só o marco vencido pinta os dias de atraso. O risco (necessário atrasado
  // ou que vence depois) já aparece na contagem e na linha da pendência —
  // pintado aqui, "faltam 10 dias" em vermelho se lia como prazo apertado.
  const vencido = dias < 0;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
        {/* O chevron do detalhe (CheckpointSection): mesmo ícone, tamanho e
            cores de repouso/hover. */}
        <button
          type="button"
          onClick={alternar}
          className="shrink-0 transition-colors text-ink-soft hover:text-ink"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
          aria-expanded={aberto}
          aria-label={aberto ? `Recolher o que falta para ${marco.name}` : `Expandir o que falta para ${marco.name}`}
        >
          {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <CategoriaIcon categoria="MARCO" size={12} />
        <span className="text-xs font-medium truncate min-w-0" style={{ color: "var(--text-primary)" }}>
          {marco.name}
        </span>
        <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--text-muted)" }}>
          {formatDayMonth(marco.dueDate)}
        </span>
        {/* A contagem do detalhe, que também abre e fecha a lista. Antes dos
            dias: o progresso é a leitura principal da preparação. */}
        {marco.progresso && (
          <MarcoProgressoContagem progresso={marco.progresso} aberto={aberto} onToggle={alternar} />
        )}
        <span
          className="text-[11px] font-medium shrink-0"
          style={{ color: vencido ? "var(--status-late-text)" : "var(--text-secondary)" }}
        >
          · {rotuloDosDias(dias)}
        </span>
        {marco.members.length > 0 && <MemberChips members={marco.members} max={2} />}
      </div>
      {aberto && (
        // Alinha com o ícone do marco (chevron + gap): mais recuo roubava a
        // largura do nome no card estreito.
        <div style={{ paddingLeft: 19 }}>
          <OQueFalta marco={marco} hoje={hoje} />
        </div>
      )}
    </div>
  );
}

/**
 * Marcos do time atrasados, nesta semana e na que vem: para a liderança ver,
 * antes da data, se a preparação fecha — e o que já passou da data sem fechar — quantos dias faltam, quanto dos necessários já
 * foi entregue e o que ainda falta (com o atraso e o "vence depois do marco"
 * de `progressoDoMarco`).
 *
 * Um card por iniciativa/experimento, com os marcos dele dentro: o nome abre o
 * detalhe, como em toda lista do dashboard.
 */
export function MarcosDoTime({
  marcos,
  hoje,
  weekEnd,
}: {
  marcos: MarcoDoTime[];
  hoje: Date;
  /** Fim desta semana: o que vence depois é da semana que vem. */
  weekEnd: Date;
}) {
  // Atrasado é contra o dia, como no "Precisa de você": o que venceu ontem já
  // não é preparação, é pendência.
  const atrasados = marcos.filter((m) => diasAteOMarco(m.dueDate, hoje) < 0);
  const aVencer = marcos.filter((m) => diasAteOMarco(m.dueDate, hoje) >= 0);
  const estaSemana = aVencer.filter((m) => new Date(m.dueDate).getTime() <= weekEnd.getTime());
  const proxima = aVencer.filter((m) => new Date(m.dueDate).getTime() > weekEnd.getTime());
  const emRisco = marcos.filter((m) => m.progresso?.emRisco || diasAteOMarco(m.dueDate, hoje) < 0).length;

  return (
    <Card padding={28} style={{ borderRadius: "var(--radius-lg)" }}>
      <CardHeader
        icon={CalendarCheck}
        title="Marcos à frente"
        badge={emRisco > 0 ? `${emRisco} em risco` : marcos.length > 0 ? String(marcos.length) : undefined}
        subtitle="Atrasados, esta semana e a que vem: quanto falta e o que ainda precisa ser entregue"
        className="mb-5"
      />
      {marcos.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nenhum marco à frente"
          description="Nenhum marco aberto atrasado, nem vencendo nesta semana ou na que vem."
          density="compact"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {[
            { rotulo: "Atrasados", lista: atrasados },
            { rotulo: "Esta semana", lista: estaSemana },
            { rotulo: "Semana que vem", lista: proxima },
          ]
            .filter((g) => g.lista.length > 0)
            .map((g) => (
              <div key={g.rotulo} className="flex flex-col gap-2">
                <ActivityGroupLabel>
                  {g.rotulo} · {g.lista.length}
                </ActivityGroupLabel>
                {porItem(g.lista).map(({ item, marcos: doItem }) => (
                  <ActivityItemCard
                    key={`${item.kind}-${item.id}`}
                    kind={item.kind}
                    name={item.name}
                    status={item.status}
                    statusEditId={item.id}
                    priority={item.kind === "iniciativa" ? item.priority : null}
                    priorityEditId={item.kind === "iniciativa" ? item.id : undefined}
                    members={item.members}
                    detailId={item.id}
                  >
                    <div className="flex flex-col gap-3 mt-1.5">
                      {doItem.map((m) => (
                        <LinhaDoMarco key={m.id} marco={m} hoje={hoje} />
                      ))}
                    </div>
                  </ActivityItemCard>
                ))}
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
