"use client";

import { useState, useTransition } from "react";
import { Megaphone, Pencil, Plus } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { IconButton } from "@/components/shared/IconButton";
import { Textarea } from "@/components/shared/Field";
import { Button } from "@/components/shared/Button";
import { registrarEdicao } from "@/lib/undo";
import { salvarAvisoDaSemana, type Aviso } from "@/actions/weekly-aviso";
import { formatDayMonth } from "@/lib/date-utils";

/**
 * "Fique ligado": o recado que vale para o time inteiro na semana.
 *
 * Um por semana, não uma thread — foi o que não funcionou no card de
 * comentários que isto substitui: numa lista cronológica o recado importante
 * afunda na terceira mensagem.
 *
 * Card, ao lado das ausências: o par forma o contexto da semana, lido antes de
 * descer para as linhas das pessoas.
 */
export function FiqueLigado({
  weekOf,
  aviso,
  podeEditar,
}: {
  /** Segunda-feira da semana exibida, "yyyy-mm-dd". */
  weekOf: string;
  aviso: Aviso | null;
  podeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(aviso?.content ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  async function aplicar(conteudo: string) {
    const res = await salvarAvisoDaSemana({ weekOf, content: conteudo });
    if (!res.success) {
      setErro(res.error);
      throw new Error(res.error);
    }
  }

  function salvar() {
    const novo = texto.trim();
    const anterior = aviso?.content ?? "";
    setEditando(false);
    if (novo === anterior.trim()) return;
    setErro(null);
    // Desfazer reescreve o texto anterior — e apagar (texto vazio) também
    // volta, porque a reversão passa pelo mesmo caminho de gravação.
    registrarEdicao("aviso da semana", () => aplicar(anterior));
    startTransition(async () => {
      try {
        await aplicar(novo);
      } catch {
        // Erro já está no card.
      }
    });
  }

  function cancelar() {
    setTexto(aviso?.content ?? "");
    setEditando(false);
  }

  return (
    <SectionCard
      icon={Megaphone}
      iconBg="var(--sky-soft)"
      iconColor="var(--sky-strong)"
      title="Fique ligado"
      headerAction={
        podeEditar && aviso && !editando ? (
          <IconButton
            boxSize={24}
            onClick={() => {
              setTexto(aviso.content);
              setEditando(true);
            }}
            title="Editar o aviso da semana"
            aria-label="Editar o aviso da semana"
          >
            <Pencil size={13} />
          </IconButton>
        ) : undefined
      }
      className="h-full"
    >
      <div className="flex flex-col gap-2">
        {editando ? (
          <>
            <Textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  salvar();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelar();
                }
              }}
              rows={3}
              placeholder="O que o time precisa saber nesta semana…"
              className="text-sm resize-none"
              disabled={salvando}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="primary" size="sm" onClick={salvar} disabled={salvando}>
                Salvar
              </Button>
              <Button variant="secondary" size="sm" onClick={cancelar}>
                Cancelar
              </Button>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Ctrl+Enter salva · apagar o texto tira o aviso
              </span>
            </div>
          </>
        ) : aviso ? (
          <>
            <p
              className="text-sm whitespace-pre-wrap break-words"
              style={{ color: "var(--text-secondary)" }}
            >
              {aviso.content}
            </p>
            {/* Só a procedência, e só quando o aviso é herdado: dizer de
                quando ele é evita que um recado velho passe por novo. Quem
                escreveu não aparece — o aviso é do time, não de uma pessoa. */}
            {aviso.herdado && (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Escrito na semana de {formatDayMonth(aviso.weekStart)} · vale até alguém mudar
              </p>
            )}
          </>
        ) : podeEditar ? (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1.5 text-xs self-start"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <Plus size={13} />
            Escrever o aviso da semana
          </button>
        ) : (
          <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
            Nenhum aviso nesta semana.
          </p>
        )}

        {erro && (
          <p className="text-xs" style={{ color: "var(--status-error-text)" }}>
            {erro}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
