"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  AlignLeft, ListChecks, Trash2, Plus, AlertCircle, Pencil, CalendarRange, CalendarClock,
  List, CalendarDays, GripVertical, ChevronRight, ChevronDown, X, Flame, CheckSquare, Eye, EyeOff,
  Tag, Layers, ChevronsUpDown, ChevronsDownUp,
} from "lucide-react";
import { familyBg, familyBorder, familyStrong } from "@/lib/statusConfig";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { gravarArmazenado, useArmazenado } from "@/hooks/useArmazenado";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { Avatar } from "@/components/shared/Avatar";
import { MemberChips } from "@/components/shared/MemberChips";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { FilterPill } from "@/components/shared/FilterPill";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { SortIcon } from "@/components/shared/SortableColumnHeader";
import {
  CATEGORIA_CONFIG,
  CategoriaIcon,
  CategoriaPicker,
} from "@/components/shared/CheckpointCategoria";
import {
  checkpointTagColors,
  CheckpointTagChips,
  TAG_CHIP_MAX_W,
  CheckpointTagManager,
  CheckpointTagPicker,
  type CheckpointTagActions,
  type CheckpointTagLite,
} from "@/components/shared/CheckpointTags";
import { nextCheckpointTagColor } from "@/lib/checkpoint-tag-colors";
import { aplicarCoberturaDosPais } from "@/lib/checkpoint-cobertura";
import { Input, Textarea } from "@/components/shared/Field";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import {
  CheckpointBulkEditBar,
  SelectCheckbox,
  type CheckpointBulkPatch,
} from "@/components/shared/BulkEditBar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "@/components/shared/Toast";
import dynamic from "next/dynamic";
const CheckpointGantt = dynamic(
  () => import("@/components/shared/CheckpointGantt").then((m) => ({ default: m.CheckpointGantt })),
  { ssr: false }
);
const CheckpointCalendar = dynamic(
  () => import("@/components/shared/CheckpointCalendar").then((m) => ({ default: m.CheckpointCalendar })),
  { ssr: false }
);
import { formatFullDate } from "@/lib/date-utils";
import { isDataPlausivel, MENSAGEM_DATA_INVALIDA, MENSAGEM_ORDEM_DATAS } from "@/lib/date-validation";
import { MAX_CHECKPOINT_DEPTH, moveRoots, planCheckpointMove, validMoveTargets } from "@/lib/checkpoint-move";
import { soltoNoCalendario } from "@/lib/checkpoint-calendar";
import { resolverTagsEfetivas, segmentarPorTag, SEM_TAG_KEY } from "@/lib/checkpoint-tag-grupos";
import { CHECKPOINT_CATEGORIAS, type CheckpointCategoria } from "@/lib/checkpoint-categoria";
import {
  ehMarco,
  listarNomes,
  marcosQueExigem,
  podeSerRequisito,
  progressoDoMarco,
  type ProgressoDoMarco,
} from "@/lib/checkpoint-marco";
import {
  MarcoChip,
  MarcoProgressoContagem,
  MarcoRequisitosLista,
  MarcoRequisitosPicker,
} from "@/components/shared/CheckpointMarco";
import { TextoComLinks } from "@/components/shared/TextoComLinks";
import { MENSAGEM_FALHA_DE_REDE } from "@/lib/acao-segura";

// ── Colunas da linha de checkpoint ───────────────────────────────────────────
// Larguras fixas (é o que mantém as colunas no mesmo x em todas as linhas),
// mas dimensionadas pelo conteúdo real, não pela largura da tabela de
// iniciativas: lá elas somavam 365px de uma linha de ~735px e sobrava um terço
// para o nome, que truncava cedo demais. Agora:
//   contagem  36 — "10/10" em 12px cabe em ~30
//   membro   120 — chips de primeiro nome + "+N" (a tabela usa 140 numa linha
//                  bem mais larga)
//   data      85 — "23/07/2026" em mono 11px mede ~81 (mesma da coluna "Início")
//   ações     84 — 3 ícones de 24 + 2 gaps de 4
// O que sobra vai todo para o nome, que é flex-1 e só trunca quando precisa.
/**
 * Preferência de quem usa o "expandir todos": abrir os cards já com os
 * sub-checkpoints à vista. Vale para todos os itens — é jeito de ler, não
 * dado do checkpoint — e mora no navegador, como a largura da coluna do roadmap.
 */
const SUBS_ABERTOS_STORAGE_KEY = "checkpoints:subs-abertos";

const COUNT_COL_WIDTH = 36;
const MEMBER_COL_WIDTH = 120;
// Coluna de tags: dois chips + "+N" (um só no card apertado). A largura NÃO é
// fixa — sai do conteúdo (ver larguraDaColunaDeTags): fixa, com tags curtas,
// sobrava um vão grande até a coluna de responsável. O teto subiu de 150 para
// 180 quando o chip passou à caixa do de responsável (text-xs, mais largo).
const TAG_COL_MAX = 180;
// "TAGS" + ícone de ordenação: a coluna não fica mais estreita que o rótulo.
const TAG_COL_MIN = 48;

/**
 * Largura da coluna de tags pelo conteúdo: a linha que mais ocupa define.
 * Estimativa de texto (text-xs ≈ 6.5px por caractere, + 12px de padding do
 * chip), limitada ao maxWidth do chip — medir no DOM custaria um render a mais
 * por mudança. Exportada para o teste.
 */
export function larguraDaColunaDeTags(linhas: { name: string }[][], maxChips: number): number {
  const CHIP_MAX = TAG_CHIP_MAX_W;
  const GAP = 4;
  // Chip "+N" (dois caracteres + padding).
  const MAIS_N = 26;
  let maior = 0;
  for (const tags of linhas) {
    if (tags.length === 0) continue;
    const visiveis = tags.slice(0, maxChips);
    const chips = visiveis.reduce((soma, t) => soma + Math.min(CHIP_MAX, t.name.length * 6.5 + 12), 0);
    const largura =
      chips + GAP * (visiveis.length - 1) + (tags.length > maxChips ? GAP + MAIS_N : 0);
    maior = Math.max(maior, largura);
  }
  return Math.min(TAG_COL_MAX, Math.max(TAG_COL_MIN, Math.ceil(maior)));
}
// Duas colunas de data (início e fim), 85 cada: "23/07/2026" em mono 11px
// mede ~81. É a mesma largura da coluna "Início" da tabela de iniciativas.
const DATE_COL_WIDTH = 85;
const ACTIONS_COL_WIDTH = 84;
// Coluna "Marco": o chip com o nome do marco, truncado. Mais estreita no card
// apertado, mas sempre com o nome.
const MARCO_COL_WIDTH = 120;
const MARCO_COL_WIDTH_COMPACTA = 96;

// Abaixo disto a coluna "Início" sai e sobra largura para o nome. 560 é onde
// o nome passa a caber em ~200px — o ponto em que ele volta a ser legível.
const LARGURA_MINIMA_PARA_INICIO = 560;
/**
 * Abaixo disto o card é "apertado": a coluna de tags mostra um chip só.
 *
 * Nasceu para esconder a pill "Em progresso", que com texto custava ~110px e
 * fazia o nome truncar em "Tax…" num card de 783px. A pill virou só ícone
 * (~20px) e agora fica sempre; o limiar segue valendo para as tags.
 */
const LARGURA_MINIMA_PARA_PILL = 860;

// Orçamento da linha com a coluna de tags, medido no card (715px sobravam
// 91px para o nome com tags + início): tudo que NÃO é nome, tags ou início —
// padding do card, controles à esquerda, contagem, responsável, fim, ações e
// os gaps — soma ~475px.
const LARGURA_FIXA_DA_LINHA = 475;
// Com as tags, o "Início" sai antes de o nome cair abaixo disto...
const NOME_MINIMO_COM_INICIO = 180;
// ...e as próprias tags só saem quando nem sem o início o nome chega a isto.
const NOME_MINIMO_COM_TAGS = 120;

/**
 * Tipografia do rótulo de coluna, copiada do `<th>` da tabela de iniciativas
 * (SortableColumnHeader): 11px, peso 600, --text-muted, caixa alta e
 * letter-spacing 0.05em. Fica em objeto de estilo porque o `tracking` da
 * tabela é um valor exato, não o `tracking-wide` do Tailwind.
 */
const COL_LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

/**
 * Rótulo clicável de coluna da lista de checkpoints.
 *
 * Herda a tipografia de COL_LABEL_STYLE e o ícone de SortableColumnHeader,
 * para o cabeçalho da lista e o da tabela de iniciativas se lerem como o
 * mesmo controle. O que NÃO vem de lá: arrastar coluna e redimensionar —
 * as colunas da lista são fixas.
 */
