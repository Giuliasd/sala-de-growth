"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";

/**
 * Popup padrão de detalhe de iniciativa/experimento — o mesmo do dashboard.
 *
 * Abre a página de detalhe num <iframe> (?modal=1 esconde a sidebar) sobre um
 * overlay, sem tirar a pessoa da página atual. Use este componente em QUALQUER
 * tela que liste iniciativas/experimentos (exceto as próprias telas de
 * Iniciativas e Experimentos, onde o clique navega para o detalhe).
 *
 * Em `ActivityItemCard`, prefira o prop `detailId`, que já embute este modal.
 *
 * Atenção: o iframe exige `frame-ancestors 'self'` na CSP de produção
 * (src/middleware.ts) — não endurecer de volta para 'none'.
 */
export function DetailModal({
  id,
  type,
  onClose,
  checkpointId,
}: {
  id: string;
  type: "iniciativa" | "experimento";
  onClose: () => void;
  /**
   * Abre o item já com este checkpoint em foco (a lista rola até ele e o
   * realça) — usado pelo calendário de datas-chave ao clicar numa comunicação
   * ou num marco.
   */
  checkpointId?: string | null;
}) {
  const router = useRouter();
  // Página completa do item; o iframe é a mesma com ?modal=1 (sem sidebar).
  const base = type === "iniciativa" ? `/iniciativas/${id}` : `/experimentos/${id}`;
  const foco = checkpointId ? `checkpoint=${encodeURIComponent(checkpointId)}` : "";
  const fullUrl = foco ? `${base}?${foco}` : base;
  const url = `${base}?modal=1${foco ? `&${foco}` : ""}`;
  const rotulo = useLabelTooltip();

  // O iframe é outra página: o que se edita lá dentro (status, datas,
  // checkpoints, responsáveis...) revalida só o iframe. Ao fechar, a página de
  // baixo busca os dados de novo — senão ela mostrava o estado de antes até
  // alguém recarregar. Só quando algo mudou: o iframe avisa
  // ("detail-modal:changed", ver MainContent) a cada re-render vindo do
  // servidor. Abrir e fechar só para ler não re-renderiza a página de baixo —
  // que é justamente a mais pesada (dashboard, rituais, roadmap).
  const changedRef = useRef(false);
  const close = useCallback(() => {
    if (changedRef.current) router.refresh();
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [close]);

  // O iframe (página de detalhe) avisa quando o item é excluído lá dentro:
  // revalida a página de baixo e fecha o popup.
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data === "detail-modal:changed") changedRef.current = true;
      if (e.data === "detail-modal:deleted") {
        changedRef.current = true;
        close();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [close]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "90vw",
          height: "90vh",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--bg-canvas)",
          boxShadow: "var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.3))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Barra superior */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            onClick={close}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{
              color: "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <ArrowLeft size={15} />
            Voltar
          </button>

          {/* Expandir: sai do popup para a página completa do item. É link
              (não botão) de propósito — Ctrl/⌘+clique ou o botão do meio abrem
              numa aba nova, e aí o popup continua aberto aqui. No clique
              normal a navegação troca de página e o popup sai junto; a página
              nova já carrega os dados frescos, sem precisar do refresh do
              fechar. */}
          <Link
            href={fullUrl}
            className="icon-btn ml-auto"
            style={{ width: 28, height: 28 }}
            aria-label="Abrir em tela cheia"
            {...rotulo.alvo("Abrir em tela cheia")}
          >
            <Maximize2 size={15} />
          </Link>
          {rotulo.tooltip}
        </div>

        <iframe
          src={url}
          style={{ flex: 1, border: "none", width: "100%" }}
          title={type === "iniciativa" ? "Iniciativa" : "Experimento"}
        />
      </div>
    </div>
  );
}

/**
 * "Link" que abre o DetailModal em vez de navegar. Aceita as mesmas classes de
 * um <a>/<Link> — é a troca 1:1 para listas que apontavam para a página de
 * detalhe (Gestão, OKRs, MonthSnapshot etc.).
 */
export function DetailModalLink({
  id,
  type,
  className,
  style,
  title,
  children,
}: {
  id: string;
  type: "iniciativa" | "experimento";
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={className}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          // Sem `font: inherit` inline: ele venceria as classes de texto passadas
          // via `className` (ex.: text-sm/font-medium). O reset do Tailwind já
          // aplica `button { font: inherit }`, então o padrão continua herdando.
          ...style,
        }}
        data-tooltip={title}
      >
        {children}
      </button>
      {open && <DetailModal id={id} type={type} onClose={() => setOpen(false)} />}
    </>
  );
}
