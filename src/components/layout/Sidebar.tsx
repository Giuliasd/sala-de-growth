"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Map,
  CalendarCheck,
  CalendarDays,
  Target,
  ClipboardList,
  FlaskConical,
  CalendarOff,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  BarChart2,
  FileText,
  Search,
  Bell,
} from "lucide-react";
import { MenuDoUsuario } from "@/components/layout/MenuDoUsuario";
import { ABRIR_BUSCA_EVENT } from "@/components/shared/BuscaGlobal";
import { NOTIFICACOES_MUDARAM_EVENT, rotuloDoContador } from "@/lib/notificacoes";
import { applyTheme } from "@/lib/theme";
import { useResolvedTheme, useSystemThemeSync, useThemeMode } from "@/components/theme/useThemeMode";
import {
  gravarArmazenado,
  lerArmazenado,
  useArmazenado,
  useArmazenados,
} from "@/hooks/useArmazenado";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  requiresLideranca?: boolean;
  requiresEditor?: boolean; // esconde para VISITANTE
}

interface NavGroup {
  label: string;
  key: string;
  collapsible: boolean;
  defaultOpen: boolean;
  items: NavItem[];
}

// ─── Dados de navegação ───────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Acompanhamento",
    key: "acompanhamento",
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/roadmap", label: "Roadmap", icon: Map },
      { href: "/calendario", label: "Calendário", icon: CalendarDays },
      { href: "/rituais", label: "Rituais", icon: CalendarCheck },
    ],
  },
  {
    label: "Planejamento & Execução",
    key: "planejamento",
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/okrs", label: "OKRs", icon: Target },
      { href: "/iniciativas", label: "Iniciativas", icon: ClipboardList },
      { href: "/experimentos", label: "Experimentos", icon: FlaskConical },
    ],
  },
  {
    label: "Time",
    key: "time",
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/ausencias", label: "Ausências", icon: CalendarOff },
      { href: "/playbook", label: "Playbook", icon: BookOpen },
    ],
  },
];

// Grupo Gestão: visível a todos, mas "Acompanhamento" fica restrito à liderança.
// "Relatórios" é acessível a qualquer membro autenticado.
const GESTAO_GROUP: NavGroup = {
  label: "Gestão",
  key: "gestao",
  collapsible: true,
  defaultOpen: false,
  items: [
    { href: "/gestao", label: "Acompanhamento", icon: BarChart2, requiresLideranca: true },
    { href: "/relatorios", label: "Relatórios", icon: FileText },
  ],
};

// Configurações (liderança e colaboradores; colaborador só vê a aba Playbook
// lá dentro) mora no menu do usuário, no rodapé — ver MenuDoUsuario.

// ─── Botão de busca ────────────────────────────────────────────────────────────

// Mac mostra ⌘K; o resto, Ctrl K. Lido do navegador sem estado: o snapshot do
// servidor é "não é Mac", então a hidratação não diverge.
const semAssinatura = () => () => {};
function useEhMac(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false
  );
}

/**
 * Abre a busca global (a mesma do Ctrl/⌘ + K). A busca mora em <BuscaGlobal />, no
 * layout; aqui só se dispara o evento de abertura — assim a sidebar não precisa
 * conhecer o estado dela.
 */
function BotaoBuscar({ isExpanded }: { isExpanded: boolean }) {
  const ehMac = useEhMac();
  const atalho = ehMac ? "⌘K" : "Ctrl K";
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ABRIR_BUSCA_EVENT))}
      // Colapsada o texto não é renderizado: sem isto o botão não tinha nome.
      aria-label={`Buscar no app (${atalho})`}
      aria-keyshortcuts={ehMac ? "Meta+K" : "Control+K"}
      data-tooltip={isExpanded ? undefined : `Buscar (${atalho})`}
      className="flex items-center transition-colors w-full shrink-0"
      style={{
        height: 40,
        borderRadius: 14,
        background: "transparent",
        color: "var(--text-secondary)",
        paddingLeft: isExpanded ? 12 : 0,
        paddingRight: isExpanded ? 12 : 0,
        justifyContent: isExpanded ? "flex-start" : "center",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
        (e.currentTarget as HTMLElement).style.color = "var(--brand-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
      }}
    >
      <Search size={18} strokeWidth={1.8} className="shrink-0" />
      {isExpanded && (
        <>
          <span className="ml-3 text-sm font-medium whitespace-nowrap">Buscar</span>
          <kbd
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
          >
            {atalho}
          </kbd>
        </>
      )}
    </button>
  );
}

// ─── Sino de notificações ──────────────────────────────────────────────────────