function SortLabel({
  label,
  sortKey,
  currentSortKey,
  sortDir,
  onSort,
  align = "start",
  width,
}: {
  label: string;
  sortKey: CheckpointSortKey;
  currentSortKey: CheckpointSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: CheckpointSortKey) => void;
  align?: "start" | "end";
  width?: number;
}) {
  return (
    <span
      className="flex"
      style={{ width, justifyContent: align === "end" ? "flex-end" : "flex-start" }}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Ordenar por ${label}`}
        style={{
          ...COL_LABEL_STYLE,
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {label}
        <SortIcon active={currentSortKey === sortKey} dir={sortDir} />
      </button>
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type { CheckpointTagActions, CheckpointTagLite };

export type CheckpointNode = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | string | null;
  dueDate: Date | string;
  isCompleted: boolean;
  /** Categoria do checkpoint; null = comum. */
  categoria?: string | null;
  /** Tags do checkpoint — sempre dentre as configuradas no próprio item. */
  tags?: CheckpointTagLite[];
  /** Só em marco: os checkpoints necessários (ids; o resto vem da árvore). */
  requisitos?: { id: string }[];
  completedAt: Date | string | null;
  order: number;
  members: { id: string; name: string }[];
  children: CheckpointNode[];
};

type FlatItem = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | string | null;
  dueDate: Date | string;
  isCompleted: boolean;
  categoria?: string | null;
  /**
   * Só os ids: nome e cor vêm da lista de tags do item na hora de desenhar,
   * para renomear/recolorir no gerenciador refletir na lista na hora.
   */
  tagIds: string[];
  /** Só em marco: ids dos checkpoints necessários (ver lib/checkpoint-marco). */
  requisitoIds: string[];
  completedAt: Date | string | null;
  order: number;
  members: { id: string; name: string }[];
  depth: number;
  parentId: string | null;
};

type ProgressoNaLista = ProgressoDoMarco<FlatItem>;

type ActionResp = { success: true; data?: unknown } | { success: false; error: string };

/**
 * Conjunto de server actions do checkpoint. Cada wrapper (iniciativas/experimentos)
 * injeta o id da entidade nas closures, então este componente é agnóstico.
 */
export interface CheckpointActions {
  create: (data: {
    parentId?: string | null;
    name: string;
    description?: string;
    startDate?: string | null;
    dueDate: string;
    memberIds?: string[];
    /** Ausente não mexe na categoria; `null` limpa. */
    categoria?: CheckpointCategoria | null;
    /** Lista final de tags. Ausente não mexe; `[]` tira todas. */
    tagIds?: string[];
    /** Só em marco: checkpoints necessários. */
    requisitoIds?: string[];
    /** Só em checkpoint que não é marco: os marcos de que ele é necessário. */
    marcoIds?: string[];
  }) => Promise<ActionResp>;
  update: (data: {
    id: string;
    name: string;
    description?: string | null;
    startDate?: string | null;
    dueDate: string;
    memberIds?: string[];
    /** Ausente não mexe na categoria; `null` limpa. */
    categoria?: CheckpointCategoria | null;
    /** Lista final de tags. Ausente não mexe; `[]` tira todas. */
    tagIds?: string[];
    /** Só em marco: lista final de necessários. Ausente não mexe. */
    requisitoIds?: string[];
    /** Só fora de marco: lista final dos marcos de que é necessário. Ausente não mexe. */
    marcoIds?: string[];
  }) => Promise<ActionResp>;
  /**
   * Só o nome — a edição inline da lista. Separada do `update`, que reescreve
   * o checkpoint inteiro (e zera o início que não receber).
   */
  rename: (data: { id: string; name: string }) => Promise<ActionResp>;
  remove: (id: string) => Promise<ActionResp>;
  toggle: (id: string) => Promise<ActionResp>;
  updateParent: (data: {
    id: string;
    /** Outros que vão junto (arrasto da seleção em massa). */
    juntos?: string[];
    parentId: string | null;
    siblings: { id: string; order: number }[];
  }) => Promise<ActionResp>;
  /**
   * Edição em massa. Campo ausente = não altera; `null` em startDate ou array
   * vazio em memberIds = limpa o valor. Uma chamada só, para não disparar N
   * updates em sequência.
   */
  bulkUpdate: (data: {
    ids: string[];
    memberIds?: string[];
    startDate?: string | null;
    dueDate?: string;
    isCompleted?: boolean;
    categoria?: CheckpointCategoria | null;
    tagIds?: string[];
  }) => Promise<ActionResp>;
  bulkRemove: (ids: string[]) => Promise<ActionResp>;
  /** Duplica os selecionados; `data.ids` traz os ids das cópias. */
  bulkDuplicate: (ids: string[]) => Promise<ActionResp>;
  /**
   * Move os selecionados para baixo de `parentId` (`null` = topo), com a
   * subárvore. `ids` vai na ordem exibida — é a ordem que fica no destino.
   */
  bulkMove: (data: { ids: string[]; parentId: string | null }) => Promise<ActionResp>;
  /** Soma os selecionados aos necessários do marco. */
  atrelarAoMarco: (data: { marcoId: string; ids: string[] }) => Promise<ActionResp>;
}

interface CheckpointSectionProps {
  checkpoints: CheckpointNode[];
  members: { id: string; name: string }[];
  isEditable?: boolean;
  actions: CheckpointActions;
  /** Texto do empty state (ex.: "Divida essa iniciativa em etapas!"). */
  emptyDescription?: string;
  /** Data de lançamento da entidade — marcada como linha no roadmap. */
  launchDate?: Date | string | null;
  /**
   * Ações renderizadas no header do card, à direita do toggle de visualização.
   * A página dona passa os próprios controles de layout (recolher comentários,
   * modo foco) para eles ficarem alinhados com o título em vez de flutuar
   * soltos acima do card.
   */
  headerActions?: React.ReactNode;
  /** Tags que o item (iniciativa/experimento) configurou para os checkpoints. */
  tags?: CheckpointTagLite[];
  /** Sem elas, as tags ficam só para leitura (não dá para criar nem configurar). */
  tagActions?: CheckpointTagActions;
  /**
   * Checkpoint para abrir já focado (vindo do calendário de datas-chave, via
   * `?checkpoint=<id>` na página do item): a lista nasce com os ancestrais dele
   * abertos, rola até a linha e a realça — o mesmo que o clique numa barra do
   * calendário do próprio item faz.
   */
  focoInicial?: string | null;
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

/** Âncora cronológica do checkpoint: data de início ou, na falta, a de fim. */
function effectiveStartMs(node: {
  startDate: Date | string | null;
  dueDate: Date | string;
}): number {
  return new Date(node.startDate ?? node.dueDate).getTime();
}

/** Colunas por onde a lista de checkpoints pode ser ordenada. */
export type CheckpointSortKey = "name" | "member" | "tags" | "start" | "due" | "manual";

/**
 * Ordena a ÁRVORE já achatada: cada grupo de irmãos é ordenado entre si e a
 * pré-ordem (pai imediatamente antes da própria subárvore) é reconstruída.
 *
 * Ordenar a lista plana direto misturaria os níveis — um subcheckpoint com
 * nome "A" subiria para cima do pai de outro, e a indentação passaria a
 * descrever uma hierarquia que a ordem das linhas contradiz.
 *
 * Roda sobre `flatItems` (o estado local), e não sobre a árvore do servidor,
 * para não descartar o que o drag-and-drop e as edições otimistas já mudaram.
 *
 * Exportada para o teste.
 */
export function sortFlatTree<
  T extends {
    id: string;
    parentId: string | null;
    name: string;
    order: number;
    members: { name: string }[];
    startDate: Date | string | null;
    dueDate: Date | string;
  },
>(
  items: T[],
  key: CheckpointSortKey,
  dir: "asc" | "desc",
  /**
   * Rótulo das tags do item para a ordenação por "tags". Vem de fora porque a
   * linha só guarda os ids — nome é da lista de tags do item.
   */
  tagLabel: (item: T) => string = () => ""
): T[] {
  const irmaos = new Map<string | null, T[]>();
  for (const item of items) {
    const grupo = irmaos.get(item.parentId);
    if (grupo) grupo.push(item);
    else irmaos.set(item.parentId, [item]);
  }

  const sinal = dir === "asc" ? 1 : -1;
  const comparar = (a: T, b: T) => {
    switch (key) {
      case "name":
        return sinal * a.name.localeCompare(b.name, "pt-BR");
      case "member":
        // Mesmo critério da tabela de iniciativas: compara pelo PRIMEIRO
        // responsável, e quem não tem nenhum conta como string vazia (vai
        // para o topo no crescente).
        return (
          sinal *
          (a.members[0]?.name ?? "").localeCompare(b.members[0]?.name ?? "", "pt-BR")
        );
      case "tags":
        // Mesmo critério de responsável: compara o texto das tags (em ordem
        // alfabética, unidas), e sem tag conta como vazio — topo no crescente.
        return sinal * tagLabel(a).localeCompare(tagLabel(b), "pt-BR");
      case "manual":
        // A sequência que o arrasto grava. Aplica o sinal aqui em vez de cair
        // no desempate: o desempate não inverte, então o decrescente ficava
        // igual ao crescente (pego por teste).
        return sinal * (a.order - b.order);
      case "start":
        // Âncora cronológica, não o campo cru: checkpoint sem data de início
        // cai no próprio prazo. Tratar o nulo como 0 (o que a tabela de
        // iniciativas faz) jogaria essas linhas todas para o topo, na época
        // do Unix.
        return sinal * (effectiveStartMs(a) - effectiveStartMs(b));
      case "due":
        return sinal * (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }
  };

  // Desempate por `order`, a ordem manual que o servidor mantém: novo filho
  // entra como max+1 e o drag-and-drop reescreve a sequência. Sem desempate,
  // irmãos da mesma data trocavam de lugar a cada render; desempatando por
  // NOME, um sub-checkpoint recém-criado no mesmo dia dos irmãos saltaria
  // para o meio do grupo em vez de entrar no fim.
  const comparaComDesempate = (a: T, b: T) => comparar(a, b) || a.order - b.order;

  const emOrdem = (parentId: string | null): T[] =>
    [...(irmaos.get(parentId) ?? [])]
      .sort(comparaComDesempate)
      .flatMap((item) => [item, ...emOrdem(item.id)]);

  return emOrdem(null);
}

function flattenTree(
  nodes: CheckpointNode[],
  depth = 0,
  parentId: string | null = null
): FlatItem[] {
  // Ordena cada nível (checkpoints e subcheckpoints) de forma crescente por data.
  const sorted = [...nodes].sort((a, b) => effectiveStartMs(a) - effectiveStartMs(b));
  return sorted.flatMap((node) => [
    {
      id: node.id, name: node.name, description: node.description,
      categoria: node.categoria ?? null,
      tagIds: (node.tags ?? []).map((t) => t.id),
      requisitoIds: (node.requisitos ?? []).map((r) => r.id),
      startDate: node.startDate, dueDate: node.dueDate,
      isCompleted: node.isCompleted, completedAt: node.completedAt,
      order: node.order, members: node.members,
      depth, parentId,
    },
    ...flattenTree(node.children ?? [], depth + 1, node.id),
  ]);
}

/**
 * Regra da visão default: recolher todo nó que tenha o que abrir, em qualquer
 * profundidade — subcheckpoints ou, num marco, os checkpoints necessários (que
 * abrem com a mesma setinha). Folhas ficam fora do conjunto — estar em
 * `collapsedIds` sem ter o que abrir não faz nada, mas sujaria o estado e
 * confundiria quem for depurar.
 *
 * Exportada para o teste; não é usada fora deste módulo.
 */
export function collapsibleIds(nodes: CheckpointNode[]): string[] {
  return nodes.flatMap((node) => {
    const children = node.children ?? [];
    const temNecessarios = ehMarco(node) && (node.requisitos?.length ?? 0) > 0;
    return children.length > 0 || temNecessarios ? [node.id, ...collapsibleIds(children)] : [];
  });
}

/** Ids de toda a subárvore abaixo de `id` (sem incluir o próprio). */
function descendantIds(id: string, items: FlatItem[]): string[] {
  return items
    .filter((i) => i.parentId === id)
    .flatMap((child) => [child.id, ...descendantIds(child.id, items)]);
}

function getSubtreeHeight(id: string, items: FlatItem[]): number {
  const children = items.filter((i) => i.parentId === id);
  if (!children.length) return 0;
  return 1 + Math.max(...children.map((c) => getSubtreeHeight(c.id, items)));
}

function isAncestorOf(candidateAncestor: string, nodeId: string, items: FlatItem[]): boolean {
  let current: string | null = nodeId;
  while (current) {
    current = items.find((i) => i.id === current)?.parentId ?? null;
    if (current === candidateAncestor) return true;
  }
  return false;
}

function recomputeDepths(items: FlatItem[]): FlatItem[] {
  const parentMap = new Map(items.map((i) => [i.id, i.parentId]));
  function depth(id: string): number {
    const pid = parentMap.get(id);
    return pid ? 1 + depth(pid) : 0;
  }
  return items.map((item) => ({ ...item, depth: depth(item.id) }));
}

// ── Ids do arrastar-e-soltar ──────────────────────────────────────────────────
// Na lista simples o id do dnd-kit é o do checkpoint. Na segmentada o mesmo
// checkpoint aparece em mais de um grupo e o dnd-kit não aceita id repetido,
// então a linha vira `<grupo>::<checkpoint>` e o cabeçalho do grupo, que
// também recebe soltura, `header::<grupo>`.
const HEADER_DND_PREFIX = "header::";

type DndRef =
  | { kind: "header"; group: string }
  | { kind: "row"; group: string | null; itemId: string };

/** Exportada para o teste. */
export function parseDndId(id: string): DndRef {
  if (id.startsWith(HEADER_DND_PREFIX)) {
    return { kind: "header", group: id.slice(HEADER_DND_PREFIX.length) };
  }
  const i = id.indexOf("::");
  return i < 0
    ? { kind: "row", group: null, itemId: id }
    : { kind: "row", group: id.slice(0, i), itemId: id.slice(i + 2) };
}

/**
 * Tags próprias do checkpoint depois de passar do grupo `de` para o grupo `para`:
 * sai a tag de origem e entra a de destino; as outras ficam. Soltar em "Sem tag"
 * limpa todas — é o único jeito de o checkpoint aparecer nesse grupo.
 *
 * Exportada para o teste.
 */
export function tagsAposMover(proprias: string[], de: string, para: string): string[] {
  if (para === SEM_TAG_KEY) return [];
  const restantes = proprias.filter((id) => id !== de);
  return restantes.includes(para) ? restantes : [...restantes, para];
}

/**
 * Confere uma data editada inline antes de gravar: ano plausível e início ≤
 * fim, comparando com a OUTRA data já salva no checkpoint. As actions de
 * checkpoint não conferem a ordem, então a linha não pode deixar passar.
 *
 * Devolve a mensagem de erro, ou null se puder gravar. Exportada para o teste.
 */
export function conferirDataInline(
  item: { startDate: Date | string | null; dueDate: Date | string },
  campo: "startDate" | "dueDate",
  valor: string | null
): string | null {
  if (valor && !isDataPlausivel(valor)) return MENSAGEM_DATA_INVALIDA;
  const inicio = campo === "startDate" ? valor : item.startDate ? toDateInput(item.startDate) : null;
  const fim = campo === "dueDate" ? valor : toDateInput(item.dueDate);
  // `YYYY-MM-DD` compara certo como texto.
  if (inicio && fim && fim < inicio) return MENSAGEM_ORDEM_DATAS;
  return null;
}

/**
 * Meia-noite UTC do dia de `value`, em ms. Serve para comparar prazos
 * (date-only) sem que o fuso local empurre o dia para trás ou para frente.
 * Exportada para o teste.
 */
export function utcDayStart(value: Date | string): number {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
}

// ── Drop line ─────────────────────────────────────────────────────────────────

function DropLine({ indent }: { indent: number }) {
  return (
    <div className="relative h-1" style={{ paddingLeft: indent }}>
      <div className="absolute inset-0 flex items-center">
        <div className="w-2 h-2 rounded-full bg-forest border-2 border-paper shrink-0" />
        <div className="flex-1 h-0.5 bg-forest" />
      </div>
    </div>
  );
}

// ── Cabeçalho de grupo (lista segmentada) ─────────────────────────────────────

/**
 * Faixa do grupo, e também alvo de soltura: largar um checkpoint aqui o move
 * para o topo do grupo (troca a tag). Acende enquanto algo arrastado está por
 * cima, para a pessoa ver onde vai cair. Com `onAdd`, ganha o "+" à direita
 * que cria um checkpoint já dentro do grupo.
 */
function GrupoHeader({
  groupKey, label, count, first, dropEnabled, highlighted, onAdd,
}: {
  groupKey: string;
  label: string;
  count: number;
  first: boolean;
  dropEnabled: boolean;
  highlighted: boolean;
  onAdd?: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `${HEADER_DND_PREFIX}${groupKey}`,
    disabled: !dropEnabled,
  });
  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-2 px-3 py-2"
      style={{
        background: highlighted ? "var(--accent-subtle)" : "var(--bg-app)",
        borderTop: first ? "none" : "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
        boxShadow: highlighted ? "inset 0 0 0 2px var(--brand-primary)" : undefined,
      }}
    >
      <span
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--text-secondary)", letterSpacing: "0.05em" }}
      >
        {label}
      </span>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {count}
      </span>
      {onAdd && (
        <IconButton
          boxSize={24}
          onClick={onAdd}
          title={`Novo checkpoint em ${label}`}
          aria-label={`Novo checkpoint em ${label}`}
          className="ml-auto"
        >
          <Plus size={13} />
        </IconButton>
      )}
    </div>
  );
}

// ── Add / Edit form ───────────────────────────────────────────────────────────

function CheckpointForm({
  label,
  initial,
  members,
  tags,
  onCreateTag,
  onSave,
  onCancel,
  submitLabel,
  requisitoOpcoes = [],
  marcoOpcoes = [],
  marcosDoItem = [],
}: {
  label: string;
  initial?: {
    name: string;
    description: string;
    startDate: string;
    dueDate: string;
    memberIds: string[];
    categoria?: string | null;
    tagIds?: string[];
    requisitoIds?: string[];
    /** Marcos de que este checkpoint já é necessário. */
    marcoIds?: string[];
  };
  members: { id: string; name: string }[];
  /** Tags configuradas no item. */
  tags: CheckpointTagLite[];
  /** Cria uma tag no item sem sair do form. Devolve a tag ou a mensagem de erro. */
  onCreateTag?: (name: string) => Promise<{ id: string } | string>;
  onSave: (data: {
    name: string;
    description: string;
    startDate: string;
    dueDate: string;
    memberIds: string[];
    categoria: CheckpointCategoria | null;
    tagIds: string[];
    requisitoIds: string[];
    /** `undefined` quando o campo "Marco" não se aplica (não mexe nas ligações). */
    marcoIds: string[] | undefined;
  }) => Promise<string | null>;
  onCancel: () => void;
  /** Rótulo do botão de envio. Sem ele: "Salvar" quando há initial. */
  submitLabel?: string;
  /** Checkpoints que podem ser necessários deste marco (qualquer um que não seja marco). */
  requisitoOpcoes?: { id: string; name: string; isCompleted: boolean; pai?: string | null }[];
  /**
   * Marcos que este checkpoint pode destravar. Vazio esconde o campo — é o caso
   * de marco (não depende de outro marco) e de item sem marco.
   */
  marcoOpcoes?: { id: string; name: string; isCompleted: boolean }[];
  /** Nomes dos marcos que dependem DESTE checkpoint — para o aviso de virar marco. */
  marcosDoItem?: string[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(initial?.memberIds ?? []);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoria, setCategoria] = useState<CheckpointCategoria | null>(
    CHECKPOINT_CATEGORIAS.find((c) => c === initial?.categoria) ?? null
  );
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [requisitoIds, setRequisitoIds] = useState<string[]>(initial?.requisitoIds ?? []);
  const [marcoIds, setMarcoIds] = useState<string[]>(initial?.marcoIds ?? []);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Aviso de ligações de marco que o save vai desfazer; null = nada a avisar.
  const [aviso, setAviso] = useState<string | null>(null);

  const eraMarco = initial?.categoria === "MARCO";
  const ehMarcoAgora = categoria === "MARCO";
  // Um marco não depende de outro: virando marco, o campo some.
  const mostraMarcos = !ehMarcoAgora && marcoOpcoes.length > 0;

  /**
   * O que este save desfaz — mesma regra do servidor (actions de checkpoint):
   * deixar de ser marco tira os necessários; virar marco tira o checkpoint
   * dos marcos de que ele era necessário (marco não depende de marco).
   */
  function avisoDoSave(): string | null {
    const atrelados = initial?.requisitoIds?.length ?? 0;
    if (eraMarco && !ehMarcoAgora && atrelados > 0) {
      return `Este marco tem ${atrelados} ${atrelados === 1 ? "checkpoint atrelado" : "checkpoints atrelados"}. Ao trocar a categoria, ${atrelados === 1 ? "a ligação é desfeita" : "as ligações são desfeitas"}.`;
    }
    if (!eraMarco && ehMarcoAgora && marcosDoItem.length > 0) {
      return `Ao virar marco, este checkpoint deixa de ser necessário para ${marcosDoItem.length === 1 ? "o marco" : "os marcos"} ${listarNomes(marcosDoItem)} — um marco não depende de outro.`;
    }
    return null;
  }

  async function salvar() {
    setAviso(null);
    setErrorMsg(null);
    setLoading(true);
    // Filtra ids de tag que foram excluídas no gerenciador com o form aberto.
    const vivas = tagIds.filter((id) => tags.some((t) => t.id === id));
    // Idem para necessários: só os que ainda são elegíveis.
    const requisitosVivos = ehMarcoAgora
      ? requisitoIds.filter((id) => requisitoOpcoes.some((o) => o.id === id))
      : [];
    // Idem para os marcos escolhidos.
    const marcosVivos = mostraMarcos
      ? marcoIds.filter((id) => marcoOpcoes.some((o) => o.id === id))
      : undefined;
    // A chamada pode falhar antes da action responder (rede, deploy no meio):
    // sem o catch o botão ficava em "Salvando…" para sempre.
    let err: string | null;
    try {
      err = await onSave({
        name, description, startDate, dueDate, memberIds, categoria, tagIds: vivas,
        requisitoIds: requisitosVivos,
        marcoIds: marcosVivos,
      });
    } catch (error) {
      console.error("Falha ao salvar o checkpoint:", error);
      err = MENSAGEM_FALHA_DE_REDE;
    }
    setLoading(false);
    if (err) setErrorMsg(err);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !dueDate) return;
    const a = avisoDoSave();
    if (a) {
      setAviso(a);
      return;
    }
    await salvar();
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-3 bg-cream p-4 rounded-xl border border-line">
      <Input type="text" placeholder={label} autoFocus required
        value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          Início
          <Input type="date" className="font-normal normal-case"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          Fim
          <Input type="date" required className="font-normal normal-case"
            value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      {/* Responsáveis ocupam a linha inteira: o MemberPicker quebra em várias
          linhas conforme o tamanho do time, e apertá-lo numa terça parte da
          grade deixava os nomes empilhados um por linha. */}
      <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
        Responsáveis
        <div className="font-normal normal-case">
          <MemberPicker members={members} value={memberIds} onChange={setMemberIds} />
        </div>
      </div>
      {/* Categoria: pill que liga e desliga, igual aos responsáveis logo
          acima. Sem opção "Nenhuma" — não escolher já é não ter. */}
      <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
        Categoria
        <div className="font-normal normal-case">
          <CategoriaPicker value={categoria} onChange={setCategoria} />
        </div>
      </div>
      {/* Necessários: só existe em marco. São os checkpoints do nível
          principal que precisam estar entregues para o marco acontecer. */}
      {ehMarcoAgora && (
        <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          Checkpoints necessários
          <div className="font-normal normal-case">
            <MarcoRequisitosPicker opcoes={requisitoOpcoes} value={requisitoIds} onChange={setRequisitoIds} />
          </div>
        </div>
      )}
      {/* Marco: o outro lado de "Checkpoints necessários" — de quais marcos
          este checkpoint é necessário. Só quando o item tem marco; liga e
          desliga como as demais pills. */}
      {mostraMarcos && (
        <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          Marco
          <div className="font-normal normal-case">
            <MarcoRequisitosPicker
              opcoes={marcoOpcoes}
              value={marcoIds}
              onChange={setMarcoIds}
              vazio="Nenhum marco neste item ainda."
            />
          </div>
        </div>
      )}
      {/* Tags: as do PRÓPRIO item. Some quando não há o que escolher nem como
          criar (item só para leitura sem tags). */}
      {(tags.length > 0 || onCreateTag) && (
        <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          Tags
          <div className="font-normal normal-case">
            <CheckpointTagPicker tags={tags} value={tagIds} onChange={setTagIds} onCreate={onCreateTag} />
          </div>
        </div>
      )}
      {/* Sempre aberta: o campo é parte da edição, não um extra atrás de
          botão. Links colados viram hiperlink quando a descrição é exibida. */}
      <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-soft uppercase tracking-wide">
        Descrição
        <Textarea
          placeholder="Descrição (opcional) — links viram hiperlink"
          className="min-h-[72px] font-normal normal-case"
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {errorMsg && (
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--status-error-text)" }}>
          <AlertCircle size={14} />{errorMsg}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="secondary" size="sm" disabled={loading || !name || !dueDate}>
          {loading ? "Salvando..." : (submitLabel ?? (initial ? "Salvar" : "Adicionar"))}
        </Button>
      </div>
    </form>
    {/* Fora do <form>: o Button não fixa `type`, e dentro dele o "Salvar
        mesmo assim" seria um submit que reabriria este mesmo aviso. */}
    {aviso && (
      <ConfirmDialog
        title="Desfazer ligações com marco?"
        message={aviso}
        confirmLabel="Salvar mesmo assim"
        cancelLabel="Voltar"
        variant="primary"
        onConfirm={salvar}
        onCancel={() => setAviso(null)}
      />
    )}
    </>
  );
}

// ── Quick add (nome + Enter, encadeado) ────────────────────────────────────────

function QuickAddCheckpoint({
  onAdd,
  autoFocus = false,
  onClose,
  placeholder = "Adicionar checkpoint e apertar Enter…",
}: {
  onAdd: (name: string) => Promise<string | null>;
  autoFocus?: boolean;
  onClose?: () => void;
  placeholder?: string;
}) {
  const [name, setName] = useState("");
  const rotulo = useLabelTooltip();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Limpa na hora pra já digitar o próximo; restaura se der erro.
    setName("");
    setError(null);
    onAdd(trimmed).then((err) => {
      if (err) {
        setError(err);
        setName((cur) => cur || trimmed);
      }
    });
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-line bg-paper transition-colors focus-within:border-forest">
        <Plus size={16} className="text-forest shrink-0" />
        <input
          ref={inputRef}
          type="text"
          autoFocus={autoFocus}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && onClose) {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-none"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-ink-soft hover:text-ink transition-colors shrink-0"
            {...rotulo.alvo("Fechar (Esc)")}
            aria-label="Fechar"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
        {rotulo.tooltip}
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-xs px-1" style={{ color: "var(--status-error-text)" }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </div>
  );
}

// ── Data editável inline (colunas Início e Fim) ───────────────────────────────

/**
 * Data da linha que vira campo ao clicar. Enter ou sair do campo grava; Esc
 * desiste — o contrato do nome inline.
 *
 * Não grava no `change`: digitando o dia, o campo passa por datas
 * intermediárias válidas (01, depois 15) e cada uma viraria uma gravação.
 *
 * `opcional` (o início): apagar o campo e sair limpa a data. No fim, campo
 * vazio é desistência — o prazo é obrigatório.
 */
function DataInline({
  valor,
  opcional,
  editavel,
  rotulo,
  className,
  onSalvar,
}: {
  valor: Date | string | null;
  opcional: boolean;
  editavel: boolean;
  /** "início" ou "fim" — vai no aria-label e no tooltip. */
  rotulo: string;
  className: string;
  onSalvar: (iso: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const rotuloTip = useLabelTooltip();
  const original = toDateInput(valor);
  const texto = valor ? formatFullDate(valor) : "—";

  function salvar(novo: string) {
    setEditando(false);
    if (novo === original) return;
    if (!novo) {
      if (opcional) onSalvar(null);
      return;
    }
    onSalvar(novo);
  }

  if (editando) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={original}
        aria-label={`Data de ${rotulo}`}
        className="field font-mono"
        // Mais largo que a coluna (85px): o campo nativo precisa de espaço para
        // o ícone do calendário. Cresce para a esquerda, por cima do vizinho,
        // só enquanto está aberto.
        style={{ fontSize: 11, padding: "0 4px", width: 124, position: "relative", zIndex: 10 }}
        onBlur={(e) => salvar(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            salvar(e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            // Volta o valor antes de fechar: o blur que vem em seguida
            // gravaria o que foi digitado.
            e.currentTarget.value = original;
            setEditando(false);
          }
        }}
      />
    );
  }

  if (!editavel) return <span className={`text-[11px] font-mono whitespace-nowrap ${className}`}>{texto}</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Alterar data de ${rotulo}`}
        {...rotuloTip.alvo(valor ? `Alterar ${rotulo}` : `Definir ${rotulo}`)}
        className={`text-[11px] font-mono whitespace-nowrap hover:underline ${className}`}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        {texto}
      </button>
      {rotuloTip.tooltip}
    </>
  );
}

