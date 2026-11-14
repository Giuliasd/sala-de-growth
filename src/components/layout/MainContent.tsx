"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function MainContent({
  children,
  renderedAt,
}: {
  children: React.ReactNode;
  /** Carimbo do render no servidor (ver o layout do grupo (app)). */
  renderedAt: number;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isModal = searchParams.get("modal") === "1";

  // No popup de detalhe (iframe), avisa a janela-pai quando a página voltou do
  // servidor re-renderizada. Toda server action de mutação revalida, e a
  // resposta dela traz a página nova — então um carimbo diferente do primeiro
  // significa "algo foi editado aqui dentro". O DetailModal usa isso para só
  // re-renderizar a página de baixo ao fechar se houve mudança.
  const firstRender = useRef(renderedAt);
  useEffect(() => {
    if (!isModal || renderedAt === firstRender.current) return;
    if (window.parent !== window) {
      window.parent.postMessage("detail-modal:changed", window.location.origin);
    }
  }, [isModal, renderedAt]);

  return (
    <>
      {/* No popup de detalhe a sidebar não é renderizada, mas o recuo global que
          reserva a trilha dela (`main { margin-left: 72px }`) continua valendo —
          o conteúdo ficava 72px mais longe da borda esquerda que da direita.
          Pior: para quem usa a sidebar fixada, o efeito que restaura o pin roda
          dentro do iframe e o recuo virava 240px.

          A regra vem daqui, e não do globals.css, porque só este componente sabe
          que é popup; e vem como <style> em vez de classe no body para já valer
          na primeira pintura do servidor, sem pulo depois da hidratação. O
          !important vence o da regra do pin. */}
      {isModal && (
        <style>
          {
            // Repete o seletor da sidebar expandida: só `main` perderia por
            // especificidade (`body.sidebar-pinned main` tem uma classe a
            // mais). Com o mesmo seletor, este <style> vem depois no
            // documento e vence.
            "main, body.sidebar-pinned main { margin-left: 0 !important; }" +
            // O "Voltar para Iniciativas/Experimentos" da página de detalhe:
            // no popup quem volta é o "Voltar" da barra do modal, e o link
            // levaria a lista para DENTRO do iframe.
            " [data-voltar-lista] { display: none !important; }"
          }
        </style>
      )}
      <div
        className="mx-auto"
        style={{
          // Respiro lateral pela metade (48 → 24px; no popup, 32 → 16px): a
          // folga era generosa demais e comia largura útil das tabelas. O
          // vertical fica como estava — o pedido era só das laterais.
          padding: isModal ? "24px 16px" : "32px 24px",
          maxWidth: isModal ? "100%" : 1440,
        }}
      >
        {/* key por rota: remonta e dispara o fade-in a cada navegação */}
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </div>
    </>
  );
}