const INTERVALO_DO_SINO_MS = 60_000;

/**
 * Quantos avisos a pessoa não leu. Parte do número que o layout calculou no
 * servidor e o mantém em dia: consulta a cada minuto (só com a aba visível),
 * quando a aba volta ao foco e quando a página de notificações avisa que algo
 * foi lido. Falha de rede não zera nem quebra o número — só mantém o último.
 */
function useNaoLidas(doServidor: number): number {
  const [n, setN] = useState(doServidor);
  // O layout re-renderiza com um número novo a cada navegação: acompanha-o.
  const [visto, setVisto] = useState(doServidor);
  if (visto !== doServidor) {
    setVisto(doServidor);
    setN(doServidor);
  }

  useEffect(() => {
    let vivo = true;
    async function atualizar() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/notificacoes/contagem", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { naoLidas?: unknown };
        if (vivo && typeof json.naoLidas === "number") setN(json.naoLidas);
      } catch {
        // Sem rede: fica o último número.
      }
    }
    const timer = setInterval(atualizar, INTERVALO_DO_SINO_MS);
    window.addEventListener(NOTIFICACOES_MUDARAM_EVENT, atualizar);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      vivo = false;
      clearInterval(timer);
      window.removeEventListener(NOTIFICACOES_MUDARAM_EVENT, atualizar);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, []);

  return n;
}

function BotaoNotificacoes({
  isExpanded,
  naoLidasDoServidor,
  active,
}: {
  isExpanded: boolean;
  naoLidasDoServidor: number;
  active: boolean;
}) {
  const naoLidas = useNaoLidas(naoLidasDoServidor);
  const rotulo = naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : "Notificações";
  return (
    <Link
      href="/notificacoes"
      aria-label={rotulo}
      aria-current={active ? "page" : undefined}
      data-tooltip={isExpanded ? undefined : rotulo}
      className="relative flex items-center transition-colors w-full shrink-0"
      style={{
        height: 40,
        borderRadius: 14,
        background: active ? "var(--brand-primary)" : "transparent",
        color: active ? "#FFFFFF" : "var(--text-secondary)",
        paddingLeft: isExpanded ? 12 : 0,
        paddingRight: isExpanded ? 12 : 0,
        justifyContent: isExpanded ? "flex-start" : "center",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
          (e.currentTarget as HTMLElement).style.color = "var(--brand-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }
      }}
    >
      <Bell size={18} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
      {isExpanded && <span className="ml-3 text-sm font-medium whitespace-nowrap">Notificações</span>}
      {naoLidas > 0 && (
        <span
          aria-hidden
          className="text-[10px] font-bold leading-none rounded-full flex items-center justify-center"
          style={{
            background: active ? "#FFFFFF" : "var(--brand-primary)",
            color: active ? "var(--brand-primary)" : "#FFFFFF",
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            ...(isExpanded
              ? { marginLeft: "auto" }
              : { position: "absolute", top: 4, right: 12 }),
          }}
        >
          {rotuloDoContador(naoLidas)}
        </span>
      )}
    </Link>
  );
}

// ─── NavLink (fora do Sidebar para evitar re-mount a cada render) ─────────────

function NavLink({
  item,
  isExpanded,
  active,
}: {
  item: NavItem;
  isExpanded: boolean;
  active: boolean;
}) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      // Colapsada o texto não é renderizado: sem isto o link não tinha nome.
      aria-label={label}
      aria-current={active ? "page" : undefined}
      // Recolhida só sobra o ícone: o tooltip diz para onde ele leva.
      data-tooltip={isExpanded ? undefined : label}
      className="flex items-center transition-colors w-full"
      style={{
        height: 40,
        borderRadius: 14,
        background: active ? "var(--brand-primary)" : "transparent",
        color: active ? "#FFFFFF" : "var(--text-secondary)",
        paddingLeft: isExpanded ? 12 : 0,
        justifyContent: isExpanded ? "flex-start" : "center",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
          (e.currentTarget as HTMLElement).style.color = "var(--brand-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }
      }}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
      {isExpanded && (
        <span className="ml-3 text-sm font-medium whitespace-nowrap">
          {label}
        </span>
      )}
    </Link>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

// Preferências da sidebar no localStorage (lidas via useArmazenado).
const CHAVE_PIN = "sidebar-pinned";
const chaveDoGrupo = (key: string) => `sidebar-group-${key}`;

/** Grupo aberto: o que foi salvo, ou o padrão do grupo se nada foi salvo. */
function estaAberto(salvo: string | null, defaultOpen: boolean): boolean {
  return salvo !== null ? salvo === "true" : defaultOpen;
}