// ── Checkpoint row ────────────────────────────────────────────────────────────

function CheckpointRow({
  item, members, isEditable, actions, tags, tagById, onCreateTag,
  isCollapsed, onToggleCollapse, hasChildren,
  overPos, isAddingSub, onAddSub, onCancelAddSub,
  onToggle, allItems,
  isSelected, arrastadoJunto = false, onSelectToggle, selectionMode, hasDivider, isFocused,
  dndId, dragDisabled = false, contexto = false,
  semColunaDeInicio,
  semPillDeProgresso,
  comColunaDeTags,
  larguraColunaTags,
  onOrdemManual,
  onRename,
  onEditarData,
  progressoMarco = null,
  marcosDoItem = [],
  requisitoOpcoes = [],
  marcoOpcoes = [],
  paiDe,
  onAddNecessario,
  onIrPara,
  comColunaDeMarco = false,
  larguraColunaMarco = 0,
}: {
  /** O item tem marco com necessários: a linha reserva a coluna "Marco". */
  comColunaDeMarco?: boolean;
  /** Largura da coluna "Marco", a mesma em todas as linhas e no cabeçalho. */
  larguraColunaMarco?: number;
  /** Marco com necessários: o progresso (pill + lista). null nos demais. */
  progressoMarco?: ProgressoNaLista | null;
  /** Marcos de que ESTE checkpoint é necessário (o chip lilás). */
  marcosDoItem?: { id: string; name: string; progresso: ProgressoNaLista | null }[];
  /** Elegíveis a necessário, para o form de edição do marco. */
  requisitoOpcoes?: { id: string; name: string; isCompleted: boolean; pai?: string | null }[];
  /** Marcos do item, para o campo "Marco" do form de edição. */
  marcoOpcoes?: { id: string; name: string; isCompleted: boolean }[];
  /** Nome do pai de um checkpoint (a lista do marco o mostra esmaecido). */
  paiDe?: (id: string) => string | null;
  /** Cria um checkpoint novo já atrelado a este marco. */
  onAddNecessario?: (marcoId: string, name: string) => Promise<string | null>;
  /** Rola até outra linha (do chip ao marco, da lista ao necessário). */
  onIrPara?: (id: string) => void;
  item: FlatItem;
  members: { id: string; name: string }[];
  isEditable: boolean;
  actions: CheckpointActions;
  /** Tags do item, para o form de edição. */
  tags: CheckpointTagLite[];
  /** Resolve os `tagIds` da linha em nome e cor. */
  tagById: Map<string, CheckpointTagLite>;
  onCreateTag?: (name: string) => Promise<{ id: string } | string>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  hasChildren: boolean;
  overPos: "before" | "inside" | "after" | null;
  isAddingSub: boolean;
  onAddSub: () => void;
  onCancelAddSub: () => void;
  onToggle: (id: string) => void;
  allItems: FlatItem[];
  /** Card estreito: a coluna "Início" sai para o nome caber (ver a seção). */
  semColunaDeInicio: boolean;
  /** Card apertado: a coluna de tags cai para um chip só. */
  semPillDeProgresso: boolean;
  /** O item tem tags configuradas: a linha reserva a coluna delas. */
  comColunaDeTags: boolean;
  /** Largura da coluna de tags, a mesma em todas as linhas e no cabeçalho. */
  larguraColunaTags: number;
  /** Criar sub-checkpoint passa a lista para a ordem manual (ver o onAdd). */
  onOrdemManual: () => void;
  /** Renomeia pela edição inline do nome. */
  onRename: (id: string, name: string) => void;
  /** Data editada inline (início ou fim). `null` limpa o início. */
  onEditarData: (id: string, campo: "startDate" | "dueDate", valor: string | null) => void;
  isSelected: boolean;
  /** Vai junto no arrasto de outra linha selecionada: esmaece como ela. */
  arrastadoJunto?: boolean;
  /** `withSubtree` vem do Shift+clique: aplica a mesma ação à subárvore. */
  onSelectToggle: (withSubtree: boolean) => void;
  /** Fora do modo de seleção o checkbox de seleção não é renderizado. */
  selectionMode: boolean;
  /**
   * Fecha o grupo com uma régua. Só a última linha de cada checkpoint de topo
   * recebe — entre pai e subcheckpoint não há divisória, para a hierarquia ler
   * como um bloco.
   */
  hasDivider: boolean;
  /**
   * Linha apontada pelo calendário: abre os detalhes, rola até ficar visível
   * e ganha um realce temporário. Sem isso, o clique numa barra jogava a
   * pessoa numa lista sem dizer qual dos checkpoints era.
   */
  isFocused: boolean;
  /**
   * Id no dnd-kit. Na lista segmentada o mesmo checkpoint aparece em mais de
   * um grupo, e o dnd-kit não aceita id repetido — cada ocorrência ganha o seu.
   */
  dndId?: string;
  /** Sem arrastar (só leitura). */
  dragDisabled?: boolean;
  /** Linha só de contexto (ancestral de quem casou): esmaecida. */
  contexto?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  // Edição inline só do nome (clique no nome). O lápis abre o form completo.
  const [editandoNome, setEditandoNome] = useState(false);
  function salvarNome(valor: string) {
    setEditandoNome(false);
    const limpo = valor.trim();
    if (!limpo || limpo === item.name) return;
    onRename(item.id, limpo);
  }
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Linha fechada = uma linha só. Datas completas, nomes dos responsáveis e
  // descrição ficam atrás deste disclosure (clique no nome), senão cada
  // checkpoint gastava 3 linhas de altura e o roadmap sumia da dobra.
  const [showDetails, setShowDetails] = useState(false);
  // Apontada pelo calendário, a linha abre os detalhes sem precisar gravar
  // estado: derivar evita o setState-dentro-de-efeito (e o clique manual
  // continua mandando depois que o realce passa).
  const detalhesAbertos = showDetails || isFocused;
  // Os necessários do marco abrem com a MESMA setinha dos subcheckpoints (o
  // estado de recolhido é um só, o da seção). Só vale se o marco ainda tem
  // necessários e a linha não é contexto de grupo (sem setinha, não abre).
  const necessariosAbertos = !!progressoMarco && hasChildren && !isCollapsed;
  const temDescricao = !!item.description?.trim();
  const rowTags = item.tagIds.flatMap((id) => {
    const t = tagById.get(id);
    return t ? [t] : [];
  });

  // Marco abre a lista dos necessários com clique em qualquer ponto da linha,
  // não só no contador. Fica de fora o que já tem dono: controles (checkbox,
  // nome, datas, chips, ações), a própria lista aberta, cliques vindos de
  // portal (menus e popovers borbulham pela árvore do React) e seleção de texto.
  function aoClicarNaLinha(e: React.MouseEvent<HTMLDivElement>) {
    if (!progressoMarco) return;
    const alvo = e.target as HTMLElement;
    if (!e.currentTarget.contains(alvo)) return;
    if (alvo.closest(
      "button, a, input, select, textarea, label, [role='button'], [role='checkbox'], [data-sem-clique-da-linha]"
    )) return;
    if (window.getSelection()?.toString()) return;
    onToggleCollapse();
  }

  const rowRef = useRef<HTMLDivElement>(null);
  // Tooltips da linha (nome inteiro, descrição, contagem, em progresso) —
  // no lugar do `title` nativo, que abre fora do tema do produto.
  const rotulo = useLabelTooltip();
  useEffect(() => {
    if (!isFocused) return;
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [isFocused]);

  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({
    id: dndId ?? item.id,
    disabled: dragDisabled,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: dndId ?? item.id, disabled: dragDisabled });
  const setRef = useCallback(
    (el: HTMLDivElement | null) => { setDragRef(el); setDropRef(el); rowRef.current = el; },
    [setDragRef, setDropRef]
  );

  // Prazo é date-only gravado em UTC; comparar com `new Date()` local marcava
  // como atrasado o checkpoint que vence AMANHÃ, a partir das 21h de Brasília
  // (meia-noite UTC do dia seguinte). Comparação dia-a-dia, em UTC.
  const isOverdue = !item.isCompleted && utcDayStart(item.dueDate) < utcDayStart(new Date());
  const indent = item.depth * 28;
  // Filhos diretos, calculados uma vez: alimentam o contador, a tag "Em progresso"
  // e a mensagem de exclusão em cascata.
  const directChildren = allItems.filter((i) => i.parentId === item.id);
  const doneChildren = directChildren.filter((i) => i.isCompleted).length;
  const hasKids = directChildren.length > 0;
  // Checkpoint pai com algum subcheckpoint concluído (e ele próprio ainda aberto)
  // ganha a tag "Em progresso", na cor do status EM_ANDAMENTO (família peach).
  // No marco, vale o mesmo para os necessários: algum já entregue e o marco
  // ainda aberto também é "Em progresso".
  const inProgressFromChildren =
    !item.isCompleted && (doneChildren > 0 || (progressoMarco?.entregues ?? 0) > 0);

  async function confirmDelete() {
    setDeleting(true);
    const res = await actions.remove(item.id);
    setDeleting(false);
    if (res.success) {
      setConfirmingDelete(false);
      toast("Checkpoint excluído.");
    } else {
      toast(res.error || "Erro ao excluir o checkpoint.", "error");
    }
  }

  if (isEditing) {
    return (
      <div style={{ paddingLeft: indent + 12 }} className="my-1">
        <CheckpointForm
          label="Nome do checkpoint..."
          members={members}
          tags={tags}
          onCreateTag={onCreateTag}
          initial={{
            name: item.name,
            description: item.description || "",
            startDate: toDateInput(item.startDate),
            dueDate: toDateInput(item.dueDate),
            memberIds: item.members.map((m) => m.id),
            categoria: item.categoria,
            tagIds: item.tagIds,
            requisitoIds: item.requisitoIds,
            marcoIds: marcosDoItem.map((m) => m.id),
          }}
          requisitoOpcoes={requisitoOpcoes.filter((o) => o.id !== item.id)}
          marcoOpcoes={marcoOpcoes.filter((o) => o.id !== item.id)}
          marcosDoItem={marcosDoItem.map((m) => m.name)}
          onSave={async (data) => {
            const res = await actions.update({
              id: item.id, name: data.name,
              description: data.description || undefined,
              startDate: data.startDate || null,
              dueDate: data.dueDate,
              memberIds: data.memberIds,
              categoria: data.categoria,
              tagIds: data.tagIds,
              // Só marco tem necessários; nos demais o servidor limpa sozinho.
              ...(data.categoria === "MARCO" && { requisitoIds: data.requisitoIds }),
              ...(data.marcoIds !== undefined && { marcoIds: data.marcoIds }),
            });
            if (res.success) { setIsEditing(false); return null; }
            return res.error;
          }}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <>
      {overPos === "before" && <DropLine indent={indent} />}

      <div
        ref={setRef}
        onClick={aoClicarNaLinha}
        className={`group flex items-start gap-2 px-3 py-1.5 transition-all duration-150 ${
          isDragging || arrastadoJunto ? "opacity-30" : ""
        } ${progressoMarco ? "cursor-pointer" : ""} ${
          overPos === "inside"
            ? "ring-2 ring-forest bg-forest-soft/20"
            : // Mesmo hover das linhas da tabela de iniciativas.
              "hover:bg-forest-soft/30"
        }`}
        style={{
          paddingLeft: `${indent + 12}px`,
          // Divisória como na tabela, mas só fechando grupo (ver hasDivider).
          // A altura de 36px (py-1.5) é mantida de propósito — a densidade foi
          // conquistada nas rodadas anteriores e o padding px-4 py-3 da tabela
          // levaria a linha a ~46px.
          borderBottom: hasDivider ? "1px solid var(--border-subtle)" : "1px solid transparent",
          // Fundo do selecionado vence o hover:bg-cream (style > classe).
          ...(isSelected ? { background: "var(--accent-subtle)" } : {}),
          // Realce de quem veio do calendário — some sozinho quando o
          // CheckpointSection limpa o foco.
          ...(isFocused
            ? { background: "var(--butter-soft)", boxShadow: "inset 0 0 0 2px var(--butter)" }
            : {}),
          // Contexto da segmentação por tag: está ali para situar quem casou,
          // não por ter a tag — lê como pano de fundo.
          ...(contexto ? { opacity: 0.5 } : {}),
        }}
      >
        {isEditable && (
          <>
            {/* Só no modo de seleção: fora dele, ficava colado no checkbox de
                concluir e os dois viravam um par ambíguo. */}
            {selectionMode && (
              <span className="mt-0.5 shrink-0">
                <SelectCheckbox
                  checked={isSelected}
                  onToggle={(e) => onSelectToggle(e.shiftKey)}
                  title="Selecionar (Shift+clique inclui os subcheckpoints)"
                  ariaLabel={
                    isSelected
                      ? `Remover "${item.name}" da seleção`
                      : `Selecionar "${item.name}"`
                  }
                />
              </span>
            )}
            {dragDisabled ? (
              <span className="shrink-0" style={{ width: 14 }} aria-hidden="true" />
            ) : (
            <button
              {...listeners}
              {...attributes}
              className="mt-0.5 text-ink-soft opacity-0 group-hover:opacity-40 group-focus-within:opacity-40 hover:!opacity-70 focus-visible:!opacity-100 cursor-grab active:cursor-grabbing shrink-0 touch-none"
              tabIndex={-1}
              aria-label="Reordenar checkpoint"
            >
              <GripVertical size={14} />
            </button>
            )}
          </>
        )}

        <button
          onClick={onToggleCollapse}
          className={`mt-0.5 shrink-0 transition-colors ${
            hasChildren ? "text-ink-soft hover:text-ink" : "text-transparent pointer-events-none"
          }`}
          tabIndex={hasChildren ? 0 : -1}
          aria-hidden={!hasChildren}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          aria-label={
            hasChildren
              ? progressoMarco
                ? isCollapsed ? "Expandir marco" : "Recolher marco"
                : isCollapsed ? "Expandir sub-checkpoints" : "Recolher sub-checkpoints"
              : undefined
          }
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        <button
          onClick={() => isEditable && onToggle(item.id)}
          disabled={!isEditable}
          role="checkbox"
          aria-checked={item.isCompleted}
          aria-label={item.isCompleted ? `Marcar "${item.name}" como não concluído` : `Marcar "${item.name}" como concluído`}
          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
            item.isCompleted ? "bg-forest border-forest text-cream" : "bg-paper border-line hover:border-forest"
          }`}
        >
          {item.isCompleted && <ListChecks size={10} strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Sem justify-between: é o grupo do nome que cresce e empurra as
              colunas para a direita. Com justify-between, nome curto fazia a
              coluna de contagem flutuar no meio da linha. */}
          <div className="flex items-center gap-x-2 min-w-0">
            <div className="flex flex-1 items-center gap-2 min-w-0">
              {/* Ícone da categoria antes do nome (e depois da caixa de
                  concluir): diz do que é o checkpoint sem gastar uma linha,
                  e o avião marca o que é trabalho de comunicar. */}
              <CategoriaIcon categoria={item.categoria} />
              {editandoNome ? (
                // Enter grava, Esc desiste, sair do campo grava o que ficou
                // escrito — o mesmo contrato da edição inline da Weekly.
                <input
                  type="text"
                  autoFocus
                  defaultValue={item.name}
                  maxLength={200}
                  aria-label="Nome do checkpoint"
                  className="field text-sm font-medium"
                  style={{ padding: "0 4px", minWidth: 0, flex: 1 }}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => salvarNome(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      salvarNome(e.currentTarget.value);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      // Devolve o texto original ANTES de fechar: o blur que
                      // vem em seguida gravaria o que foi digitado.
                      e.currentTarget.value = item.name;
                      setEditandoNome(false);
                    }
                  }}
                />
              ) : (
                // Clique no nome edita o nome ali mesmo (quem pode editar).
                // Só leitura, o clique continua abrindo a descrição.
                <button
                  type="button"
                  onClick={() =>
                    isEditable ? setEditandoNome(true) : setShowDetails((v) => !v)
                  }
                  aria-expanded={isEditable ? undefined : detalhesAbertos}
                  // Nome longo é truncado (o `truncate` abaixo, com o min-w-0
                  // do pai): o texto inteiro vem no tooltip.
                  {...rotulo.alvo(isEditable ? `${item.name} — clique para renomear` : item.name)}
                  className={`text-sm font-medium transition-all duration-300 min-w-0 truncate text-left ${
                    item.isCompleted ? "line-through text-ink-soft opacity-60" : "text-ink"
                  }`}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: isEditable ? "text" : "pointer",
                  }}
                >
                  {item.name}
                </button>
              )}
              {item.description && (
                // Marca que a linha guarda uma descrição, e a abre/fecha. Desde
                // que o clique no nome passou a renomear, é o gatilho da
                // descrição para quem edita.
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={detalhesAbertos}
                  aria-label={detalhesAbertos ? "Esconder descrição" : "Mostrar descrição"}
                  {...rotulo.alvo(detalhesAbertos ? "Esconder descrição" : "Mostrar descrição")}
                  className="shrink-0 text-ink-soft hover:text-ink transition-colors"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
                >
                  <AlignLeft size={12} />
                </button>
              )}
              {/* Só o ícone, com "Em progresso" no tooltip. Com o texto, a
                  pill custava ~110px e saía em card apertado; compacta, cabe
                  em qualquer largura e fica sempre. */}
              {inProgressFromChildren && (
                <span
                  role="img"
                  aria-label="Em progresso"
                  className="shrink-0 inline-flex items-center justify-center"
                  style={{
                    width: 20,
                    height: 18,
                    borderRadius: "var(--radius-full)",
                    background: familyBg("peach"),
                    color: familyStrong("peach"),
                    border: `1px solid ${familyBorder("peach")}`,
                    cursor: "default",
                  }}
                  {...rotulo.alvo("Em progresso")}
                >
                  <Flame size={11} strokeWidth={2} />
                </span>
              )}
              {rotulo.tooltip}
            </div>

            {/* Contagem dos subcheckpoints em coluna própria, à esquerda de
                responsável: colada no nome ela caía num x diferente em cada
                linha (o nome tem comprimento variável). Linha sem filho deixa
                a coluna vazia. */}
            <span
              className="flex items-center justify-end shrink-0"
              style={{ width: COUNT_COL_WIDTH }}
            >
              {progressoMarco ? (
                // Marco com necessários: o progresso deles no mesmo formato
                // da contagem de filhos ("3/5"). Ganha da contagem de filhos
                // quando os dois existem — num marco, o que importa é o que
                // falta para ele acontecer; o chevron segue abrindo os filhos.
                <MarcoProgressoContagem
                  progresso={progressoMarco}
                  aberto={necessariosAbertos}
                  onToggle={onToggleCollapse}
                />
              ) : hasKids && (
                // Progresso dos subcheckpoints — mesmo desenho do contador do
                // dashboard. Devolve, com a árvore recolhida, a informação que o
                // recolhimento esconde; e serve de alvo de clique junto do chevron.
                <button
                  onClick={onToggleCollapse}
                  className="shrink-0 text-xs"
                  style={{
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                  {...rotulo.alvo(isCollapsed ? "Expandir sub-checkpoints" : "Recolher sub-checkpoints")}
                >
                  {doneChildren}/{directChildren.length}
                </button>
              )}
            </span>
            {/* Lado direito em duas colunas de largura fixa — responsável e
                depois prazo. Fixas de propósito: com largura automática, a
                data de um item caía onde ficava o responsável do vizinho e a
                lista virava um zigue-zague. Item sem responsável (ou sem prazo
                a mostrar) deixa a coluna em branco, sem puxar a outra. */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Tags em coluna própria (e não coladas no nome), para caírem
                  no mesmo x em todas as linhas. Só existe quando o item tem
                  tags configuradas — senão seria uma coluna sempre vazia. */}
              {comColunaDeTags && (
                <span
                  className="flex items-center justify-start overflow-hidden"
                  style={{ width: larguraColunaTags }}
                >
                  <CheckpointTagChips tags={rowTags} max={semPillDeProgresso ? 1 : 2} />
                </span>
              )}
              <span
                className="flex items-center justify-start overflow-hidden"
                style={{ width: MEMBER_COL_WIDTH }}
              >
                <MemberChips members={item.members} max={2} />
              </span>
              {/* Início e fim em colunas próprias — antes só o prazo aparecia
                  na linha e o início ficava escondido no detalhe.
                  Sem o ícone de calendário que acompanhava a data solta: com
                  duas colunas rotuladas no cabeçalho, ele só repetia em cada
                  linha o que o rótulo já diz.
                  Início é opcional: sem ele fica um traço, para a coluna não
                  virar buraco nem se confundir com a do fim. */}
              {!semColunaDeInicio && (
                <span
                  className="flex items-center justify-start"
                  style={{ width: DATE_COL_WIDTH }}
                >
                  <DataInline
                    valor={item.startDate}
                    opcional
                    editavel={isEditable}
                    rotulo="início"
                    className={item.isCompleted ? "text-ink-soft opacity-60" : "text-ink-soft"}
                    onSalvar={(iso) => onEditarData(item.id, "startDate", iso)}
                  />
                </span>
              )}
              {/* Quem sinaliza o atraso é a cor, e ela vive no FIM: vencido e
                  aberto em --status-late-text (a cor de atraso e risco
                  do produto); concluído e no prazo, discretos. */}
              <span
                className="flex items-center justify-start"
                style={{ width: DATE_COL_WIDTH }}
              >
                <DataInline
                  valor={item.dueDate}
                  opcional={false}
                  editavel={isEditable}
                  rotulo="fim"
                  className={
                    isOverdue
                      ? "font-bold text-[var(--status-late-text)]"
                      : item.isCompleted
                        ? "text-ink-soft opacity-60"
                        : "text-ink-soft"
                  }
                  onSalvar={(iso) => onEditarData(item.id, "dueDate", iso)}
                />
              </span>
              {/* Coluna "Marco", depois do fim: no checkpoint necessário, o
                  marco que ele destrava. Em coluna própria para cair no mesmo
                  x em todas as linhas e não disputar espaço com o nome. Só
                  existe quando o item tem algum marco com necessários. (O
                  progresso do PRÓPRIO marco fica na coluna de contagem.) */}
              {comColunaDeMarco && (
                <span
                  className="flex items-center justify-start overflow-hidden"
                  style={{ width: larguraColunaMarco }}
                >
                  {marcosDoItem.length > 0 && (
                    <MarcoChip marcos={marcosDoItem} onAbrir={onIrPara} />
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Só a descrição. O período (início → fim) morava aqui porque a
              linha fechada mostrava apenas o prazo; agora as duas datas têm
              coluna própria, e repeti-las aqui só empurrava a descrição para
              baixo — o mesmo motivo pelo qual prazo e responsáveis nunca
              foram repetidos neste bloco. */}
          {detalhesAbertos && temDescricao && (
            <div className="mt-1">
              <TextoComLinks texto={item.description ?? ""} className="text-xs text-ink-soft" />
            </div>
          )}
          {necessariosAbertos && progressoMarco && (
            <div data-sem-clique-da-linha className="cursor-auto">
              <MarcoRequisitosLista
                progresso={progressoMarco}
                onAbrir={(id) => onIrPara?.(id)}
                // Concluir dentro do marco é concluir o checkpoint: a mesma
                // ação (e a mesma confirmação) da caixa da linha.
                onToggle={isEditable ? onToggle : undefined}
                paiDe={paiDe}
                onAddNecessario={isEditable && onAddNecessario ? (name) => onAddNecessario(item.id, name) : undefined}
                CampoDeAdicionar={QuickAddCheckpoint}
              />
            </div>
          )}
        </div>

        {isEditable && (
          // Coluna de ações com largura fixa (a mesma da tabela de iniciativas)
          // e alinhada à direita: aparece no hover, mas sempre no mesmo x.
          <div
            className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-all shrink-0"
            style={{ width: ACTIONS_COL_WIDTH }}
          >
            {item.depth < 2 ? (
              <IconButton
                boxSize={24}
                onClick={() => { onAddSub(); if (isCollapsed) onToggleCollapse(); }}
                title="Adicionar sub-checkpoint"
                aria-label="Adicionar sub-checkpoint"
              >
                <Plus size={13} />
              </IconButton>
            ) : (
              // No nível máximo não há "adicionar sub", mas o espaço fica
              // reservado — senão editar/excluir escorregam para a esquerda e
              // desalinham em relação às outras linhas.
              <span className="shrink-0" style={{ width: 24 }} aria-hidden="true" />
            )}
            <IconButton boxSize={24} onClick={() => setIsEditing(true)} title="Editar" aria-label="Editar checkpoint">
              <Pencil size={13} />
            </IconButton>
            <IconButton boxSize={24} onClick={() => setConfirmingDelete(true)} title="Excluir" aria-label="Excluir checkpoint" className="icon-btn--danger">
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>

      {overPos === "after" && <DropLine indent={indent} />}

      {/* Add sub — quick add: Enter cria e mantém criando sub-checkpoints */}
      {isAddingSub && (
        <div style={{ paddingLeft: indent + 40 }} className="mt-1 mb-1">
          <QuickAddCheckpoint
            autoFocus
            onClose={onCancelAddSub}
            placeholder="Sub-checkpoint e apertar Enter…"
            onAdd={async (name) => {
              const res = await actions.create({
                parentId: item.id,
                name,
                // Sem data manual: usa o dia da criação como data de fim.
                dueDate: toDateInput(new Date()),
              });
              // O servidor grava o novo filho como último do grupo
              // (order = max+1), mas sob ordenação por DATA ele cai onde a
              // data manda — e nasceu com a data de hoje, então costuma
              // aparecer no meio (ou no topo) dos irmãos. Assumir a ordem
              // manual é o que faz "o novo entra no fim" ser verdade; o chip
              // no cabeçalho diz que a ordenação mudou e desfaz num clique.
              if (res.success) onOrdemManual();
              return res.success ? null : res.error;
            }}
          />
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Excluir checkpoint?"
          message={
            hasKids
              ? `"${item.name}" e todos os seus sub-checkpoints serão excluídos. Essa ação não pode ser desfeita.`
              : `"${item.name}" será excluído. Essa ação não pode ser desfeita.`
          }
          confirmLabel={deleting ? "Excluindo..." : "Excluir"}
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => !deleting && setConfirmingDelete(false)}
        />
      )}
    </>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

// Default estável: um `[]` literal no parâmetro seria um array novo a cada
// render, e o sync de tags (que compara a referência) entraria em loop.
const SEM_TAGS: CheckpointTagLite[] = [];

function buildFlat(nodes: CheckpointNode[]) {
  return flattenTree(nodes);
}

// Sem marcos: default estável para a prop da linha (um `[]` literal seria um
// array novo a cada render).
const SEM_MARCOS: { id: string; name: string; progresso: ProgressoNaLista | null }[] = [];

export function CheckpointSection({
  checkpoints: initialCheckpoints,
  members,
  isEditable = true,
  actions,
  emptyDescription = "Divida isso em etapas!",
  launchDate,
  headerActions,
  tags: initialTags = SEM_TAGS,
  tagActions,
  focoInicial = null,
}: CheckpointSectionProps) {
  // Tags do item em estado local: criar no form ou mexer no gerenciador
  // aparece na hora, sem esperar a revalidação. O servidor ainda manda — o
  // sync abaixo repõe a lista quando a prop muda.
  const [tagList, setTagList] = useState<CheckpointTagLite[]>(initialTags);
  const [prevTags, setPrevTags] = useState(initialTags);
  if (prevTags !== initialTags) {
    setPrevTags(initialTags);
    setTagList(initialTags);
  }
  const tagById = useMemo(() => new Map(tagList.map((t) => [t.id, t])), [tagList]);
  const [managingTags, setManagingTags] = useState(false);
  const canManageTags = isEditable && !!tagActions;

  const createTag = useMemo(() => {
    if (!canManageTags) return undefined;
    return async (name: string): Promise<{ id: string } | string> => {
      const res = await tagActions!.create({
        name,
        color: nextCheckpointTagColor(tagList.map((t) => t.color)),
      });
      if (!res.success) return res.error;
      setTagList((prev) => [...prev, res.data]);
      return res.data;
    };
  }, [canManageTags, tagActions, tagList]);

  // "semana" e "calendar" são o MESMO componente de calendário, com escopo
  // diferente: a semana é uma linha de 7 dias, o mês é a grade de 5-6.
  const [view, setView] = useState<"list" | "gantt" | "semana" | "calendar">("list");
  const [flatItems, setFlatItems] = useState<FlatItem[]>(() => buildFlat(initialCheckpoints));
  const [prevCheckpoints, setPrevCheckpoints] = useState(initialCheckpoints);
  // Visão default: subcheckpoints recolhidos, só os checkpoints de topo à vista.
  // O sync com o servidor mais abaixo NÃO mexe neste estado, então o que a pessoa
  // abriu na mão sobrevive à revalidação.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const recolhidos = new Set(collapsibleIds(initialCheckpoints));
    // Foco inicial: os ancestrais dele nascem abertos, senão a linha estaria
    // escondida dentro de um pai recolhido.
    if (focoInicial) {
      const porId = new Map(buildFlat(initialCheckpoints).map((i) => [i.id, i]));
      let pid = porId.get(focoInicial)?.parentId ?? null;
      while (pid) {
        recolhidos.delete(pid);
        pid = porId.get(pid)?.parentId ?? null;
      }
    }
    return recolhidos;
  });
  // Ordenação da lista, no mesmo padrão da tabela de /iniciativas: clique no
  // rótulo ordena, clique de novo inverte, e trocar de coluna recomeça no
  // crescente. O default "date" asc é exatamente a ordem que a lista já
  // tinha antes de existir cabeçalho clicável.
  const [sortKey, setSortKey] = useState<CheckpointSortKey>("start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  /**
   * Card estreito esconde a coluna "Início".
   *
   * Com as duas colunas de data, o nome ficava com ~90px no detalhe de
   * iniciativa com comentários abertos (duas colunas): truncava em "Tax…" e
   * a linha deixava de ser legível. O prazo é a data que a linha existe para
   * mostrar — é o "Fim" que fica. O início continua no formulário de edição.
   *
   * Mede o CONTÊINER, não a janela: o mesmo card é largo no detalhe sem
   * comentários e estreito com eles, na mesma largura de tela.
   */
  const cardRef = useRef<HTMLDivElement>(null);
  const [larguraCard, setLarguraCard] = useState<number | null>(null);
  // `null` = ainda não medido: na primeira renderização mostramos tudo, e o
  // observador corrige no mesmo frame.
  const semPillDeProgresso = larguraCard !== null && larguraCard < LARGURA_MINIMA_PARA_PILL;
  const larguraColunaTags = useMemo(
    () =>
      larguraDaColunaDeTags(
        flatItems.map((i) => i.tagIds.flatMap((id) => tagById.get(id) ?? [])),
        semPillDeProgresso ? 1 : 2
      ),
    [flatItems, tagById, semPillDeProgresso]
  );
  /**
   * Coluna de tags: aparece sempre que o item TEM tags ou a pessoa PODE criar
   * — escondê-la num item ainda sem tags fazia o campo parecer inexistente.
   *
   * No card apertado ela tem prioridade sobre "Início" (opcional, e que o
   * formulário ainda mostra): quem sai primeiro é o início; as tags só saem
   * quando nem sem ele o nome teria espaço (ver LARGURA_FIXA_DA_LINHA).
   */
  /**
   * Coluna "Marco", depois do fim: só quando algum marco do item tem
   * necessários — sem isso seria uma coluna sempre vazia. No card apertado
   * ela estreita (o nome do marco trunca) em vez de sair: é a única pista na
   * linha de que o checkpoint destrava um marco.
   */
  const comColunaDeMarco = flatItems.some((i) => ehMarco(i) && i.requisitoIds.length > 0);
  const larguraColunaMarco = semPillDeProgresso ? MARCO_COL_WIDTH_COMPACTA : MARCO_COL_WIDTH;
  // Entra no orçamento da linha como as outras colunas fixas.
  const larguraFixaDaLinha = LARGURA_FIXA_DA_LINHA + (comColunaDeMarco ? larguraColunaMarco + 8 : 0);
  const colunaTagsComGap = larguraColunaTags + 8;
  const comColunaDeTags =
    (tagList.length > 0 || canManageTags) &&
    !(
      larguraCard !== null &&
      larguraCard < larguraFixaDaLinha + NOME_MINIMO_COM_TAGS + colunaTagsComGap
    );
  const estreito =
    larguraCard !== null &&
    (comColunaDeTags
      ? larguraCard <
        larguraFixaDaLinha + NOME_MINIMO_COM_INICIO + colunaTagsComGap + DATE_COL_WIDTH + 8
      : larguraCard < LARGURA_MINIMA_PARA_INICIO + (larguraFixaDaLinha - LARGURA_FIXA_DA_LINHA));
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([entrada]) => {
      setLarguraCard(entrada.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [addingToId, setAddingToId] = useState<string | null>(null);
  // Na lista segmentada o checkpoint pode aparecer em vários grupos: o campo
  // de sub-checkpoint abre só no grupo onde a pessoa clicou.
  const [addingInGroup, setAddingInGroup] = useState<string | null>(null);
  // Grupo cujo "+" do cabeçalho está aberto: o checkpoint nasce na raiz com a
  // tag do grupo (em "Sem tag", sem nenhuma).
  const [addingRootInGroup, setAddingRootInGroup] = useState<string | null>(null);
  // Começa agrupada: só vale quando existe tag (`podeSegmentar`), então sem tag
  // a lista segue simples. A pessoa ainda pode desligar pelo botão.
  const [segmentarTags, setSegmentarTags] = useState(true);
  const [isAddingRoot, setIsAddingRoot] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<"before" | "inside" | "after">("after");

  // ── Edição em massa ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Modo de seleção em massa, desligado por padrão: com ele sempre ligado, cada
  // linha exibia dois checkboxes vizinhos (selecionar e concluir) e não havia
  // como saber qual era qual. A lógica de seleção não muda — só a visibilidade.
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const rotuloCabecalho = useLabelTooltip();
  // Ids das cópias que devem ficar selecionadas assim que a árvore do servidor
  // trouxer elas (ver `duplicateSelected`).
  const [selectAfterSync, setSelectAfterSync] = useState<string[] | null>(null);

  // ── Ponte com o calendário ──
  // Checkpoint apontado por um clique numa barra: a lista abre nele. O realce
  // é temporário; sem o timer a linha ficaria pintada para sempre.
  const [focusedId, setFocusedId] = useState<string | null>(focoInicial);
  useEffect(() => {
    if (!focusedId) return;
    const t = setTimeout(() => setFocusedId(null), 2500);
    return () => clearTimeout(t);
  }, [focusedId]);

  // Data escolhida no calendário (clique num dia) para o próximo checkpoint.
  const [newRootDate, setNewRootDate] = useState<string | null>(null);
  // O form fica embaixo das três visões. Vindo do calendário, ele pode nascer
  // fora da dobra — sem rolar até lá, o clique no dia parece não fazer nada.
  const addRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newRootDate) return;
    // rAF porque o form só existe depois deste render: rolando no mesmo tick,
    // o alvo ainda tem a altura do botão "+ com datas" e a conta do centro sai
    // errada — o form acabava embaixo da dobra mesmo tendo "rolado".
    const id = requestAnimationFrame(() => {
      addRootRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [newRootDate]);

  // Sincroniza com dados do servidor quando mudam (e não estamos arrastando)
  if (prevCheckpoints !== initialCheckpoints && !activeId) {
    setPrevCheckpoints(initialCheckpoints);
    const nextItems = buildFlat(initialCheckpoints);
    setFlatItems(nextItems);
    const alive = new Set(nextItems.map((i) => i.id));
    if (selectAfterSync && selectAfterSync.every((id) => alive.has(id))) {
      // Cópias recém-duplicadas chegaram: a seleção passa para elas.
      setSelectedIds(new Set(selectAfterSync));
      setSelectAfterSync(null);
    } else {
      // Poda a seleção: itens que sumiram (excluídos em massa ou por cascata do
      // pai) não podem continuar na lista de ids enviada ao servidor.
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const pruned = new Set([...prev].filter((id) => alive.has(id)));
        return pruned.size === prev.size ? prev : pruned;
      });
    }
  }
  // Leitura da lista mais recente de dentro de handlers async (duplicar), cuja
  // closure enxerga o `flatItems` do render em que foram criados.
  const flatItemsRef = useRef(flatItems);
  useEffect(() => {
    flatItemsRef.current = flatItems;
  }, [flatItems]);

  // ── Filtros do card ──
  // Valem para as três visões (lista, roadmap e mês): filtrar só no calendário
  // fazia a mesma pergunta ("o que é meu e ainda está aberto?") ter resposta
  // em uma aba só.
  const [hideCompleted, setHideCompleted] = useState(false);
  // Categorias marcadas no filtro; várias = qualquer uma delas (OU), como tags e pessoas.
  const [categoriaFilter, setCategoriaFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [memberFilter, setMemberFilter] = useState<Set<string>>(new Set());
  const filterActive = hideCompleted || categoriaFilter.size > 0 || memberFilter.size > 0 || tagFilter.size > 0;

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of flatItems) for (const m of item.members) map.set(m.id, m.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [flatItems]);

  // Quantos checkpoints usam cada tag: alimenta o gerenciador ("3 checkpoints")
  // e decide quais tags viram filtro — tag que ninguém usa não filtra nada.
  const tagUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of flatItems) for (const id of item.tagIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [flatItems]);
  const tagFilterOptions = tagList.filter((t) => tagUsage.has(t.id));

  // ── Marcos ──
  // Progresso de cada marco com necessários e o inverso (de quais marcos cada
  // checkpoint é necessário). Sobre a árvore INTEIRA: o filtro muda o que se
  // vê, não o que falta para o marco.
  const { progressoPorMarco, marcosPorItem, requisitoOpcoes, marcoOpcoes } = useMemo(() => {
    const porId = new Map(flatItems.map((i) => [i.id, i]));
    const progressoPorMarco = new Map<string, ProgressoNaLista>();
    const marcosPorItem = new Map<string, { id: string; name: string; progresso: ProgressoNaLista | null }[]>();
    for (const item of flatItems) {
      if (!ehMarco(item)) continue;
      const p = progressoDoMarco(item, porId);
      if (!p) continue;
      progressoPorMarco.set(item.id, p);
      for (const r of p.requisitos) {
        const lista = marcosPorItem.get(r.id) ?? [];
        lista.push({ id: item.id, name: item.name, progresso: p });
        marcosPorItem.set(r.id, lista);
      }
    }
    const requisitoOpcoes = flatItems.filter(podeSerRequisito).map((i) => ({
      id: i.id,
      name: i.name,
      isCompleted: i.isCompleted,
      pai: i.parentId ? (porId.get(i.parentId)?.name ?? null) : null,
    }));
    // Todo marco do item (com ou sem necessários ainda): é onde um checkpoint
    // pode se atrelar pelo campo "Marco" do formulário.
    const marcoOpcoes = flatItems
      .filter(ehMarco)
      .map((i) => ({ id: i.id, name: i.name, isCompleted: i.isCompleted }));
    return { progressoPorMarco, marcosPorItem, requisitoOpcoes, marcoOpcoes };
  }, [flatItems]);

  /**
   * Confirmação genérica dos avisos de marco (concluir com pendência, mover
   * ou trocar categoria desfazendo ligações). Uma só, porque todos são o
   * mesmo diálogo: o que acontece, e "seguir mesmo assim".
   */
  const [confirmacao, setConfirmacao] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  /**
   * Um item entra se ele casa com o filtro OU se algum descendente casa: o pai
   * fica como contexto, senão o subcheckpoint apareceria órfão, sem a linha que
   * explica de quem ele é.
   */
  // Coluna de tags escondida (card estreito ou item sem tags) não pode seguir
  // ordenando sem rótulo à vista: volta para o default.
  const sortKeyEfetiva: CheckpointSortKey =
    sortKey === "tags" && !comColunaDeTags ? "start" : sortKey;
  const sortedItems = useMemo(
    () =>
      sortFlatTree(flatItems, sortKeyEfetiva, sortDir, (item) =>
        item.tagIds
          .flatMap((id) => tagById.get(id)?.name ?? [])
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .join(", ")
      ),
    [flatItems, sortKeyEfetiva, sortDir, tagById]
  );

  const casaNoFiltro = useCallback(
    (i: FlatItem) =>
      (!hideCompleted || !i.isCompleted) &&
      (categoriaFilter.size === 0 || (!!i.categoria && categoriaFilter.has(i.categoria))) &&
      (memberFilter.size === 0 || i.members.some((m) => memberFilter.has(m.id))) &&
      // Várias tags marcadas = qualquer uma delas (OU), como o filtro de pessoa.
      (tagFilter.size === 0 || i.tagIds.some((id) => tagFilter.has(id))),
    [hideCompleted, categoriaFilter, memberFilter, tagFilter]
  );

  const filteredItems = useMemo(() => {
    if (!filterActive) return sortedItems;
    const byId = new Map(sortedItems.map((i) => [i.id, i]));
    const manter = new Set<string>();
    for (const item of sortedItems) {
      if (!casaNoFiltro(item)) continue;
      manter.add(item.id);
      let pid = item.parentId;
      while (pid && !manter.has(pid)) {
        manter.add(pid);
        pid = byId.get(pid)?.parentId ?? null;
      }
    }
    return sortedItems.filter((i) => manter.has(i.id));
  }, [sortedItems, casaNoFiltro, filterActive]);

  /**
   * Itens das visões de mês e semana. Lá a comunicação aparece solta, sem o
   * pai (ver soltoNoCalendario), então um pai que só está na tela como
   * CONTEXTO de comunicações filtradas não contextualiza nada — seria uma
   * barra a mais que o filtro não pediu. Continua se algum descendente não
   * solto casou, ou se ele mesmo casou.
   */
  const calendarItems = useMemo(() => {
    if (!filterActive) return filteredItems;
    const byId = new Map(filteredItems.map((i) => [i.id, i]));
    const manter = new Set<string>();
    for (const item of filteredItems) {
      if (!casaNoFiltro(item)) continue;
      manter.add(item.id);
      if (soltoNoCalendario(item)) continue;
      let pid = item.parentId;
      while (pid && !manter.has(pid)) {
        manter.add(pid);
        pid = byId.get(pid)?.parentId ?? null;
      }
    }
    return filteredItems.filter((i) => manter.has(i.id));
  }, [filteredItems, casaNoFiltro, filterActive]);

  // O calendário mostra as tags no tooltip; a linha só guarda os ids, então
  // resolve nome e cor aqui (renomear/recolorir reflete na hora). Vale a tag
  // EFETIVA — a própria ou, sem nenhuma, a herdada do pai —, a mesma regra da
  // lista agrupada. Resolve pela árvore inteira: com filtro ligado o pai pode
  // estar fora do calendário e a herança continua valendo.
  const calendarItemsComTags = useMemo(() => {
    const efetivas = resolverTagsEfetivas(flatItems, new Set(tagById.keys()));
    return calendarItems.map((i) => {
      const { ids, herdadas } = efetivas(i);
      return {
        ...i,
        tags: ids.flatMap((id) => tagById.get(id) ?? []),
        tagsHerdadas: herdadas,
      };
    });
  }, [calendarItems, flatItems, tagById]);

  const escondidos = flatItems.length - filteredItems.length;

  // A árvore INTEIRA (sem filtro) para o tooltip do calendário dizer de que
  // checkpoint um marco ou comunicação solto faz parte, mesmo que o pai esteja
  // escondido pelo filtro.
  const arvoreDoTooltip = useMemo(
    () => new Map(flatItems.map((i) => [i.id, { name: i.name, parentId: i.parentId }])),
    [flatItems]
  );

  // Chevron só quando há filho VISÍVEL: com filtro ligado, um chevron que abre
  // o nada confunde.
  const visibleItems = useMemo(() => {
    return filteredItems.filter((item) => {
      let pid = item.parentId;
      while (pid) {
        if (collapsedIds.has(pid)) return false;
        pid = filteredItems.find((i) => i.id === pid)?.parentId ?? null;
      }
      return true;
    });
  }, [filteredItems, collapsedIds]);

  // Segmentação por tag na lista e no roadmap, e só quando o item tem tags.
  // Desligada, as duas visões são exatamente as de antes. Mês e semana não:
  // lá o eixo é o dia, não a linha.
  const podeSegmentar =
    (view === "list" || view === "gantt") && tagList.length > 0 && flatItems.length > 0;
  const segmentado = segmentarTags && podeSegmentar;
  const gruposPorTag = useMemo(() => {
    if (!segmentado) return [];
    return segmentarPorTag(filteredItems, tagList).map((g) => ({
      ...g,
      // Recolher vale por checkpoint, não por grupo: quem fecha um pai fecha
      // em todos os grupos onde ele aparece. Exceto o ancestral de contexto:
      // ele só está no grupo para situar quem casou, então fica sempre aberto —
      // recolhido, sobrava só a linha esmaecida, sem o item que tem a tag.
      visiveis: g.items.filter((item) => {
        let pid = item.parentId;
        while (pid) {
          if (g.matched.has(pid) && collapsedIds.has(pid)) return false;
          pid = g.items.find((i) => i.id === pid)?.parentId ?? null;
        }
        return true;
      }),
    }));
  }, [segmentado, filteredItems, tagList, collapsedIds]);

  const total = flatItems.length;
  const completed = flatItems.filter((i) => i.isCompleted).length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /**
   * Arrastar para reordenar passa a MANDAR na ordem exibida.
   *
   * Antes o arrasto gravava `order` no servidor e a lista continuava ordenada
   * por data: a linha voltava para o lugar antigo na revalidação, e o gesto
   * parecia quebrado. Agora ele troca a ordenação para manual — o único jeito
   * de o arrasto não mentir sem trocar o default da tela, que é o mesmo de
   * /iniciativas (Início, crescente).
   */
  function assumirOrdemManual() {
    setSortKey("manual");
    setSortDir("asc");
  }

  function toggleSort(key: CheckpointSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Pais na árvore inteira (não só os filtrados): é deles que o "expandir
  // todos" e o "recolher todos" tratam.
  const idsDePais = useMemo(() => {
    const s = new Set<string>();
    for (const i of flatItems) if (i.parentId) s.add(i.parentId);
    // Marco com necessários também abre e fecha.
    for (const id of progressoPorMarco.keys()) s.add(id);
    return s;
  }, [flatItems, progressoPorMarco]);
  const algumRecolhido = [...idsDePais].some((id) => collapsedIds.has(id));
  const podeAlternarTodos = (view === "list" || view === "gantt") && idsDePais.size > 0;

  // A preferência só existe no navegador: aplicar no estado inicial divergiria
  // do HTML do servidor (hidratação). O store do localStorage devolve `null` no
  // servidor e na hidratação, e o valor salvo logo depois; quando ele diz
  // "abertos", abre tudo uma vez (ajuste de estado durante o render). Sem
  // storage (aba anônima, bloqueio), fica o default recolhido.
  const subsAbertosSalvo = useArmazenado(SUBS_ABERTOS_STORAGE_KEY) === "1";
  const [preferenciaAplicada, setPreferenciaAplicada] = useState(false);
  if (subsAbertosSalvo && !preferenciaAplicada) {
    setPreferenciaAplicada(true);
    setCollapsedIds(new Set());
  }

  function alternarTodos() {
    const abrir = algumRecolhido;
    setCollapsedIds(abrir ? new Set() : new Set(idsDePais));
    // Sem storage: vale só nesta visita.
    gravarArmazenado(SUBS_ABERTOS_STORAGE_KEY, abrir ? "1" : null);
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /**
   * Concluir um marco com necessários pendentes pede confirmação (avisa e
   * deixa seguir): às vezes a pendência foi descartada na prática e ninguém
   * atualizou, e é o time quem decide que o marco aconteceu.
   */
  function handleToggle(id: string) {
    const item = flatItems.find((i) => i.id === id);
    const p = progressoPorMarco.get(id);
    if (item && !item.isCompleted && p && p.pendentes.length > 0) {
      const n = p.pendentes.length;
      setConfirmacao({
        title: "Concluir marco com pendências?",
        message: `Ainda ${n === 1 ? "falta 1 checkpoint necessário" : `faltam ${n} checkpoints necessários`} para "${item.name}": ${listarNomes(p.pendentes.map((x) => x.name))}. Concluir o marco mesmo assim?`,
        confirmLabel: "Concluir mesmo assim",
        onConfirm: () => alternarConclusao(id),
      });
      return;
    }
    alternarConclusao(id);
  }

  // Conclusão otimista: reflete na hora (check + progresso) e reverte se falhar.
  function alternarConclusao(id: string) {
    let wasCompleted = false;
    setFlatItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        wasCompleted = i.isCompleted;
        return { ...i, isCompleted: !i.isCompleted, completedAt: i.isCompleted ? null : new Date() };
      })
    );
    actions.toggle(id).then((res) => {
      if (!res.success) {
        setFlatItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, isCompleted: wasCompleted } : i))
        );
        toast(res.error || "Erro ao atualizar o checkpoint.", "error");
      }
    });
  }

  /** Nome do pai de um checkpoint — a lista do marco o mostra antes do nome do sub. */
  const paiDe = useCallback(
    (id: string): string | null => {
      const pid = flatItems.find((i) => i.id === id)?.parentId;
      return pid ? (flatItems.find((i) => i.id === pid)?.name ?? null) : null;
    },
    [flatItems]
  );

  /**
   * Checkpoint novo criado de dentro da lista do marco: nasce no nível
   * principal (só ele pode ser necessário) e já sai atrelado ao marco.
   *
   * Dois passos no servidor (criar, atrelar). Se o segundo falhar o checkpoint
   * já existe, então o erro vai em aviso e o campo é liberado: devolver o erro
   * ao campo faria a pessoa tentar de novo e duplicar o checkpoint.
   */
  async function criarNecessarioNoMarco(marcoId: string, name: string): Promise<string | null> {
    const marco = flatItemsRef.current.find((i) => i.id === marcoId);
    if (!marco) return "Marco não encontrado.";
    const hoje = toDateInput(new Date());
    const fimDoMarco = toDateInput(marco.dueDate);
    const res = await actions.create({
      name,
      // O prazo do necessário é o dia da criação, sem passar do fim do marco.
      dueDate: fimDoMarco < hoje ? fimDoMarco : hoje,
    });
    if (!res.success) return res.error;
    const novoId = (res.data as { id?: string } | undefined)?.id;
    if (!novoId) return null;
    const atrelado = await actions.atrelarAoMarco({ marcoId, ids: [novoId] });
    if (!atrelado.success) {
      toast(`"${name}" foi criado, mas não ficou atrelado ao marco: ${atrelado.error}`, "error");
      return null;
    }
    setFlatItems((prev) =>
      prev.map((it) =>
        it.id === marcoId ? { ...it, requisitoIds: [...new Set([...it.requisitoIds, novoId])] } : it
      )
    );
    return null;
  }

  /**
   * Abre um checkpoint apontado pelo calendário: volta para a lista, expande
   * os ancestrais (senão a linha estaria escondida dentro de um pai recolhido)
   * e marca a linha para rolar até ela.
   */
  function openCheckpoint(id: string) {
    const ancestrais: string[] = [];
    let pid = flatItems.find((i) => i.id === id)?.parentId ?? null;
    while (pid) {
      ancestrais.push(pid);
      pid = flatItems.find((i) => i.id === pid)?.parentId ?? null;
    }
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const a of ancestrais) next.delete(a);
      return next;
    });
    setView("list");
    setFocusedId(id);
  }

  /**
   * Clique num dia vazio do calendário: form de criação com a data pronta.
   *
   * NÃO troca de visão. O form de criação é irmão do ternário de visões, ou
   * seja, já é renderizado embaixo do calendário e do roadmap — mandar para
   * a lista só tirava a pessoa do mês que ela estava lendo para mostrar o
   * mesmo form que apareceria ali.
   */
  function createCheckpointAt(dateISO: string) {
    setNewRootDate(dateISO);
    setIsAddingRoot(true);
  }

  /**
   * Datas alteradas por arrasto — vale para o roadmap e para o calendário.
   * Otimista: reflete na hora (as duas visões leem de flatItems), senão a barra
   * "volta" para a data antiga enquanto o servidor revalida.
   */
  async function updateDatesOptimistic(id: string, sd: string | null, dd: string) {
    const cp = flatItems.find((c) => c.id === id);
    if (!cp) return;
    // O pai estica junto (mesma regra do servidor): arrastar o filho para
    // além do pai já mostra o pai crescendo, sem esperar a revalidação.
    const snapshot = flatItems;
    setFlatItems((prev) =>
      aplicarCoberturaDosPais(
        prev.map((it) => (it.id === id ? { ...it, startDate: sd, dueDate: dd } : it)),
        [id]
      )
    );
    const res = await actions.update({
      // Arrastar a barra só move datas — os responsáveis vão junto inalterados
      // porque `update` reescreve o checkpoint inteiro.
      id, name: cp.name, startDate: sd, dueDate: dd,
      memberIds: cp.members.map((m) => m.id),
    });
    if (!res.success) {
      setFlatItems(snapshot);
      toast(res.error || "Erro ao atualizar as datas do checkpoint.", "error");
    }
  }

  /**
   * Nome editado inline na linha. Otimista: o nome novo aparece na hora (as
   * quatro visões leem de flatItems) e volta ao anterior se o servidor recusar.
   */
  async function renameOptimistic(id: string, name: string) {
    const anterior = flatItems.find((c) => c.id === id)?.name;
    if (anterior === undefined) return;
    setFlatItems((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)));
    const res = await actions.rename({ id, name });
    if (!res.success) {
      setFlatItems((prev) => prev.map((it) => (it.id === id ? { ...it, name: anterior } : it)));
      toast(res.error || "Erro ao renomear o checkpoint.", "error");
    }
  }

  /**
   * Data editada inline na linha (início ou fim). Grava pelo `bulkUpdate`, que
   * só mexe no campo enviado — o `update` reescreveria o checkpoint inteiro.
   * Otimista, revertendo se o servidor recusar.
   */
  async function editarDataInline(id: string, campo: "startDate" | "dueDate", valor: string | null) {
    const item = flatItems.find((c) => c.id === id);
    if (!item) return;
    const erro = conferirDataInline(item, campo, valor);
    if (erro) {
      toast(erro, "error");
      return;
    }
    const snapshot = flatItems;
    setFlatItems((prev) =>
      aplicarCoberturaDosPais(
        prev.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)),
        [id]
      )
    );
    const res = await actions.bulkUpdate(
      campo === "startDate" ? { ids: [id], startDate: valor } : { ids: [id], dueDate: valor! }
    );
    if (!res.success) {
      setFlatItems(snapshot);
      toast(res.error || "Erro ao alterar a data do checkpoint.", "error");
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkError(null);
  }

  function toggleSelect(id: string, withSubtree: boolean) {
    // Mudar a seleção invalida a mensagem de permissão: ela nomeia itens que
    // podem ter acabado de sair da seleção.
    setBulkError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // O estado do item clicado decide a ação; com Shift, a subárvore inteira
      // segue esse mesmo destino (marca todos ou desmarca todos).
      const select = !prev.has(id);
      const ids = withSubtree ? [id, ...descendantIds(id, flatItems)] : [id];
      for (const target of ids) {
        if (select) next.add(target);
        else next.delete(target);
      }
      return next;
    });
  }

  const selectedCount = selectedIds.size;
  // "Todos" é o que o filtro deixou à vista — marcar itens invisíveis seria
  // editar em massa às cegas.
  const allSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));
  const someSelected = selectedCount > 0;

  function toggleSelectAll() {
    setBulkError(null);
    setSelectedIds(allSelected ? new Set() : new Set(filteredItems.map((i) => i.id)));
  }

  /**
   * Antes do patch em massa: avisa o que ele faz com os marcos. Trocar a
   * categoria desfaz ligações (mesma regra do form); concluir marco com
   * pendência pede a mesma confirmação do clique na caixa.
   */
  function applyBulk(patch: CheckpointBulkPatch) {
    const selecionados = flatItems.filter((i) => selectedIds.has(i.id));
    const avisos: string[] = [];
    if (patch.categoria !== undefined) {
      if (patch.categoria === "MARCO") {
        const perdem = selecionados.filter((i) => !ehMarco(i) && marcosPorItem.has(i.id));
        if (perdem.length > 0) {
          avisos.push(
            `${listarNomes(perdem.map((i) => i.name))} ${perdem.length === 1 ? "deixa" : "deixam"} de ser ${perdem.length === 1 ? "necessário" : "necessários"} dos marcos — um marco não depende de outro.`
          );
        }
      } else {
        const marcos = selecionados.filter((i) => ehMarco(i) && i.requisitoIds.length > 0);
        if (marcos.length > 0) {
          avisos.push(
            `${listarNomes(marcos.map((i) => i.name))} ${marcos.length === 1 ? "perde" : "perdem"} os checkpoints atrelados ao deixar de ser marco.`
          );
        }
      }
    }
    if (patch.isCompleted === true) {
      const comPendencia = selecionados.filter((i) => {
        const p = progressoPorMarco.get(i.id);
        // Pendência que também está sendo concluída agora não conta.
        return !i.isCompleted && !!p && p.pendentes.some((x) => !selectedIds.has(x.id));
      });
      if (comPendencia.length > 0) {
        avisos.push(
          `${comPendencia.length === 1 ? "O marco" : "Os marcos"} ${listarNomes(comPendencia.map((i) => i.name))} ${comPendencia.length === 1 ? "ainda tem" : "ainda têm"} checkpoints necessários pendentes.`
        );
      }
    }
    if (avisos.length > 0) {
      setConfirmacao({
        title: "Aplicar mesmo assim?",
        message: avisos.join(" "),
        confirmLabel: "Aplicar",
        onConfirm: () => void executarBulk(patch),
      });
      return;
    }
    void executarBulk(patch);
  }

  /** Atrela os selecionados como necessários do marco (otimista). */
  async function atrelarSelecionados(marcoId: string) {
    const ids = sortedItems.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    const marco = flatItems.find((i) => i.id === marcoId);
    if (ids.length === 0 || !marco) return;
    setBulkError(null);
    setBulkPending(true);
    const snapshot = flatItems;
    setFlatItems((prev) =>
      prev.map((it) =>
        it.id === marcoId ? { ...it, requisitoIds: [...new Set([...it.requisitoIds, ...ids])] } : it
      )
    );
    const res = await actions.atrelarAoMarco({ marcoId, ids });
    setBulkPending(false);
    if (!res.success) {
      setFlatItems(snapshot);
      setBulkError(res.error || "Erro ao atrelar os checkpoints ao marco.");
      return;
    }
    toast(
      `${ids.length} ${ids.length === 1 ? "checkpoint atrelado" : "checkpoints atrelados"} ao marco "${marco.name}".`
    );
  }

  // Destinos do "Atrelar a marco" (na ordem da lista) e o motivo de a seleção
  // não poder ir — marco não se atrela a marco.
  const marcoTargets = useMemo(
    () =>
      sortedItems
        .filter((i) => ehMarco(i) && !selectedIds.has(i.id))
        .map((i) => ({ id: i.id, name: i.name })),
    [sortedItems, selectedIds]
  );
  const bloqueioMarco = flatItems.some((i) => selectedIds.has(i.id) && !podeSerRequisito(i))
    ? "Um marco não pode ser atrelado a outro marco. Desmarque os marcos da seleção."
    : null;

  /**
   * Aplica um patch aos selecionados: otimista na lista local, revertendo o
   * snapshot se o servidor recusar.
   */
  /**
   * Um "Aplicar" pode trazer campos e um marco: grava os campos primeiro e só
   * atrela se eles passaram — falhou um, a pessoa corrige e aplica de novo,
   * sem metade da mudança gravada.
   */
  async function executarBulk({ marcoId, ...campos }: CheckpointBulkPatch) {
    if (Object.keys(campos).length > 0 && !(await gravarCampos(campos))) return;
    if (marcoId) await atrelarSelecionados(marcoId);
  }

  async function gravarCampos(patch: Omit<CheckpointBulkPatch, "marcoId">): Promise<boolean> {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return false;
    setBulkError(null);
    setBulkPending(true);

    const snapshot = flatItems;
    const idSet = new Set(ids);
    setFlatItems((prev) =>
      prev.map((it) => {
        if (!idSet.has(it.id)) return it;
        const next = { ...it };
        if (patch.memberIds !== undefined) {
          const chosen = new Set(patch.memberIds);
          next.members = members.filter((m) => chosen.has(m.id));
        }
        if (patch.tagIds !== undefined) next.tagIds = patch.tagIds;
        if (patch.startDate !== undefined) next.startDate = patch.startDate;
        if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
        if (patch.isCompleted !== undefined) {
          next.isCompleted = patch.isCompleted;
          next.completedAt = patch.isCompleted ? new Date() : null;
        }
        return next;
      })
    );

    const res = await actions.bulkUpdate({ ids, ...patch });
    setBulkPending(false);
    if (!res.success) {
      setFlatItems(snapshot);
      // Só o chip da barra, sem toast: a mensagem de permissão nomeia itens e
      // ficaria longa demais para aparecer duplicada. O chip fica logo acima da
      // barra, onde a pessoa já está olhando.
      setBulkError(res.error || "Erro ao atualizar os checkpoints.");
      return false;
    }
    toast(`${ids.length} ${ids.length === 1 ? "checkpoint atualizado" : "checkpoints atualizados"}.`);
    return true;
  }

  /**
   * Duplica a seleção e passa a seleção para as CÓPIAS: o uso típico é
   * reaproveitar uma sequência de etapas em outro período, então o próximo
   * passo quase sempre é mudar as datas delas na mesma barra.
   */
  async function duplicateSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkError(null);
    setBulkPending(true);
    const res = await actions.bulkDuplicate(ids);
    setBulkPending(false);
    if (!res.success) {
      setBulkError(res.error || "Erro ao duplicar os checkpoints.");
      return;
    }
    const copies = (res.data as { ids?: string[] } | undefined)?.ids ?? [];
    // A árvore nova pode chegar antes ou depois deste ponto. Se as cópias já
    // estão na lista, seleciona agora; senão o sync com o servidor seleciona
    // quando elas chegarem (selecionar antes seria podado por "não existe").
    const known = new Set(flatItemsRef.current.map((i) => i.id));
    if (copies.length > 0 && copies.every((id) => known.has(id))) {
      setSelectedIds(new Set(copies));
    } else {
      setSelectAfterSync(copies);
    }
    toast(
      `${ids.length} ${ids.length === 1 ? "checkpoint duplicado" : "checkpoints duplicados"} — a cópia ficou selecionada.`
    );
  }

  /**
   * Destinos do "Mover para": o topo e todo checkpoint que pode receber a
   * seleção (sem ciclo, sem passar de 3 níveis), na ordem da lista. Usa a
   * árvore inteira, não a filtrada: o destino pode estar escondido pelo filtro
   * e continuar sendo um lugar legítimo.
   */
  const moveTargets = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const valid = validMoveTargets(flatItems, [...selectedIds]);
    return sortedItems
      .filter((i) => valid.has(i.id))
      .map((i) => ({ id: i.id, name: i.name, depth: i.depth }));
  }, [flatItems, sortedItems, selectedIds]);

  /**
   * Move a seleção para baixo de `parentId`: otimista na lista local (com o
   * mesmo plano que o servidor vai aplicar), revertendo se ele recusar. O
   * destino é expandido para as linhas movidas aparecerem onde foram parar.
   */
  function moveSelected(parentId: string | null) {
    // Na ordem exibida, que é a ordem que elas ficam no destino.
    const ids = sortedItems.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    if (ids.length === 0) return;
    void executarMover(ids, parentId);
  }

  async function executarMover(ids: string[], parentId: string | null) {
    setBulkError(null);

    const plan = planCheckpointMove(flatItems, ids, parentId);
    if (!plan.ok) {
      setBulkError(plan.error);
      return;
    }
    const snapshot = flatItems;
    const moved = new Map(plan.moves.map((m) => [m.id, m]));
    setFlatItems((prev) =>
      recomputeDepths(
        prev.map((it) => {
          const m = moved.get(it.id);
          return m ? { ...it, parentId: m.parentId, order: m.order } : it;
        })
      )
    );
    if (parentId) {
      setCollapsedIds((prev) => {
        if (!prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }

    setBulkPending(true);
    const res = await actions.bulkMove({ ids, parentId });
    setBulkPending(false);
    if (!res.success) {
      setFlatItems(snapshot);
      setBulkError(res.error || "Erro ao mover os checkpoints.");
      return;
    }
    const destino = parentId
      ? `para dentro de "${flatItems.find((i) => i.id === parentId)?.name ?? "checkpoint"}"`
      : "para o nível principal";
    toast(`${ids.length} ${ids.length === 1 ? "checkpoint movido" : "checkpoints movidos"} ${destino}.`);
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    setBulkPending(true);
    const res = await actions.bulkRemove(ids);
    setBulkPending(false);
    if (res.success) {
      setConfirmingBulkDelete(false);
      setSelectedIds(new Set());
      toast(`${ids.length} ${ids.length === 1 ? "checkpoint excluído" : "checkpoints excluídos"}.`);
    } else {
      toast(res.error || "Erro ao excluir os checkpoints.", "error");
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  /**
   * Quem viaja no arrasto que começou em `draggedId`. Linha que faz parte de
   * uma seleção com mais de um item leva a seleção inteira, na ordem exibida
   * — e quem tem um ancestral selecionado vai dentro dele, como no "Mover
   * para". Linha fora da seleção vai sozinha.
   */
  function idsDoArrasto(draggedId: string): string[] {
    if (selectedIds.size < 2 || !selectedIds.has(draggedId)) return [draggedId];
    return moveRoots(
      flatItems,
      sortedItems.filter((i) => selectedIds.has(i.id)).map((i) => i.id)
    );
  }

  const arrastadosJuntos = useMemo(() => {
    if (!activeId) return null;
    const ref = parseDndId(activeId);
    if (ref.kind !== "row") return null;
    const ids = idsDoArrasto(ref.itemId);
    return ids.length > 1 ? new Set(ids) : null;
    // idsDoArrasto só lê o que está nas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, selectedIds, flatItems, sortedItems]);

  /**
   * Onde o arrasto cai se soltar agora: o alvo (linha ou cabeçalho) e a
   * posição. null = sem destino válido, e aí nem a linha de soltura aparece.
   *
   * O indicador (DragMove/DragOver) e a soltura (DragEnd) leem daqui, do
   * evento do momento. Antes a soltura reaproveitava o que o último DragMove
   * tinha gravado no estado, e o arrasto longo caía longe de onde foi solto.
   */
  function destinoDoArrasto({ active, over, delta }: DragMoveEvent):
    { overId: string; pos: "before" | "inside" | "after" } | null {
    if (!over) return null;
    const overIdStr = String(over.id);
    if (String(active.id) === overIdStr) return null;

    const origem = parseDndId(String(active.id));
    const alvo = parseDndId(overIdStr);
    if (origem.kind !== "row") return null;
    // Cabeçalho de grupo: solta no topo daquele grupo, como checkpoint de
    // topo — sempre cabe, e não há posição a mostrar.
    if (alvo.kind === "header") return { overId: overIdStr, pos: "after" };
    // O mesmo checkpoint repetido em outro grupo (tag é N:N) não é destino de
    // si mesmo — para trocar de tag, solta-se no cabeçalho ou noutra linha.
    if (alvo.itemId === origem.itemId) return null;
    // Arrasto em grupo: vale para cada um que vai junto.
    const levados = idsDoArrasto(origem.itemId);
    if (levados.includes(alvo.itemId)) return null;
    // Ao lado ou dentro de um descendente seria ciclo.
    if (levados.some((id) => isAncestorOf(id, alvo.itemId, flatItems))) return null;

    const overItem = flatItems.find((i) => i.id === alvo.itemId);
    const inicial = active.rect.current.initial;
    if (!overItem || !inicial) return null;

    // Centro de quem é arrastado no MESMO referencial do `over.rect`: o
    // retângulo inicial mais o `delta`, que já desconta a rolagem. O
    // `translated` é a posição na tela agora — depois do auto-scroll de um
    // arrasto longo, os dois descolavam e a posição saía trocada.
    const centroY = inicial.top + delta.y + inicial.height / 2;
    const rel = (centroY - over.rect.top) / over.rect.height;

    // A subárvore inteira tem de caber no limite de profundidade: ao lado, ela
    // fica no nível do alvo; dentro, um abaixo. Sem isso, soltar um checkpoint
    // com filhos ao lado de um sub-sub gravava os filhos no nível 3, que a
    // página não busca — eles sumiam da tela (e seguiam no banco).
    const altura = Math.max(...levados.map((id) => getSubtreeHeight(id, flatItems)));
    if (overItem.depth + altura > MAX_CHECKPOINT_DEPTH) return null;
    const cabeDentro = overItem.depth + 1 + altura <= MAX_CHECKPOINT_DEPTH;

    const pos =
      rel < 0.25 ? "before"
      : rel > 0.75 ? "after"
      : cabeDentro ? "inside"
      : rel < 0.5 ? "before" : "after";
    return { overId: overIdStr, pos };
  }

  function handleDragMove(event: DragMoveEvent) {
    const destino = destinoDoArrasto(event);
    setOverId(destino?.overId ?? null);
    if (destino) setDropPos(destino.pos);
  }

  function handleDragEnd(event: DragEndEvent) {
    const destino = destinoDoArrasto(event);

    setActiveId(null);
    setOverId(null);

    if (!destino) return;
    const { active } = event;
    const prevPos = destino.pos;

    const origem = parseDndId(String(active.id));
    if (origem.kind !== "row") return;
    const alvo = parseDndId(destino.overId);
    const draggedId = origem.itemId;
    const draggedItem = flatItems.find((i) => i.id === draggedId);
    if (!draggedItem) return;
    // Arrasto em grupo: a seleção inteira vai junto, em bloco e na ordem
    // exibida (ver idsDoArrasto). Sozinho, é uma lista de um.
    const levados = idsDoArrasto(draggedId);
    const levadosSet = new Set(levados);
    const itensLevados = levados
      .map((id) => flatItems.find((i) => i.id === id))
      .filter((i): i is FlatItem => !!i);

    let newParentId: string | null;
    let insertBeforeId: string | null = null;
    let insertAfterId: string | null = null;
    // Grupo (tag) onde o checkpoint foi solto; null na lista sem grupos.
    const grupoDestino = alvo.group;

    if (alvo.kind === "header") {
      // Cabeçalho do grupo = topo daquele grupo: sai de dentro do pai, se tinha.
      newParentId = null;
    } else {
      if (levadosSet.has(alvo.itemId)) return;
      const targetItem = flatItems.find((i) => i.id === alvo.itemId);
      if (!targetItem) return;
      if (levados.some((id) => isAncestorOf(id, alvo.itemId, flatItems))) return;

      if (prevPos === "inside") {
        newParentId = alvo.itemId;
      } else if (prevPos === "before") {
        newParentId = targetItem.parentId;
        insertBeforeId = alvo.itemId;
      } else {
        newParentId = targetItem.parentId;
        insertAfterId = alvo.itemId;
      }
    }

    // Tag só muda quando se cruza de um grupo para outro — em cada um que vai.
    const novasTags =
      origem.group && grupoDestino && origem.group !== grupoDestino
        ? new Map(itensLevados.map((it) => [it.id, tagsAposMover(it.tagIds, origem.group!, grupoDestino)]))
        : null;
    // Raízes soltas no cabeçalho de outro grupo: só a tag muda, a posição fica.
    const soTags = alvo.kind === "header" && itensLevados.every((it) => it.parentId === null);
    if (soTags && !novasTags) return;

    const aplicar = () => {
      const snapshot = flatItems;
      let reorderItems: { id: string; order: number }[] = [];

      if (!soTags) {
        const siblings = flatItems
          .filter((i) => i.parentId === newParentId && !levadosSet.has(i.id))
          .sort((a, b) => a.order - b.order);

        let insertIndex = siblings.length;
        if (insertBeforeId) {
          const idx = siblings.findIndex((s) => s.id === insertBeforeId);
          insertIndex = idx >= 0 ? idx : 0;
        } else if (insertAfterId) {
          const idx = siblings.findIndex((s) => s.id === insertAfterId);
          insertIndex = idx >= 0 ? idx + 1 : siblings.length;
        }

        const newSiblings = [...siblings];
        newSiblings.splice(insertIndex, 0, ...itensLevados);
        reorderItems = newSiblings.map((s, i) => ({ id: s.id, order: i }));
      }

      setFlatItems((prev) => {
        let updated = prev;
        if (!soTags) {
          const novaOrdem = new Map(reorderItems.map((r) => [r.id, r.order]));
          updated = recomputeDepths(
            prev.map((item) => {
              const order = novaOrdem.get(item.id);
              const base = order !== undefined ? { ...item, order } : item;
              return levadosSet.has(item.id) ? { ...base, parentId: newParentId } : base;
            })
          );
        }
        if (novasTags) {
          updated = updated.map((item) => {
            const tags = novasTags.get(item.id);
            return tags ? { ...item, tagIds: tags } : item;
          });
        }
        return updated;
      });

      if (!soTags) {
        // Antes de gravar: a ordem exibida passa a ser a manual, senão a lista
        // voltaria ao lugar antigo na revalidação.
        assumirOrdemManual();
        // Virou filho de um pai recolhido: abre, para a linha não sumir.
        if (newParentId) {
          setCollapsedIds((prev) => {
            if (!prev.has(newParentId)) return prev;
            const next = new Set(prev);
            next.delete(newParentId);
            return next;
          });
        }
      }

      void (async () => {
        if (!soTags) {
          const res = await actions.updateParent({
            id: draggedId,
            juntos: levados.filter((id) => id !== draggedId),
            parentId: newParentId,
            siblings: reorderItems,
          });
          if (!res.success) {
            setFlatItems(snapshot);
            toast(res.error || "Erro ao mover o checkpoint.", "error");
            return;
          }
          if (levados.length > 1) toast(`${levados.length} checkpoints movidos.`);
        }
        if (novasTags) {
          // O bulkUpdate grava a MESMA lista em todos: um por conjunto de tags.
          const porConjunto = new Map<string, { ids: string[]; tagIds: string[] }>();
          for (const [id, tagIds] of novasTags) {
            const chave = [...tagIds].sort().join(",");
            const g = porConjunto.get(chave);
            if (g) g.ids.push(id);
            else porConjunto.set(chave, { ids: [id], tagIds });
          }
          const resultados = await Promise.all(
            [...porConjunto.values()].map((g) => actions.bulkUpdate({ ids: g.ids, tagIds: g.tagIds }))
          );
          const falha = resultados.find((r) => !r.success);
          if (falha) {
            // O pai/ordem já foram gravados: reverte só as tags.
            const anteriores = new Map(itensLevados.map((it) => [it.id, it.tagIds]));
            setFlatItems((prev) =>
              prev.map((item) => {
                const tags = anteriores.get(item.id);
                return tags ? { ...item, tagIds: tags } : item;
              })
            );
            toast((!falha.success && falha.error) || "Erro ao trocar a tag do checkpoint.", "error");
          }
        }
      })();
    };

    aplicar();
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }

  return (
    // h-full para o card acompanhar a altura da coluna vizinha quando o pai
    // estica os dois (ver grid do detalhe de iniciativa).
    <Card ref={cardRef} density="compact" className="space-y-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ListChecks size={20} className="text-forest shrink-0" />
          <h3 className="text-base font-bold text-ink">Checkpoints</h3>
          <Badge bg="var(--color-cream)" color="var(--text-muted)" borderColor="var(--border-subtle)">
            {completed} de {total} concluídos
          </Badge>
        </div>
        <div className="flex items-center gap-2">
        <SegmentedToggle
          ariaLabel="Visualização dos checkpoints"
          value={view}
          onChange={(v) => {
            const next = v as "list" | "gantt" | "semana" | "calendar";
            setView(next);
            // Roadmap e calendário não têm linhas selecionáveis: sair da lista
            // descarta a seleção, senão a barra flutuante ficaria sobre uma tela
            // sem checkboxes.
            if (next !== "list") clearSelection();
          }}
          items={[
            { value: "list", label: "Lista", icon: List },
            { value: "gantt", label: "Roadmap", icon: CalendarRange },
            // Do mais amplo para o mais estreito: mês antes de semana.
            { value: "calendar", label: "Mês", icon: CalendarDays },
            { value: "semana", label: "Semana", icon: CalendarClock },
          ]}
        />
        {/* Liga/desliga a seleção em massa. Só na lista: as outras visões não
            têm linha selecionável. Desligar limpa a seleção, senão sobrariam
            itens marcados invisíveis alimentando a barra de ações. */}
        {/* Grupo próprio, entre o toggle de visão e os controles de layout:
            três categorias de ação, três blocos separados por filete. */}
        {(canManageTags || podeSegmentar || podeAlternarTodos || (isEditable && view === "list" && total > 0)) && (
          <div
            className="flex items-center gap-1 pl-2"
            style={{ borderLeft: "1px solid var(--border-subtle)" }}
          >
          {/* As tags são do ITEM (cada iniciativa/experimento tem as suas),
              então a configuração mora no card de checkpoints dele. Vale em
              todas as visões, inclusive com o card vazio. */}
          {canManageTags && (
            <IconButton
              onClick={() => setManagingTags(true)}
              title="Configurar tags dos checkpoints"
              aria-label="Configurar tags dos checkpoints"
            >
              <Tag size={15} />
            </IconButton>
          )}
          {/* Segmentar por tag vale também para quem só lê: é visão, não edição. */}
          {podeSegmentar && (
            <IconButton
              onClick={() => setSegmentarTags((v) => !v)}
              title={segmentado ? "Ver sem grupos" : "Segmentar por tags"}
              aria-label={segmentado ? "Ver sem grupos" : "Segmentar por tags"}
              aria-pressed={segmentado}
            >
              <Layers size={15} />
            </IconButton>
          )}
          {/* Expandir/recolher todos: vale na lista e no roadmap, que dividem
              o mesmo estado de abertura. Escolher "expandir" fica lembrado. */}
          {podeAlternarTodos && (
            <IconButton
              onClick={alternarTodos}
              title={algumRecolhido ? "Expandir todos os sub-checkpoints" : "Recolher todos os sub-checkpoints"}
              aria-label={algumRecolhido ? "Expandir todos os sub-checkpoints" : "Recolher todos os sub-checkpoints"}
            >
              {algumRecolhido ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
            </IconButton>
          )}
          {isEditable && view === "list" && total > 0 && (
          <IconButton
            onClick={() => {
              setSelectionMode((on) => {
                if (on) clearSelection();
                return !on;
              });
            }}
            title={selectionMode ? "Sair da seleção em massa" : "Selecionar vários checkpoints"}
            aria-label={selectionMode ? "Sair da seleção em massa" : "Selecionar vários checkpoints"}
            aria-pressed={selectionMode}
          >
            <CheckSquare size={15} />
          </IconButton>
          )}
          </div>
        )}
        {/* Ações que a página dona injeta (ex.: recolher comentários, modo
            foco). Ficam no header do card, ao lado do toggle, em vez de
            flutuarem soltas acima dele — separadas por um filete porque são
            outra categoria de ação: o toggle troca a visão, estas mexem no
            layout da página. */}
        {headerActions && (
          <div
            className="flex items-center gap-2 pl-2"
            style={{ borderLeft: "1px solid var(--border-subtle)" }}
          >
            {headerActions}
          </div>
        )}
        </div>
      </div>

      {total > 0 && <ProgressBar value={progress} showLabel className="mt-1" />}

      {/* Filtros do card — comuns às três visões */}
      {total > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Todas as pills da barra são FilterPill: mesma caixa, só a cor
              muda (regra do design system — ver /design-system). */}
          <FilterPill
            active={hideCompleted}
            onClick={() => setHideCompleted((v) => !v)}
            icon={hideCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
          >
            {hideCompleted ? "Concluídos ocultos" : "Ocultar concluídos"}
          </FilterPill>

          {/* Uma pill por categoria que o card TEM: um filtro que não filtra
              nada é ruído, e a maioria das iniciativas não tem categoria. */}
          {CHECKPOINT_CATEGORIAS.filter((cat) =>
            flatItems.some((i) => i.categoria === cat)
          ).map((cat) => {
            const cfg = CATEGORIA_CONFIG[cat];
            const Icon = cfg.icon;
            return (
              <FilterPill
                key={cat}
                active={categoriaFilter.has(cat)}
                onClick={() =>
                  setCategoriaFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  })
                }
                icon={<Icon size={12} strokeWidth={2} />}
                // Ativo na família da categoria, não no verde do "concluídos
                // ocultos": a cor do filtro é a mesma das barras que ele deixa
                // na tela.
                colors={{ bg: cfg.soft, text: cfg.text, border: cfg.accent }}
              >
                {cfg.filtro}
              </FilterPill>
            );
          })}

          {/* Uma pill por tag EM USO, na cor da própria tag. Esmaece as não
              escolhidas quando há alguma escolhida — igual ao filtro de pessoa. */}
          {tagFilterOptions.map((t) => {
            const ativo = tagFilter.has(t.id);
            const cores = checkpointTagColors(t.color);
            return (
              <FilterPill
                key={t.id}
                active={ativo}
                onClick={() =>
                  setTagFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  })
                }
                ariaLabel={`Filtrar pela tag ${t.name}`}
                colors={{ ...cores, always: true }}
                activeRing
                dimmed={!ativo && tagFilter.size > 0}
              >
                {t.name}
              </FilterPill>
            );
          })}

          {memberOptions.length > 1 &&
            memberOptions.map((m) => {
              const ativo = memberFilter.has(m.id);
              return (
                <FilterPill
                  key={m.id}
                  active={ativo}
                  onClick={() =>
                    setMemberFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      return next;
                    })
                  }
                  icon={<Avatar name={m.name} size={16} />}
                  // Pessoa marca o ativo pela borda da marca, sem pintar o fundo.
                  colors={{
                    bg: "var(--bg-surface)",
                    text: ativo ? "var(--text-primary)" : "var(--text-muted)",
                    border: ativo ? "var(--brand-primary)" : "var(--border-subtle)",
                    always: true,
                  }}
                  dimmed={!ativo && memberFilter.size > 0}
                  // O avatar redondo encosta na borda: menos respiro à esquerda.
                  style={{ paddingLeft: 4 }}
                >
                  {m.name.split(" ")[0]}
                </FilterPill>
              );
            })}

          {escondidos > 0 && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {escondidos} {escondidos === 1 ? "oculto" : "ocultos"} pelo filtro
            </span>
          )}
        </div>
      )}

      {view === "gantt" ? (
        <CheckpointGantt
          checkpoints={filteredItems}
          members={members}
          isEditable={isEditable}
          launchDate={launchDate}
          onUpdateDates={updateDatesOptimistic}
          progressoPorMarco={progressoPorMarco}
          grupos={segmentado ? gruposPorTag : undefined}
          onToggleComplete={handleToggle}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
        />
      ) : view === "calendar" || view === "semana" ? (
        // Recebe a árvore já achatada: checkpoints e subcheckpoints entram no
        // mesmo grid de dias, distinguidos por `depth`. As três interações
        // (abrir, criar no dia, arrastar) devolvem para a lista/actions daqui.
        //
        // Mês e semana são o mesmo componente: só muda o escopo. `key` força
        // remontar ao trocar de aba, senão o cursor (que na semana guarda o
        // dia) sobrevive de uma visão para a outra e a semana abre num lugar
        // que não é o da leitura.
        <CheckpointCalendar
          key={view}
          escopo={view === "semana" ? "semana" : "mes"}
          checkpoints={calendarItemsComTags}
          filterActive={filterActive}
          launchDate={launchDate}
          arvore={arvoreDoTooltip}
          isEditable={isEditable}
          onOpenCheckpoint={openCheckpoint}
          onCreateAt={createCheckpointAt}
          onUpdateDates={updateDatesOptimistic}
          progressoPorMarco={progressoPorMarco}
        />
      ) : (
        <DndContext
          // Id fixo, como o do roadmap: sem ele o dnd-kit numera o
          // `aria-describedby` com um contador global, que no servidor não
          // bate com o do navegador — aviso de hidratação a cada abertura.
          id="checkpoint-section-dnd"
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          // O alvo também muda sem o ponteiro andar (auto-scroll da lista):
          // o indicador acompanha.
          onDragOver={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* Moldura da lista: é ela que dá o canto arredondado do cabeçalho na
              tabela de /iniciativas — lá o <table> não tem raio nenhum; quem
              arredonda é o container com borda + radius-lg + overflow-hidden,
              que recorta o fundo do header. Fica por fora do DragOverlay (mais
              abaixo), senão o overflow recortaria a linha sendo arrastada.
              `clip`, não `hidden`: recorta igual, mas não vira contêiner de
              rolagem — com `hidden` o cabeçalho sticky grudava na moldura (que
              não rola) em vez de na página. */}
          {total > 0 && (
          <div
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              overflow: "clip",
            }}
          >
            {/* Cabeçalho da lista: rótulos clicáveis que ordenam, no padrão da
                tabela de /iniciativas. Não tem checkbox de "todos". Alinha as
                colunas da direita pela DIREITA (mesmas larguras e
                gaps das linhas, mesmo padding lateral): assim não depende de
                somar as larguras dos controles da esquerda, que mudam com o
                modo de seleção. À esquerda, no modo de seleção, mora o
                "selecionar todos", que já fazia o papel de cabeçalho daquela
                coluna. */}
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{
                // Mesmo desenho do <th> da tabela de iniciativas
                // (SortableColumnHeader): fundo da página, borda inferior e
                // tipografia 11/600/muted/0.05em. O que a lista não tem é alça
                // de coluna nem handle de resize — as colunas são fixas.
                background: "var(--bg-app)",
                borderBottom: "1px solid var(--border-subtle)",
                // Fixo no topo ao rolar a lista: os rótulos (e a ordenação)
                // continuam à vista. Acima das linhas e das faixas de grupo.
                position: "sticky",
                top: 0,
                zIndex: 20,
              }}
            >
              {isEditable && selectionMode && (
                <>
                  <SelectCheckbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onToggle={toggleSelectAll}
                    title={allSelected ? "Limpar seleção" : "Selecionar todos"}
                    ariaLabel={allSelected ? "Limpar seleção" : "Selecionar todos os checkpoints"}
                  />
                  <span className="text-[11px] font-medium text-ink-soft uppercase tracking-wide">
                    {selectedCount > 0 ? `${selectedCount} de ${total}` : "Selecionar"}
                  </span>
                </>
              )}
              <span className="flex-1 flex items-center gap-2 min-w-0">
                <SortLabel
                  label="Nome"
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="start"
                />
                {/* Só depois de alguém arrastar: diz por que as setas das
                    colunas estão todas inertes, e devolve o default num
                    clique. */}
                {sortKey === "manual" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSortKey("start");
                      setSortDir("asc");
                    }}
                    {...rotuloCabecalho.alvo("Voltar a ordenar por início")}
                    className="shrink-0 inline-flex items-center gap-1"
                    style={{
                      ...COL_LABEL_STYLE,
                      color: "var(--brand-primary)",
                      background: "transparent",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-full)",
                      padding: "0 6px",
                      cursor: "pointer",
                    }}
                  >
                    Ordem manual
                    <X size={10} strokeWidth={2.5} />
                  </button>
                )}
                {rotuloCabecalho.tooltip}
              </span>
              {/* A linha tem a coluna de contagem (1/2) entre o nome e as
                  tags; sem este espaçador o rótulo alinhado à esquerda caía
                  36px antes dos chips. */}
              {comColunaDeTags && (
                <span aria-hidden="true" className="shrink-0" style={{ width: COUNT_COL_WIDTH }} />
              )}
              {comColunaDeTags && (
                <SortLabel
                  label="Tags"
                  sortKey="tags"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="start"
                  width={larguraColunaTags}
                />
              )}
              <SortLabel
                label="Responsável"
                sortKey="member"
                currentSortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                width={MEMBER_COL_WIDTH}
              />
              {!estreito && (
                <SortLabel
                  label="Início"
                  sortKey="start"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  width={DATE_COL_WIDTH}
                />
              )}
              <SortLabel
                label="Fim"
                sortKey="due"
                currentSortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                width={DATE_COL_WIDTH}
              />
              {/* Sem ordenação: a coluna mistura progresso (no marco) e
                  nome do marco (no necessário), não há uma ordem que leia
                  bem para os dois. */}
              {comColunaDeMarco && (
                <span style={{ ...COL_LABEL_STYLE, width: larguraColunaMarco }}>Marco</span>
              )}
              {/* Espelha a coluna de ações das linhas, para os rótulos não
                  escorregarem para a direita. */}
              {isEditable && (
                <span aria-hidden="true" style={{ width: ACTIONS_COL_WIDTH }} />
              )}
            </div>

          <div>
            {visibleItems.length === 0 && (
              <p
                className="text-xs px-3 py-6 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                Nenhum checkpoint corresponde ao filtro.
              </p>
            )}
            {segmentado && gruposPorTag.map((grupo, gi) => (
              <div key={grupo.key}>
                {/* Cabeçalho do grupo — o mesmo da frente em /iniciativas:
                    faixa em --bg-app, nome em caixa alta e a contagem ao lado.
                    Também recebe soltura (troca de tag). */}
                <GrupoHeader
                  groupKey={grupo.key}
                  label={grupo.label}
                  count={grupo.matched.size}
                  first={gi === 0}
                  dropEnabled={isEditable}
                  highlighted={overId === `${HEADER_DND_PREFIX}${grupo.key}`}
                  onAdd={isEditable ? () => setAddingRootInGroup(grupo.key) : undefined}
                />
                {addingRootInGroup === grupo.key && (
                  <div className="px-3 py-1.5">
                    <QuickAddCheckpoint
                      autoFocus
                      onClose={() => setAddingRootInGroup(null)}
                      placeholder={`Checkpoint em ${grupo.label} e apertar Enter…`}
                      onAdd={async (name) => {
                        const res = await actions.create({
                          name,
                          // Sem data manual: usa o dia da criação como data de fim.
                          dueDate: toDateInput(new Date()),
                          tagIds: grupo.key === SEM_TAG_KEY ? [] : [grupo.key],
                        });
                        return res.success ? null : res.error;
                      }}
                    />
                  </div>
                )}
                {grupo.visiveis.map((item, i) => (
                  <CheckpointRow
                    key={item.id}
                    item={item}
                    dndId={`${grupo.key}::${item.id}`}
                    dragDisabled={!isEditable}
                    contexto={!grupo.matched.has(item.id)}
                    hasDivider={
                      i < grupo.visiveis.length - 1 && grupo.visiveis[i + 1]?.depth === 0
                    }
                    members={members}
                    isEditable={isEditable}
                    actions={actions}
                    tags={tagList}
                    tagById={tagById}
                    onCreateTag={createTag}
                    isCollapsed={collapsedIds.has(item.id)}
                    onToggleCollapse={() => toggleCollapse(item.id)}
                    // Contexto não recolhe (ver `visiveis`): sem chevron.
                    hasChildren={
                      grupo.matched.has(item.id) &&
                      (grupo.items.some((i) => i.parentId === item.id) || progressoPorMarco.has(item.id))
                    }
                    overPos={overId === `${grupo.key}::${item.id}` ? dropPos : null}
                    semColunaDeInicio={estreito}
                    semPillDeProgresso={semPillDeProgresso}
                    comColunaDeTags={comColunaDeTags}
                    larguraColunaTags={larguraColunaTags}
                    onOrdemManual={assumirOrdemManual}
                    onRename={renameOptimistic}
                    onEditarData={editarDataInline}
                    isAddingSub={addingToId === item.id && addingInGroup === grupo.key}
                    onAddSub={() => {
                      setAddingToId(item.id);
                      setAddingInGroup(grupo.key);
                    }}
                    onCancelAddSub={() => setAddingToId(null)}
                    onToggle={handleToggle}
                    allItems={flatItems}
                    isSelected={selectedIds.has(item.id)}
                    arrastadoJunto={arrastadosJuntos?.has(item.id) ?? false}
                    isFocused={focusedId === item.id}
                    onSelectToggle={(withSubtree) => toggleSelect(item.id, withSubtree)}
                    selectionMode={selectionMode}
                    progressoMarco={progressoPorMarco.get(item.id) ?? null}
                    marcosDoItem={marcosPorItem.get(item.id) ?? SEM_MARCOS}
                    requisitoOpcoes={requisitoOpcoes}
                    marcoOpcoes={marcoOpcoes}
                    paiDe={paiDe}
                    onAddNecessario={criarNecessarioNoMarco}
                    onIrPara={openCheckpoint}
                    comColunaDeMarco={comColunaDeMarco}
                    larguraColunaMarco={larguraColunaMarco}
                  />
                ))}
              </div>
            ))}
            {!segmentado && visibleItems.map((item, i) => (
              <CheckpointRow
                key={item.id}
                item={item}
                // Divisória só entre grupos de topo: dentro de um checkpoint
                // pai (ele e seus subcheckpoints) a linha separava o que
                // deveria ler como um bloco só. A régua fecha o grupo quando
                // a próxima linha visível é de nível 0.
                hasDivider={visibleItems[i + 1]?.depth === 0}
                members={members}
                isEditable={isEditable}
                actions={actions}
                tags={tagList}
                tagById={tagById}
                onCreateTag={createTag}
                isCollapsed={collapsedIds.has(item.id)}
                onToggleCollapse={() => toggleCollapse(item.id)}
                hasChildren={
                  filteredItems.some((i) => i.parentId === item.id) || progressoPorMarco.has(item.id)
                }
                overPos={overId === item.id ? dropPos : null}
                semColunaDeInicio={estreito}
                semPillDeProgresso={semPillDeProgresso}
                comColunaDeTags={comColunaDeTags}
                larguraColunaTags={larguraColunaTags}
                onOrdemManual={assumirOrdemManual}
                onRename={renameOptimistic}
                onEditarData={editarDataInline}
                isAddingSub={addingToId === item.id}
                onAddSub={() => {
                  setAddingToId(item.id);
                  setAddingInGroup(null);
                }}
                onCancelAddSub={() => setAddingToId(null)}
                onToggle={handleToggle}
                allItems={flatItems}
                isSelected={selectedIds.has(item.id)}
                arrastadoJunto={arrastadosJuntos?.has(item.id) ?? false}
                isFocused={focusedId === item.id}
                onSelectToggle={(withSubtree) => toggleSelect(item.id, withSubtree)}
                selectionMode={selectionMode}
                progressoMarco={progressoPorMarco.get(item.id) ?? null}
                marcosDoItem={marcosPorItem.get(item.id) ?? SEM_MARCOS}
                requisitoOpcoes={requisitoOpcoes}
                marcoOpcoes={marcoOpcoes}
                paiDe={paiDe}
                onAddNecessario={criarNecessarioNoMarco}
                onIrPara={openCheckpoint}
                comColunaDeMarco={comColunaDeMarco}
                larguraColunaMarco={larguraColunaMarco}
              />
            ))}
          </div>
          </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeId ? (
              <div className="bg-paper border border-forest rounded-lg px-3 py-2 shadow-lg opacity-90 text-sm font-medium text-ink max-w-xs truncate">
                {(() => {
                  const ref = parseDndId(activeId);
                  return ref.kind === "row" ? flatItems.find((i) => i.id === ref.itemId)?.name : null;
                })()}
                {arrastadosJuntos && (
                  <span className="block text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                    + {arrastadosJuntos.size - 1} {arrastadosJuntos.size - 1 === 1 ? "selecionado" : "selecionados"}
                  </span>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add root */}
      {isEditable && (
        <div ref={addRootRef} className="pt-2 space-y-2">
          {/* Quick add: Enter cria e já deixa o campo pronto pro próximo */}
          <QuickAddCheckpoint
            onAdd={async (name) => {
              // Sem data manual: usa o dia da criação como data de fim.
              const res = await actions.create({ name, dueDate: toDateInput(new Date()) });
              return res.success ? null : res.error;
            }}
          />

          {/* Form completo — datas, responsáveis e descrição de uma vez */}
          {isAddingRoot ? (
            <CheckpointForm
              // `key` força um form novo a cada data vinda do calendário: sem
              // ela o estado interno (com a data anterior) sobreviveria.
              key={newRootDate ?? "novo"}
              label="Nome do checkpoint..."
              members={members}
              tags={tagList}
              onCreateTag={createTag}
              initial={
                newRootDate
                  ? { name: "", description: "", startDate: "", dueDate: newRootDate, memberIds: [] }
                  : undefined
              }
              submitLabel="Adicionar"
              requisitoOpcoes={requisitoOpcoes}
              marcoOpcoes={marcoOpcoes}
              onSave={async (data) => {
                const res = await actions.create({
                  name: data.name,
                  description: data.description || undefined,
                  startDate: data.startDate || null, dueDate: data.dueDate,
                  memberIds: data.memberIds,
                  categoria: data.categoria,
                  tagIds: data.tagIds,
                  ...(data.categoria === "MARCO" && { requisitoIds: data.requisitoIds }),
                  ...(data.marcoIds !== undefined && { marcoIds: data.marcoIds }),
                });
                if (res.success) { setIsAddingRoot(false); setNewRootDate(null); return null; }
                return res.error;
              }}
              onCancel={() => { setIsAddingRoot(false); setNewRootDate(null); }}
            />
          ) : (
            <button onClick={() => setIsAddingRoot(true)}
              className="text-xs font-medium text-ink-soft hover:text-forest transition-colors">
              + com datas e responsável
            </button>
          )}
        </div>
      )}

      {/* Vale para as quatro visões, e vem DEPOIS do "+ Adicionar": o campo
          de criação é o que a pessoa faz num card vazio, então ele fica na
          frente do aviso de que não há nada. O roadmap e o calendário não
          têm mais vazio próprio — era ele que, renderizado dentro da visão,
          aparecia antes do campo. */}
      {total === 0 && !isAddingRoot && (
        // Compacto: o py-12 do empty state padrão abria um vão morto entre o
        // campo de adicionar e o ícone, num card que já é de lista densa.
        <EmptyState
          icon={ListChecks}
          title="Nenhum checkpoint definido"
          description={emptyDescription}
          density="compact"
        />
      )}

      {isEditable && view === "list" && (
        <CheckpointBulkEditBar
          count={selectedCount}
          members={members}
          tags={tagList}
          onApply={applyBulk}
          onDuplicate={duplicateSelected}
          moveTargets={moveTargets}
          onMove={moveSelected}
          marcoTargets={marcoTargets}
          bloqueioMarco={bloqueioMarco}
          onDelete={() => setConfirmingBulkDelete(true)}
          onClear={clearSelection}
          busy={bulkPending}
          message={bulkError}
          messageTone="error"
        />
      )}

      {managingTags && tagActions && (
        <CheckpointTagManager
          tags={tagList}
          usage={tagUsage}
          actions={tagActions}
          onClose={() => setManagingTags(false)}
          onTagsChange={(next) => {
            setTagList(next);
            // Tag excluída: sai das linhas e do filtro na hora. Filtro com id
            // morto esconderia tudo sem pill nenhuma para desligar.
            const vivas = new Set(next.map((t) => t.id));
            setFlatItems((prev) =>
              prev.some((i) => i.tagIds.some((id) => !vivas.has(id)))
                ? prev.map((i) => ({ ...i, tagIds: i.tagIds.filter((id) => vivas.has(id)) }))
                : prev
            );
            setTagFilter((prev) =>
              [...prev].every((id) => vivas.has(id))
                ? prev
                : new Set([...prev].filter((id) => vivas.has(id)))
            );
          }}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmDialog
          title={`Excluir ${selectedCount} ${selectedCount === 1 ? "checkpoint" : "checkpoints"}?`}
          message="Os subcheckpoints dos selecionados também serão excluídos. Essa ação não pode ser desfeita."
          confirmLabel={bulkPending ? "Excluindo..." : "Excluir"}
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmBulkDelete}
          onCancel={() => !bulkPending && setConfirmingBulkDelete(false)}
        />
      )}

      {confirmacao && (
        <ConfirmDialog
          title={confirmacao.title}
          message={confirmacao.message}
          confirmLabel={confirmacao.confirmLabel}
          cancelLabel="Voltar"
          variant="primary"
          onConfirm={() => {
            const seguir = confirmacao.onConfirm;
            setConfirmacao(null);
            seguir();
          }}
          onCancel={() => setConfirmacao(null)}
        />
      )}
    </Card>
  );
}
