"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Mail, MailOpen } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/shared/Button";
import { IconButton } from "@/components/shared/IconButton";
import { DetailModal } from "@/components/shared/DetailModal";
import {
  carregarMaisNotificacoes,
  marcarNotificacaoComoLida,
  marcarNotificacaoComoNaoLida,
  marcarTodasComoLidas,
} from "@/actions/notificacoes";
import { NOTIFICACOES_MUDARAM_EVENT } from "@/lib/notificacoes";
import type { AvisoDaLista } from "@/lib/notificacoes-db";
import { formatRelativeTime } from "@/lib/date-utils";
import { acaoSegura } from "@/lib/acao-segura";

const avisarSino = () => window.dispatchEvent(new Event(NOTIFICACOES_MUDARAM_EVENT));

/**
 * A caixa de entrada de avisos da pessoa. Clicar num aviso o marca como lido e
 * abre o item: iniciativa e experimento no popup padrão de detalhe, KR e ação
 * na tela deles.
 */
export function NotificacoesLista({
  inicial,
  proximoInicial,
}: {
  inicial: AvisoDaLista[];
  proximoInicial: string | null;
}) {
  const router = useRouter();
  const [avisos, setAvisos] = useState(inicial);
  const [proximo, setProximo] = useState(proximoInicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ id: string; type: "iniciativa" | "experimento" } | null>(null);

  const naoLidas = avisos.filter((a) => !a.lida).length;

  async function abrir(aviso: AvisoDaLista) {
    if (!aviso.lida) {
      setAvisos((atual) => atual.map((a) => (a.id === aviso.id ? { ...a, lida: true } : a)));
      const res = await marcarNotificacaoComoLida(aviso.id);
      if (res.success) avisarSino();
      else setAvisos((atual) => atual.map((a) => (a.id === aviso.id ? { ...a, lida: false } : a)));
    }
    // Um item só abre no popup de detalhe; KR, ação e avisos que reúnem vários itens vão para a tela deles.
    if (aviso.abreModal) setAberto({ id: aviso.alvoId, type: aviso.alvo === "INICIATIVA" ? "iniciativa" : "experimento" });
    else router.push(aviso.href);
  }

  /** Liga/desliga o "lido" de um aviso sem abri-lo (o lembrete para voltar depois). */
  async function alternarLida(aviso: AvisoDaLista) {
    setErro(null);
    const lidaAgora = !aviso.lida;
    setAvisos((atual) => atual.map((a) => (a.id === aviso.id ? { ...a, lida: lidaAgora } : a)));
    const res = lidaAgora
      ? await marcarNotificacaoComoLida(aviso.id)
      : await marcarNotificacaoComoNaoLida(aviso.id);
    if (res.success) {
      avisarSino();
    } else {
      setAvisos((atual) => atual.map((a) => (a.id === aviso.id ? { ...a, lida: aviso.lida } : a)));
      setErro(res.error);
    }
  }

  async function lerTodas() {
    setErro(null);
    const antes = avisos;
    setAvisos((atual) => atual.map((a) => ({ ...a, lida: true })));
    const res = await marcarTodasComoLidas();
    if (res.success) {
      avisarSino();
    } else {
      setAvisos(antes);
      setErro(res.error);
    }
  }

  async function verMais() {
    if (!proximo || carregando) return;
    setCarregando(true);
    setErro(null);
    const res = await acaoSegura(carregarMaisNotificacoes(proximo));
    setCarregando(false);
    if (!res.success) {
      setErro(res.error);
      return;
    }
    setAvisos((atual) => [...atual, ...res.data.avisos]);
    setProximo(res.data.proximo);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Quando alguém te adiciona ou remove de um item, te menciona ou comenta num item seu."
      >
        <Button variant="secondary" size="sm" onClick={lerTodas} disabled={naoLidas === 0}>
          <CheckCheck size={14} aria-hidden /> Marcar todas como lidas
        </Button>
      </PageHeader>

      {erro && (
        <p role="alert" className="text-sm" style={{ color: "var(--status-error-text)" }}>
          {erro}
        </p>
      )}

      <Card padding={0}>
        {avisos.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação por enquanto"
            description="Os avisos aparecem aqui e ficam guardados por 90 dias."
          />
        ) : (
          <ul>
            {avisos.map((a, i) => (
              <li
                key={a.id}
                // O fundo vive no <li>: o botão de abrir e o de marcar dividem a linha.
                className="flex items-start transition-colors hover:bg-[var(--accent-subtle)]"
                style={{
                  background: a.lida ? "transparent" : "var(--forest-soft)",
                  ...(i > 0 ? { borderTop: "1px solid var(--border-subtle)" } : {}),
                }}
              >
                <button
                  type="button"
                  onClick={() => void abrir(a)}
                  className="min-w-0 flex-1 text-left flex items-start gap-3 pl-5 pr-2 py-4"
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <span
                    aria-hidden
                    className="mt-1.5 shrink-0 rounded-full"
                    style={{ width: 8, height: 8, background: a.lida ? "transparent" : "var(--brand-primary)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-sm"
                      style={{ color: "var(--text-primary)", fontWeight: a.lida ? 400 : 600 }}
                    >
                      {!a.lida && <span className="sr-only">Não lida: </span>}
                      {a.texto}
                    </span>
                    {a.trecho && (
                      <span
                        className="block text-sm mt-1 break-words"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {a.tipo === "MENCAO" || a.tipo === "COMENTARIO" ? `“${a.trecho}”` : a.trecho}
                      </span>
                    )}
                    <span className="block text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {formatRelativeTime(a.quando)}
                    </span>
                  </span>
                </button>
                {/* Sem abrir o aviso: lido volta a "não lido" (fica no sino como lembrete) e vice-versa. */}
                <div className="shrink-0 pr-4 pt-3">
                  <IconButton
                    onClick={() => void alternarLida(a)}
                    title={a.lida ? "Marcar como não lida" : "Marcar como lida"}
                  >
                    {a.lida ? <Mail size={15} aria-hidden /> : <MailOpen size={15} aria-hidden />}
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {proximo && (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => void verMais()} disabled={carregando}>
            {carregando ? "Carregando…" : "Ver mais antigas"}
          </Button>
        </div>
      )}

      {aberto && <DetailModal id={aberto.id} type={aberto.type} onClose={() => setAberto(null)} />}
    </div>
  );
}
