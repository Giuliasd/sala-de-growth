"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createCheckpoint } from "@/actions/initiative-checkpoints";
import { createExperimentoCheckpoint } from "@/actions/experimento-checkpoints";

/**
 * Adiciona um checkpoint sem sair da Weekly.
 *
 * O ritual é onde o combinado aparece ("isso fica pra sexta") e era exatamente
 * onde não dava para registrar: precisava abrir a iniciativa, achar a seção de
 * checkpoints e voltar. Aqui é nome + Enter.
 *
 * O prazo padrão é o **domingo da semana exibida** — é o que "para esta semana"
 * significa. Quem quiser outra data ajusta no detalhe do item; a intenção aqui
 * é não perder o combinado.
 */
export function QuickCheckpoint({
  kind,
  itemId,
  weekEnd,
  memberIds,
}: {
  kind: "iniciativa" | "experimento";
  itemId: string;
  /** Domingo da semana em exibição — vira o prazo do checkpoint. */
  weekEnd: Date | string;
  /** Responsáveis herdados do item, para o checkpoint já nascer com dono. */
  memberIds: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  const dueDate = new Date(weekEnd).toISOString().slice(0, 10);

  function salvar() {
    const limpo = nome.trim();
    if (!limpo || salvando) return;
    setErro(null);
    startTransition(async () => {
      const res =
        kind === "iniciativa"
          ? await createCheckpoint({ initiativeId: itemId, name: limpo, dueDate, memberIds })
          : await createExperimentoCheckpoint({
              experimentoId: itemId,
              name: limpo,
              dueDate,
              memberIds,
            });
      if (res.success) {
        setNome("");
        // Segue aberto: numa review, checkpoints saem em série.
      } else {
        setErro(res.error);
      }
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <Plus size={12} />
        Checkpoint
      </button>
    );
  }

  return (
    <div className="mt-1.5">
      <input
        autoFocus
        value={nome}
        disabled={salvando}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            salvar();
          } else if (e.key === "Escape") {
            setAberto(false);
            setNome("");
            setErro(null);
          }
        }}
        onBlur={() => {
          if (!nome.trim()) setAberto(false);
        }}
        placeholder="Checkpoint e apertar Enter…"
        className="w-full text-xs px-2 py-1"
        style={{
          background: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
        }}
      />
      {erro ? (
        <p className="text-[11px] mt-1" style={{ color: "var(--status-error-text)" }}>
          {erro}
        </p>
      ) : (
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          Prazo: domingo desta semana · Esc para fechar
        </p>
      )}
    </div>
  );
}
