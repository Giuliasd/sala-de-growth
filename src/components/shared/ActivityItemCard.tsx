"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ClipboardList, FlaskConical } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { DetailModal } from "@/components/shared/DetailModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { MemberChips, type ChipMember } from "@/components/shared/MemberChips";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";
import { type StatusEntity } from "@/lib/statusConfig";

/**
 * Padrão canônico de "item de atividade" — o card usado no "Precisa de você" do
 * dashboard e nas abas de Rituais (Weekly e Experimentos ativos).
 *
 * Anatomia (linha de cabeçalho): ícone do tipo → nome clicável → pill de
 * status (statusConfig) → chips dos responsáveis (primeiros nomes, com "+N"
 * quando passa de 2) → `trailing` (contador, ICE, botões). O corpo
 * (`children`) é livre: checkpoints, linha de lançamento, frente etc.
 *
 * Não recrie variações locais deste card (borda lateral colorida, avatar no
 * lugar do chip, etc.) — se a visão precisar de algo a mais, use os slots.
 * Grupos de cards usam <ActivityGroupLabel> como título de seção.
 */

export function ActivityGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs uppercase tracking-wider font-medium"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </p>
  );
}

/**
 * Pill de status — mesmo design de tag do resto do produto (StatusBadge:
 * ícone + borda + fundo suave). Com `editId`, vira editável (clique abre o
 * TagSelect). Wrappers finos mantidos por compatibilidade com os call sites.
 */
export function ActivityStatusPill({
  type,
  status,
  editId,
}: {
  type: StatusEntity;
  status: string;
  editId?: string;
}) {
  return (
    <span className="shrink-0">
      <StatusBadge status={status} type={type} itemId={editId} />
    </span>
  );
}

/** Pill de prioridade (só iniciativas) — via PriorityBadge; editável com `editId`. */
export function ActivityPriorityPill({ priority, editId }: { priority: string; editId?: string }) {
  return (
    <span className="shrink-0">
      <PriorityBadge priority={priority} itemId={editId} />
    </span>
  );
}

/**
 * Chips dos responsáveis do item. Fino sobre <MemberChips> — o card mostra até
 * 2 primeiros nomes e agrupa o excedente em "+N" (tooltip lista todos).
 */
export function ActivityMemberChips({ members }: { members: ChipMember[] }) {
  return (
    <span className="shrink-0">
      <MemberChips members={members} max={2} />
    </span>
  );
}

