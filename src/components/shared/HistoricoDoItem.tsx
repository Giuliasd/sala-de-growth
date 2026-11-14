"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { getHistoricoDoItem, type EventoDoHistorico } from "@/actions/historico";
import { formatRelativeTime } from "@/lib/date-utils";
import { acaoSegura } from "@/lib/acao-segura";

/** Edição = as linhas que a mesma pessoa gravou no mesmo instante. */
type Edicao = { quando: string; ator: string | null; textos: { id: string; texto: string }[] };

function agrupar(eventos: EventoDoHistorico[]): Edicao[] {
  const edicoes: Edicao[] = [];
  for (const e of eventos) {
    const ultima = edicoes[edicoes.length - 1];
    if (ultima && ultima.quando === e.quando && ultima.ator === e.ator) {
      ultima.textos.push({ id: e.id, texto: e.texto });
    } else {
      edicoes.push({ quando: e.quando, ator: e.ator, textos: [{ id: e.id, texto: e.texto }] });
    }
  }
  return edicoes;
}

/**
 * "Quem mudou o quê e quando" de uma iniciativa ou experimento.
 *
 * Recolhido por padrão e carregado só na primeira abertura: o histórico cresce
 * com o tempo e quase ninguém abre — não deve pesar no carregamento do detalhe.
 */
export function HistoricoDoItem({
  entidade,
  itemId,
}: {
  entidade: "iniciativa" | "experimento";
  itemId: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [eventos, setEventos] = useState<EventoDoHistorico[] | null>(null);
  const [proximo, setProximo] = useState<string | null>(null);

  async function carregar(antesDe?: string) {
    setCarregando(true);
    setErro(null);
    const res = await acaoSegura(getHistoricoDoItem({ entidade, id: itemId, antesDe }));
    setCarregando(false);
    if (!res.success) {
      setErro(res.error);
      return;
    }
    setEventos((atual) => (antesDe && atual ? [...atual, ...res.data.eventos] : res.data.eventos));
    setProximo(res.data.proximo);
  }

  function alternar() {
    const abrindo = !aberto;
    setAberto(abrindo);
    // Primeira abertura: busca. Reabrir mostra o que já foi carregado.
    if (abrindo && eventos === null && !carregando) void carregar();
  }

  const edicoes = eventos ? agrupar(eventos) : [];

  return (
    <Card padding={0}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-6 py-4 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <History size={18} className="text-forest" aria-hidden />
        <h3 className="text-base font-bold text-ink">Histórico</h3>
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          {aberto ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        </span>
      </button>

      {aberto && (
        <div className="px-6 pb-5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {erro && (
            <p className="text-sm py-4" style={{ color: "var(--status-error-text)" }}>
              {erro}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void carregar(eventos && proximo ? proximo : undefined)}
              >
                Tentar de novo
              </button>
            </p>
          )}

          {!erro && eventos === null && (
            <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
              Carregando…
            </p>
          )}

          {eventos !== null && edicoes.length === 0 && !erro && (
            <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
              Nenhuma alteração registrada ainda. O histórico vale só a partir de agora: edições
              feitas antes dele existir não aparecem.
            </p>
          )}

          {edicoes.length > 0 && (
            <ol className="pt-4 space-y-4">
              {edicoes.map((ed) => (
                <li key={`${ed.quando}-${ed.ator}-${ed.textos[0].id}`}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
                      {ed.ator ?? "Alguém que saiu do time"}
                    </span>{" "}
                    · {formatRelativeTime(ed.quando)}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {ed.textos.map((t) => (
                      <li key={t.id} className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {t.texto}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          {proximo && !erro && (
            <button
              type="button"
              disabled={carregando}
              onClick={() => void carregar(proximo)}
              className="mt-4 text-sm underline"
              style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
            >
              {carregando ? "Carregando…" : "Ver mais antigos"}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