export function Sidebar({
  userRole,
  userName = "",
  notificacoesNaoLidas = 0,
}: {
  userRole?: string;
  userName?: string;
  /** Calculado no servidor (layout); o sino o mantém em dia depois. */
  notificacoesNaoLidas?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tema: mantém a sincronização com o SO quando em "Sistema" (a Sidebar está
  // sempre montada). O atalho abaixo é só claro/escuro — a opção "Sistema" vive
  // apenas na página do perfil.
  useSystemThemeSync(useThemeMode());
  const resolvedTheme = useResolvedTheme();

  const isLideranca = userRole === "LIDERANCA";
  const isEditor = userRole === "LIDERANCA" || userRole === "COLABORADOR";
  const canSee = (item: NavItem) =>
    (!item.requiresLideranca || isLideranca) && (!item.requiresEditor || isEditor);
  const navGroups = [...NAV_GROUPS, GESTAO_GROUP]
    .map((group) => ({
      ...group,
      items: group.items.filter(canSee),
    }))
    .filter((group) => group.items.length > 0);

  // Grupos abertos/fechados: um valor por grupo no localStorage, lido via store
  // externa. No servidor e na hidratação vale o defaultOpen (os itens aparecem
  // antes do storage carregar); o salvo entra logo depois.
  const gruposRecolhiveis = navGroups.filter((group) => group.collapsible);
  const gruposSalvos = useArmazenados(gruposRecolhiveis.map((group) => chaveDoGrupo(group.key)));
  const groupOpen: Record<string, boolean> = {};
  gruposRecolhiveis.forEach((group, i) => {
    groupOpen[group.key] = estaAberto(gruposSalvos[i], group.defaultOpen);
  });

  // Expandida ou recolhida só muda pelo botão do topo (como o menu lateral do
  // app do Claude) — passar o mouse não abre mais nada. Recolhida, cada ícone
  // mostra o nome no tooltip.
  //
  // O estado é lido do localStorage via store externa (no servidor e na
  // hidratação, recolhida). O efeito só espelha o valor na classe do body.
  // A chave e a classe continuam `sidebar-pinned`, do tempo do pin: quem tinha
  // fixado o menu segue com ele aberto.
  //
  // No modo modal o componente não renderiza nada (early return mais abaixo),
  // mas os efeitos rodam igual — e marcar `sidebar-pinned` no body do iframe
  // empurrava o conteúdo do popup 240px para quem usa a sidebar expandida. Sem
  // sidebar na tela, não há estado a restaurar.
  const isModalView = searchParams.get("modal") === "1";
  const isExpanded = useArmazenado(CHAVE_PIN) === "true" && !isModalView;
  useEffect(() => {
    if (isModalView) return;
    document.body.classList.toggle("sidebar-pinned", isExpanded);
  }, [isExpanded, isModalView]);

  // Auto-abre grupo ao mudar de rota — apenas uma vez por pathname, nunca ao
  // toggle manual. Lê o storage na hora (não o `groupOpen` do render): no
  // primeiro efeito depois da hidratação o render ainda mostrava os defaults.
  const autoOpenedForPath = useRef("");
  useEffect(() => {
    if (autoOpenedForPath.current === pathname) return;
    autoOpenedForPath.current = pathname;
    for (const group of navGroups) {
      if (!group.collapsible) continue;
      const hasActive = group.items.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/")
      );
      const chave = chaveDoGrupo(group.key);
      if (hasActive && !estaAberto(lerArmazenado(chave), group.defaultOpen)) {
        gravarArmazenado(chave, "true");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (isModalView) return null;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function toggleExpanded() {
    gravarArmazenado(CHAVE_PIN, String(!isExpanded));
  }

  function toggleGroup(key: string) {
    gravarArmazenado(chaveDoGrupo(key), String(!groupOpen[key]));
  }

  function toggleLightDark() {
    applyTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen z-50 flex flex-col py-4 transition-all duration-300 ease-in-out overflow-hidden"
      style={{
        width: isExpanded ? 240 : 72,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        alignItems: isExpanded ? "flex-start" : "center",
        paddingLeft: isExpanded ? 12 : 0,
        paddingRight: isExpanded ? 12 : 0,
      }}
    >
      {/* Logo */}
      <div
        className="w-full flex items-center mb-4 shrink-0 px-2"
        style={{ justifyContent: isExpanded ? "flex-start" : "center" }}
      >
        <div className="flex items-center">
          <Link
            href="/dashboard"
            className="flex items-center justify-center shrink-0"
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-md)",
              background: "var(--brand-primary)",
            }}
            aria-label="Sala de Growth — ir para o Dashboard"
            data-tooltip={isExpanded ? undefined : "Dashboard"}
          >
            <span className="font-bold text-white select-none" style={{ fontSize: 20, lineHeight: 1 }}>
              S
            </span>
          </Link>
          {isExpanded && (
            <span
              className="ml-3 font-bold text-lg whitespace-nowrap self-center"
              style={{ color: "var(--text-primary)" }}
            >
              Sala de Growth
            </span>
          )}
        </div>
      </div>

      {/* Expandir, Buscar e Notificações com o mesmo respiro das páginas da
          lista (2px) — com o gap do menu (8px) pareciam soltos do resto. */}
      <div className="flex flex-col gap-0.5 w-full shrink-0 mb-0.5">
        {/* Recolher/expandir: uma linha só dela, logo abaixo do logo, no MESMO
            lugar nos dois estados — quem clica para expandir e quer recolher de
            novo acha o botão onde o deixou (antes ele pulava para a direita do
            nome e a Busca ocupava a vaga, recebendo o clique por engano). */}
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex items-center transition-colors w-full shrink-0"
          style={{
            height: 40,
            borderRadius: 14,
            background: "transparent",
            color: "var(--text-muted)",
            paddingLeft: isExpanded ? 12 : 0,
            justifyContent: isExpanded ? "flex-start" : "center",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
            (e.currentTarget as HTMLElement).style.color = "var(--brand-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
          aria-label={isExpanded ? "Recolher menu" : "Expandir menu"}
          aria-expanded={isExpanded}
          data-tooltip={isExpanded ? undefined : "Expandir menu"}
        >
          {isExpanded ? (
            <PanelLeftClose size={18} strokeWidth={1.8} className="shrink-0" />
          ) : (
            <PanelLeftOpen size={18} strokeWidth={1.8} className="shrink-0" />
          )}
          {isExpanded && (
            <span className="ml-3 text-sm font-medium whitespace-nowrap">Recolher menu</span>
          )}
        </button>

        {/* Busca global: mesma do Ctrl/⌘ + K, agora visível no menu. */}
        <BotaoBuscar isExpanded={isExpanded} />

        {/* Avisos: adicionada/removida de item, menção e comentário. */}
        <BotaoNotificacoes
          isExpanded={isExpanded}
          naoLidasDoServidor={notificacoesNaoLidas}
          active={isActive("/notificacoes")}
        />
      </div>

      {/* Navegação principal. Em tela baixa a lista rola; recolhida, a barra de
          rolagem fica escondida (segue rolando pela roda/touchpad). Com ela à
          vista, os ~15px da barra saíam dos 72px do menu e os ícones da lista
          ficavam fora do eixo dos de cima e de baixo, com a pill ativa cortada. */}
      <nav
        className="flex flex-col flex-1 w-full overflow-y-auto"
        style={{
          alignItems: isExpanded ? "flex-start" : "center",
          gap: 0,
          scrollbarWidth: isExpanded ? "thin" : "none",
        }}
      >
        {navGroups.map((group, idx) => (
          <div key={group.key} className={`w-full${!isExpanded && idx > 0 ? " mt-3" : ""}`}>
            {/* Header do grupo colapsável */}
            {group.collapsible && isExpanded && (
              <button
                onClick={() => toggleGroup(group.key)}
                aria-expanded={!!groupOpen[group.key]}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-md transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--brand-primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }}
              >
                <span className="text-xs tracking-wider font-medium text-left">
                  {group.label}
                </span>
                {groupOpen[group.key] ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            )}

            {/* Items — em modo expandido usa animação grid; em modo ícone sempre visível */}
            {isExpanded ? (
              <div
                className={`grid transition-all duration-200 ${
                  !group.collapsible || groupOpen[group.key]
                    ? "grid-rows-[1fr]"
                    : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-0.5 pb-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        isExpanded={isExpanded}
                        active={isActive(item.href)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 pb-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    isExpanded={isExpanded}
                    active={isActive(item.href)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Rodapé: a pessoa logada. Perfil, Configurações, tema, Sair e a versão
          ficam no menu que abre ao clicar — antes eram cinco linhas aqui. */}
      <div className="w-full mt-2 shrink-0">
        <MenuDoUsuario
          userName={userName}
          isExpanded={isExpanded}
          podeVerConfiguracoes={isEditor}
          isDark={resolvedTheme === "dark"}
          onAlternarTema={toggleLightDark}
        />
      </div>
    </aside>
  );
}
