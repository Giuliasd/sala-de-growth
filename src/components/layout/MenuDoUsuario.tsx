"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, Moon, Settings, Sun, User } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { BuildVersion } from "@/components/layout/BuildVersion";

/**
 * Rodapé da sidebar: a pessoa logada. Clicar abre um menu com o perfil,
 * Configurações, o atalho de tema, Sair e a versão da build — o que antes eram
 * cinco linhas soltas no rodapé (e roubava altura da lista de páginas).
 *
 * Mesmo padrão do `TagSelect`: portal com posição fixa (não é cortado pelo
 * `overflow` da sidebar), tokens do tema, fecha com clique fora, Esc, rolagem
 * ou mudança de rota. Expandida, o menu abre acima do gatilho; recolhida, à
 * direita da sidebar, com a base alinhada à do avatar.
 */

const LARGURA_DO_MENU = 232;
const FOLGA = 6;

type Item =
  | { tipo: "link"; href: string; rotulo: string; icone: React.ReactNode; perigo?: boolean }
  | { tipo: "botao"; onClick: () => void; rotulo: string; icone: React.ReactNode };

export function MenuDoUsuario({
  userName,
  isExpanded,
  podeVerConfiguracoes,
  isDark,
  onAlternarTema,
}: {
  userName: string;
  isExpanded: boolean;
  /** Configurações é de liderança e colaboradores; visitante não vê. */
  podeVerConfiguracoes: boolean;
  isDark: boolean;
  onAlternarTema: () => void;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const nome = userName || "Minha conta";
  // O gatilho fica destacado nas páginas que só se alcançam por este menu.
  const naPaginaDoMenu = ["/perfil", "/configuracoes"].some(
    (h) => pathname === h || pathname.startsWith(h + "/")
  );

  const itens: Item[] = [
    { tipo: "link", href: "/perfil", rotulo: "Meu perfil", icone: <User size={16} strokeWidth={1.8} /> },
    ...(podeVerConfiguracoes
      ? [{ tipo: "link" as const, href: "/configuracoes", rotulo: "Configurações", icone: <Settings size={16} strokeWidth={1.8} /> }]
      : []),
    {
      tipo: "botao",
      onClick: onAlternarTema,
      rotulo: isDark ? "Mudar para claro" : "Mudar para escuro",
      icone: isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />,
    },
    {
      tipo: "link",
      // Leva à tela de confirmação, preservando a rota atual pra voltar.
      href: `/logout?from=${encodeURIComponent(pathname)}`,
      rotulo: "Sair",
      icone: <LogOut size={16} strokeWidth={1.8} />,
      perigo: true,
    },
  ];

  function fechar(devolverFoco = false) {
    setAberto(false);
    setAtivo(-1);
    if (devolverFoco) gatilhoRef.current?.focus({ preventScroll: true });
  }

  // Posição: depende da altura do menu, então é medida depois de montar e
  // antes de pintar (sem "pulo"). Vai direto no estilo do elemento — é
  // sincronizar com o DOM, não estado de React.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const g = gatilhoRef.current?.getBoundingClientRect();
    if (!aberto || !menu || !g) return;
    const altura = menu.offsetHeight;
    const pos = isExpanded
      ? { top: g.top - altura - FOLGA, left: g.left }
      : { top: g.bottom - altura, left: g.right + FOLGA };
    menu.style.top = `${Math.max(8, pos.top)}px`;
    menu.style.left = `${Math.max(8, Math.min(pos.left, window.innerWidth - LARGURA_DO_MENU - 8))}px`;
    menu.style.visibility = "visible";
  }, [aberto, isExpanded]);

  // Navegou (por um item ou por fora): o menu não fica aberto na tela nova.
  const [rotaVista, setRotaVista] = useState(pathname);
  if (rotaVista !== pathname) {
    setRotaVista(pathname);
    if (aberto) setAberto(false);
  }

  useEffect(() => {
    if (!aberto) return;
    function aoApontar(e: PointerEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || gatilhoRef.current?.contains(t)) return;
      fechar();
    }
    function aoTeclar(e: KeyboardEvent) {
      const n = itens.length;
      if (e.key === "Escape") {
        e.preventDefault();
        fechar(true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setAtivo((i) => (i + 1) % n);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAtivo((i) => (i <= 0 ? n - 1 : i - 1));
      } else if (e.key === "Tab") {
        fechar();
      }
    }
    function aoRolar(e: Event) {
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return;
      fechar();
    }
    function aoRedimensionar() {
      fechar();
    }
    document.addEventListener("pointerdown", aoApontar, true);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      document.removeEventListener("pointerdown", aoApontar, true);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, [aberto, itens.length]);

  // As setas movem o foco entre os itens (foco real: Enter/Espaço funcionam
  // como em qualquer link ou botão).
  useEffect(() => {
    if (!aberto) return;
    const alvo =
      ativo >= 0
        ? menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[ativo]
        : menuRef.current;
    alvo?.focus({ preventScroll: true });
  }, [aberto, ativo]);

  function abrir(viaTeclado: boolean) {
    // Pelo teclado já entra no primeiro item; pelo mouse, foco fica no menu.
    setAtivo(viaTeclado ? 0 : -1);
    setAberto(true);
  }

  const corDoItem = (perigo?: boolean) => (perigo ? "var(--text-secondary)" : "var(--text-primary)");

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        aria-label={`Menu da conta (${nome})`}
        data-tooltip={isExpanded || aberto ? undefined : nome}
        onClick={(e) => (aberto ? fechar() : abrir(e.detail === 0))}
        className="flex items-center transition-colors w-full border-none cursor-pointer"
        style={{
          height: 44,
          borderRadius: 14,
          background: naPaginaDoMenu ? "var(--brand-primary)" : aberto ? "var(--accent-subtle)" : "transparent",
          color: naPaginaDoMenu ? "#FFFFFF" : "var(--text-secondary)",
          paddingLeft: isExpanded ? 8 : 0,
          paddingRight: isExpanded ? 10 : 0,
          justifyContent: isExpanded ? "flex-start" : "center",
        }}
        onMouseEnter={(e) => {
          if (!naPaginaDoMenu) (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
        }}
        onMouseLeave={(e) => {
          if (!naPaginaDoMenu && !aberto) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <Avatar name={nome} size={28} />
        {isExpanded && (
          <>
            <span className="ml-3 text-sm font-medium whitespace-nowrap truncate">{nome}</span>
            <ChevronsUpDown size={16} strokeWidth={1.8} className="ml-auto shrink-0" style={{ opacity: 0.7 }} />
          </>
        )}
      </button>

      {/* Só abre depois de um clique, já no navegador: `document` existe. */}
      {aberto &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Conta de ${nome}`}
            tabIndex={-1}
            className="py-1.5 outline-none"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              // Invisível só até o layout effect medir e posicionar.
              visibility: "hidden",
              width: LARGURA_DO_MENU,
              zIndex: 9999,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Quem está logado — útil sobretudo com a sidebar recolhida, onde
                o nome não aparece. */}
            <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2.5">
              <Avatar name={nome} size={28} />
              <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {nome}
              </span>
            </div>
            <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 0 4px" }} />

            {itens.map((item, idx) => {
              const comum = {
                role: "menuitem" as const,
                tabIndex: -1,
                onMouseEnter: () => setAtivo(idx),
                className: "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left border-none outline-none u-transition",
                style: {
                  background:
                    idx === ativo
                      ? item.tipo === "link" && item.perigo
                        ? "var(--peach-soft)"
                        : "var(--accent-subtle)"
                      : "transparent",
                  color:
                    idx === ativo && item.tipo === "link" && item.perigo
                      ? "var(--peach)"
                      : corDoItem(item.tipo === "link" ? item.perigo : false),
                  cursor: "pointer",
                },
              };
              const conteudo = (
                <>
                  <span className="shrink-0 inline-flex" style={{ opacity: 0.85 }}>
                    {item.icone}
                  </span>
                  <span className="flex-1 truncate">{item.rotulo}</span>
                </>
              );
              return (
                <div key={item.rotulo}>
                  {/* Sair fica separado do resto, como ação de saída. */}
                  {item.tipo === "link" && item.perigo && (
                    <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
                  )}
                  {item.tipo === "link" ? (
                    <Link href={item.href} {...comum} onClick={() => fechar()}>
                      {conteudo}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      {...comum}
                      onClick={() => {
                        item.onClick();
                        fechar(true);
                      }}
                    >
                      {conteudo}
                    </button>
                  )}
                </div>
              );
            })}

            <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0 2px" }} />
            <BuildVersion />
          </div>,
          document.body
        )}
    </>
  );
}
