"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MemberRole } from "@/generated/prisma/enums";
import { Users, User } from "lucide-react";
import { Dropdown } from "@/components/shared/Dropdown";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";

interface DashboardFilterBarProps {
  role: MemberRole;
  currentMemberId: string | undefined;
  teamMembers: { id: string; name: string }[];
  isViewAll: boolean;
}

export function DashboardFilterBar({
  role,
  currentMemberId,
  teamMembers,
  isViewAll,
}: DashboardFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rotulo = useLabelTooltip();

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/dashboard?${params.toString()}`;
  }

  if (role === MemberRole.COLABORADOR) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Exibindo:
        </span>
        <div
          className="flex items-center"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-full)",
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => router.push(buildUrl({ view: undefined, responsavel: undefined }))}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 transition-colors"
            style={{
              background: !isViewAll ? "var(--brand-primary)" : "transparent",
              color: !isViewAll ? "#fff" : "var(--text-secondary)",
              cursor: "pointer",
              border: "none",
            }}
          >
            <User size={12} />
            Minha visão
          </button>
          <button
            onClick={() => router.push(buildUrl({ view: "all", responsavel: undefined }))}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 transition-colors"
            style={{
              background: isViewAll ? "var(--brand-primary)" : "transparent",
              color: isViewAll ? "#fff" : "var(--text-secondary)",
              cursor: "pointer",
              border: "none",
            }}
          >
            <Users size={12} />
            Visão geral
          </button>
        </div>
      </div>
    );
  }

  // LIDERANÇA / VISITANTE: dropdown de responsável. Eram pills, uma por
  // pessoa, e a barra quebrava em duas linhas com o time inteiro.
  const TODOS = "todos";
  const selecionado = isViewAll ? TODOS : (currentMemberId ?? TODOS);

  return (
    <div className="flex items-center gap-2">
      {/* Atalho da liderança para a visão do time ("Todos" no dropdown), na
          mesma caixa do dropdown ao lado. Ligado, o clique volta para a
          própria visão — a liderança abre o dashboard nela. */}
      {role === MemberRole.LIDERANCA && (
        <button
          type="button"
          aria-pressed={isViewAll}
          onClick={() =>
            router.push(
              isViewAll
                ? buildUrl({ view: undefined, responsavel: undefined })
                : buildUrl({ view: "all", responsavel: undefined })
            )
          }
          {...rotulo.alvo(isViewAll ? "Voltar para a minha visão" : "Ver o time todo")}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 font-medium u-transition"
          style={{
            background: isViewAll ? "var(--brand-primary)" : "var(--bg-surface)",
            border: `1px solid ${isViewAll ? "var(--brand-primary)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
            color: isViewAll ? "#fff" : "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <Users size={14} className="shrink-0" />
          Visão do time
        </button>
      )}
      {rotulo.tooltip}
      {/* Sem rótulo e sem ícone: o botão mostra o nome, e o tooltip diz do
          que é o filtro. */}
      <Dropdown
        value={selecionado}
        title="Filtrar por responsável"
        onChange={(v) =>
          router.push(
            v === TODOS
              ? buildUrl({ responsavel: undefined, view: "all" })
              : buildUrl({ responsavel: v, view: undefined })
          )
        }
        options={[
          // "Todos" é explícito (?view=all): para a liderança, URL sem param
          // significa "eu", então não dá para representar o time todo pela
          // ausência de filtro.
          { value: TODOS, label: "Todos" },
          ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
        ]}
      />
    </div>
  );
}