export function ActivityItemCard({
  kind,
  name,
  status,
  statusEditId,
  priority,
  priorityEditId,
  members,
  href,
  onNameClick,
  detailId,
  afterName,
  trailing,
  wrapName = false,
  children,
  style,
  className = "",
}: {
  kind: StatusEntity;
  name: string;
  /** Quando presente, renderiza a pill de status (omitir se o contexto já indica o status, ex.: coluna de kanban). */
  status?: string;
  /** Torna a pill de status editável (clique abre seletor). Id da iniciativa/experimento. */
  statusEditId?: string;
  /** Prioridade (só iniciativas) — renderiza a pill de prioridade. */
  priority?: string | null;
  /** Torna a pill de prioridade editável. Id da iniciativa. */
  priorityEditId?: string;
  /** Chips dos responsáveis (omitir quando a visão já agrupa por pessoa). */
  members?: ChipMember[];
  /** Nome como Link (navegação) — usar SÓ nas telas de Iniciativas/Experimentos. */
  href?: string;
  onNameClick?: () => void;
  /**
   * Padrão fora das telas de Iniciativas/Experimentos: clique no nome abre o
   * DetailModal (popup do dashboard) com o detalhe do item, sem sair da página.
   */
  detailId?: string;
  /**
   * Slot logo depois do nome, antes das pills. Para marcador que pertence ao
   * título (a estrela de prioridade da Weekly): solto na direita ele lia como
   * ação do card, não como atributo do item.
   */
  afterName?: React.ReactNode;
  /** Slot à direita do cabeçalho: contador, ICE score, botões. */
  trailing?: React.ReactNode;
  /** Deixa o nome quebrar em várias linhas em vez de truncar (kanban). */
  wrapName?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  /**
   * Classes na superfície do card. Serve para o chamador declarar um grupo de
   * hover (`group/item`) e revelar controles próprios ao passar o mouse.
   */
  className?: string;
}) {
  const Icon = kind === "iniciativa" ? ClipboardList : FlaskConical;
  const [detailOpen, setDetailOpen] = useState(false);
  const handleNameClick =
    onNameClick ?? (detailId ? () => setDetailOpen(true) : undefined);

  // No kanban o nome é a informação principal do card e a coluna é estreita:
  // lá ele quebra em quantas linhas precisar. Nas listas densas (dashboard,
  // Rituais) uma linha por item continua sendo a regra.
  const nameClasses = `text-sm font-medium text-left ${wrapName ? "break-words" : "truncate"}`;
  const nameStyle: React.CSSProperties = {
    color: "var(--text-primary)",
    // min-width força a quebra: com 0, o nome encolheria até sumir e as pills
    // continuariam na mesma linha, vazando para fora do card.
    //
    // Com `afterName`, quem cresce é o bloco que envolve nome + marcador (ver
    // o wrapper abaixo): o nome passa a ocupar só o que precisa, para o
    // marcador ficar colado no fim do título.
    flex: afterName ? "0 1 auto" : "1 1 auto",
    minWidth: afterName ? 0 : "8rem",
  };

  // Tooltip do design system no lugar do `title` nativo (fora do tema, sem teclado).
  const rotulo = useLabelTooltip();

  const nomeRenderizado = href ? (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={`${nameClasses} transition-colors hover:underline`}
      style={nameStyle}
      {...rotulo.alvo("Ver detalhe")}
    >
      {name}
      {rotulo.tooltip}
    </Link>
  ) : handleNameClick ? (
    <button
      onClick={handleNameClick}
      className={`${nameClasses} transition-colors hover:underline`}
      style={{
        ...nameStyle,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
      {...rotulo.alvo("Ver detalhe")}
    >
      {name}
      {rotulo.tooltip}
    </button>
  ) : (
    <span className={nameClasses} style={nameStyle}>
      {name}
    </span>
  );

  return (
    <Card
      padding="10px 12px"
      className={className}
      style={{ borderRadius: "var(--radius-md)", boxShadow: "none", ...style }}
    >
      {/* flex-wrap: em card estreito (a coluna de itens da Weekly, por
          exemplo) as pills não cabiam ao lado do nome e vazavam para fora da
          borda — o nome encolhia até sumir e elas continuavam estourando. Sem
          espaço, elas descem para a linha de baixo. */}
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        <Icon size={13} style={{ color: "var(--brand-primary)", flexShrink: 0 }} />
        {/* Sem `afterName` a estrutura é a de sempre (nome cresce, pills à
            direita). Com ele, este bloco assume o crescimento. */}
        {afterName ? (
          <span
            className="flex items-center gap-1.5 min-w-0"
            style={{ flex: "1 1 auto", minWidth: "8rem" }}
          >
            {nomeRenderizado}
            {/* Fragment com key: o elemento de `afterName` nasce no componente
                de fora e chega aqui como irmão de `nomeRenderizado`, e o React
                cobra key desse par em dev ("Each child in a list..."). Quem
                chama não tem como calar o aviso — do lado dele é um prop, não
                uma lista. A key mora aqui, onde a lista de fato existe. */}
            <Fragment key="after-name">{afterName}</Fragment>
          </span>
        ) : (
          nomeRenderizado
        )}

        {status && <ActivityStatusPill type={kind} status={status} editId={statusEditId} />}
        {priority && <ActivityPriorityPill priority={priority} editId={priorityEditId} />}
        {members && members.length > 0 && <ActivityMemberChips members={members} />}
        {trailing}
      </div>
      {children && <div className="mt-1.5">{children}</div>}

      {detailOpen && detailId && (kind === "iniciativa" || kind === "experimento") && (
        <DetailModal id={detailId} type={kind} onClose={() => setDetailOpen(false)} />
      )}
    </Card>
  );
}
