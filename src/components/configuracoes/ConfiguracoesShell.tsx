"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Layers, Users, CalendarRange, Clock, Library, Bot } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

// Frentes, membros, quarters e rituais são de liderança; o playbook é gerenciado por
// qualquer membro que edita (liderança e colaboradores). "Conectar ao Claude"
// (passo a passo do MCP) também é para todos que acessam Configurações.
const MENU_ITEMS = [
  {
    label: "Frentes",
    href: "/configuracoes/frentes",
    icon: Layers,
    requiresLideranca: true,
  },
  {
    label: "Membros",
    href: "/configuracoes/membros",
    icon: Users,
    requiresLideranca: true,
  },
  {
    label: "Quarters",
    href: "/configuracoes/quarters",
    icon: CalendarRange,
    requiresLideranca: true,
  },
  {
    label: "Rituais",
    href: "/configuracoes/rituais",
    icon: Clock,
    requiresLideranca: true,
  },
  {
    label: "Playbook",
    href: "/configuracoes/playbook",
    icon: Library,
  },
  {
    label: "Conectar ao Claude",
    href: "/configuracoes/claude",
    icon: Bot,
  },
];

export function ConfiguracoesShell({
  children,
  isLideranca,
}: {
  children: React.ReactNode;
  isLideranca: boolean;
}) {
  const pathname = usePathname();
  const menuItems = MENU_ITEMS.filter((item) => !item.requiresLideranca || isLideranca);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description={
          isLideranca
            ? "Gerencie frentes, membros, quarters, rituais e playbook"
            : "Gerencie o playbook do time"
        }
      />

      <div className="flex flex-col md:flex-row gap-8">
        {/* Internal Sidebar / Navigation */}
        <aside className="w-full md:w-[220px] shrink-0">
          <nav className="flex md:flex-col gap-1 p-1 bg-paper/50 rounded-xl border border-line overflow-x-auto md:overflow-visible">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                  style={{
                    // Ativo = verde sólido + branco (mesma convenção do Sidebar
                    // principal), legível em light e dark. O padrão antigo
                    // (bg-forest-soft + text-forest) era verde sobre verde-claro
                    // e sumia no dark.
                    background: isActive ? "var(--brand-primary)" : "transparent",
                    color: isActive ? "#FFFFFF" : "var(--text-secondary)",
                    boxShadow: isActive ? "var(--shadow-sm)" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "var(--accent-subtle)";
                      e.currentTarget.style.color = "var(--brand-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Sub-page Content. Não use <main>: o globals.css dá margin-left
            (recuo da sidebar do app) a todo <main>, e um segundo aqui dentro
            abria um vão de 72–240px entre o menu e o conteúdo. */}
        <section className="flex-1 min-w-0">
          {children}
        </section>
      </div>
    </div>
  );
}
