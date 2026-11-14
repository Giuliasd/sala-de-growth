"use client";

import { Trash2, UserRound } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";

/**
 * Linha "data às hora · quem atualizou" de uma atualização do histórico do KR.
 *
 * Quando quem lançou o valor não é responsável pelo KR, o nome vira uma pill —
 * é o aviso de que a atualização veio de fora. Quem pode apagar a atualização
 * (ver `deleteOKRUpdate`) ganha o botão de lixeira ao lado.
 */

export type OKRUpdateMetaEntry = {
  id: string;
  date: Date | string;
  member: { name: string };
  /** Observação de quem atualizou (por que o valor mudou). */
  note?: string | null;
  porNaoResponsavel?: boolean;
  podeApagar?: boolean;
};

function formatDate(date: Date | string): string {
  return new Date(date as any).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function formatTime(date: Date | string): string {
  return new Date(date as any).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function OKRUpdateMeta({
  entry,
  onDelete,
}: {
  entry: OKRUpdateMetaEntry;
  onDelete?: (id: string) => void;
}) {
  const { alvo, tooltip } = useLabelTooltip();

  return (
    <>
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span>
        {formatDate(entry.date)} às {formatTime(entry.date)} ·
      </span>
      {entry.porNaoResponsavel ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 font-medium"
          style={{
            borderRadius: "var(--radius-full)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
          {...alvo("Atualizado por quem não é responsável por este KR")}
        >
          <UserRound size={10} />
          {entry.member.name}
        </span>
      ) : (
        <span>{entry.member.name}</span>
      )}
      {tooltip}
      {entry.podeApagar && onDelete && (
        <IconButton
          type="button"
          boxSize={22}
          title="Apagar atualização"
          onClick={() => onDelete(entry.id)}
          style={{ marginLeft: "auto", color: "var(--text-muted)" }}
        >
          <Trash2 size={12} />
        </IconButton>
      )}
    </div>
    {entry.note && (
      <p className="mt-0.5 text-xs break-words" style={{ color: "var(--text-secondary)" }}>
        “{entry.note}”
      </p>
    )}
    </>
  );
}
