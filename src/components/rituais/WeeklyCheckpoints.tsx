"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { CategoriaIcon } from "@/components/shared/CheckpointCategoria";
import {
  CheckpointTagChips,
  checkpointTagColors,
  type CheckpointTagLite,
} from "@/components/shared/CheckpointTags";
import { MarcoProgressoSelo } from "@/components/shared/CheckpointMarco";
import { useLabelTooltip } from "@/components/shared/CursorTooltip";
import { familyBg, familyStrong } from "@/lib/statusConfig";
import { segmentarPorTag, SEM_TAG_KEY } from "@/lib/checkpoint-tag-grupos";
import { useAgrupadoPorTag } from "./AgrupamentoPorTag";
import type { Rotulo } from "@/lib/registro-semanal";
import type { MarcoCheckpoint, ProgressoDoMarco } from "@/lib/checkpoint-marco";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDayMonth } from "@/lib/date-utils";
import { registrarEdicao } from "@/lib/undo";
import {
  bulkUpdateCheckpoints,
  deleteCheckpoint,
  renameCheckpoint,
  toggleCheckpointCompletion,
} from "@/actions/initiative-checkpoints";
import {
  bulkUpdateExperimentoCheckpoints,
  deleteExperimentoCheckpoint,
  renameExperimentoCheckpoint,
  toggleExperimentoCheckpointCompletion,
} from "@/actions/experimento-checkpoints";

export type WeeklyCheckpointRow = {
  id: string;
  name: string;
  /** Categoria (hoje só "comunicação"); null = checkpoint comum. */
  categoria: string | null;
  dueDate: Date | string;
  isCompleted: boolean;
  /**
   * 0 = checkpoint de topo, 1 = subcheckpoint, 2 = neto. A lista vem em
   * pré-ordem, e é a profundidade que remonta a árvore do acordeon.
   */
  depth: number;
  /** Prazo passado e não concluído: a linha inteira fica vermelha. */
  atrasado: boolean;
  /**
   * Em andamento na semana, com prazo DEPOIS dela: a data vira "até dd/mm",
   * para não se ler como prazo desta semana. Só a Weekly preenche.
   */
  emAndamento?: boolean;
  kind: "iniciativa" | "experimento";
  /**
   * Permissões já resolvidas no servidor, e diferentes de propósito: editar
   * (título e prazo) libera para responsável do item OU do checkpoint;
   * excluir exige responsabilidade pelo item. É a regra das actions —
   * decidir aqui evita oferecer um controle que só falharia depois do clique.
   */
  podeEditar: boolean;
  podeExcluir: boolean;
  /**
   * Tags do checkpoint, ao lado do nome (Weekly de Rituais e dashboard).
   * Opcional: sem a lista, a linha fica como antes.
   */
  tags?: CheckpointTagLite[];
  /** Marco com necessários: o selo "3/5" (peach em risco) ao lado do nome. */
  progressoMarco?: ProgressoDoMarco<MarcoCheckpoint> | null;
  /**
   * Registro da semana: como o checkpoint passou por ela ("entrou ter 21",
   * "remarcado · 22/10 → 27/10"). Na linha, uma bolinha por rótulo, depois do nome.
   */
  rotulos?: Rotulo[];
  /** Excluído: fica na semana pelo registro, riscado e sem controles. */
  excluido?: boolean;
  /** Ancestrais ("Pai › Filho") quando a linha vem do registro, sem a árvore. */
  caminho?: string | null;
};

/** "2026-09-10" a partir da data em UTC — o formato que o input date usa. */
function paraInputDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * O acordeon de um checkpoint com subcheckpoints na lista: aberto ou não, e o
 * progresso dos filhos, que continua à vista com a árvore recolhida.
 */
type Acordeon = {
  aberto: boolean;
  alternar: () => void;
  feitos: number;
  total: number;
  /**
   * Algum descendente está atrasado. Recolhido, o vermelho do filho sumia de
   * vista — e o atrasado é justamente o que a reunião precisa ver.
   */
  atrasoDentro: boolean;
};

/**
 * Pill do registro da semana — a caixa da pill de tag (CheckpointTagChip). Só
 * no resumo da pessoa; na linha do checkpoint o rótulo é bolinha (RotuloBolinha).
 */
export function RotuloPill({ rotulo }: { rotulo: Rotulo }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 shrink-0"
      style={{
        borderRadius: "var(--radius-full)",
        background: familyBg(rotulo.familia),
        color: familyStrong(rotulo.familia),
        whiteSpace: "nowrap",
      }}
    >
      {rotulo.texto}
    </span>
  );
}

/**
 * Rótulo do registro na linha do checkpoint: só a bolinha da cor, depois do
 * nome, com o texto no tooltip ("entrou ter 20", "remarcado · 22/10 → 27/10").
 * Todos contam a mesma coisa — a passagem do checkpoint pelo tempo da semana —
 * então têm a mesma forma e só a cor muda; em pill, texto e ponto misturados,
 * cada um parecia um tipo de informação diferente. A caixa de 12px é o alvo
 * do hover: o ponto sozinho seria pequeno demais para achar com o mouse.
 */
function RotuloBolinha({ rotulo }: { rotulo: Rotulo }) {
  const { alvo, tooltip } = useLabelTooltip();
  return (
    <>
      <span
        role="img"
        aria-label={rotulo.texto}
        className="shrink-0 flex items-center justify-center"
        style={{ width: 12, height: 12 }}
        {...alvo(rotulo.texto)}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "var(--radius-full)",
            background: familyStrong(rotulo.familia),
          }}
        />
      </span>
      {tooltip}
    </>
  );
}

function Linha({
  cp,
  acordeon,
  tagDoGrupo,
  enxuta,
  onErro,
  onPedirExclusao,
}: {
  cp: WeeklyCheckpointRow;
  /** Só existe quando o checkpoint tem subcheckpoints na lista. */
  acordeon: Acordeon | null;
  /** Lista agrupada: a tag do grupo já está no cabeçalho, sai da linha. */
  tagDoGrupo: string | null;
  /** Ver `WeeklyCheckpoints`. */
  enxuta: boolean;
  onErro: (msg: string | null) => void;
  onPedirExclusao: (cp: WeeklyCheckpointRow) => void;
}) {
  const [editandoData, setEditandoData] = useState(false);
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [salvando, startTransition] = useTransition();
  // Otimista: concluir é o gesto da reunião, tem de responder no clique.
  const [otimista, setOtimista] = useState<boolean | null>(null);
  // O otimista vale até o servidor responder: quando a prop muda, ela volta a
  // mandar. Sem isso ele ficava preso e escondia mudanças posteriores (Ctrl+Z,
  // edição em outra tela) até recarregar a página.
  const [servidorAnterior, setServidorAnterior] = useState(cp.isCompleted);
  if (servidorAnterior !== cp.isCompleted) {
    setServidorAnterior(cp.isCompleted);
    setOtimista(null);
  }
  const concluido = otimista ?? cp.isCompleted;
  // Atrasado é estado de PENDENTE: concluir tira o vermelho na hora, sem
  // esperar o servidor recalcular (lá o atraso já depende de isCompleted).
  const atrasado = cp.atrasado && !concluido;
  // O em andamento vence depois da semana: "até 05/11" diz que o prazo é o fim
  // do trabalho, não um combinado desta semana.
  const prazo = cp.emAndamento ? `até ${formatDayMonth(cp.dueDate)}` : formatDayMonth(cp.dueDate);

  /** Concluir/desconcluir. Lança em erro, para o Ctrl+Z saber que não desfez. */
  async function alternarConclusao() {
    const res =
      cp.kind === "iniciativa"
        ? await toggleCheckpointCompletion(cp.id)
        : await toggleExperimentoCheckpointCompletion(cp.id);
    if (!res.success) {
      setOtimista(null);
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  function onAlternarConclusao() {
    if (!cp.podeEditar || salvando) return;
    setOtimista(!concluido);
    onErro(null);
    // O toggle é sua própria inversa: desfazer é chamá-lo de novo.
    registrarEdicao(
      concluido ? `"${cp.name}" reaberto` : `"${cp.name}" concluído`,
      () => alternarConclusao()
    );
    startTransition(async () => {
      try {
        await alternarConclusao();
      } catch {
        // Erro já foi para a linha via onErro.
      }
    });
  }

  /** Grava o prazo. Lança em caso de erro, para o Ctrl+Z saber que não desfez. */
  async function aplicarData(novaData: string) {
    const res =
      cp.kind === "iniciativa"
        ? await bulkUpdateCheckpoints({ ids: [cp.id], dueDate: novaData })
        : await bulkUpdateExperimentoCheckpoints({ ids: [cp.id], dueDate: novaData });
    if (!res.success) {
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  /** Grava o título. Lança em caso de erro, pelo mesmo motivo do prazo. */
  async function aplicarTitulo(novoNome: string) {
    const res =
      cp.kind === "iniciativa"
        ? await renameCheckpoint({ id: cp.id, name: novoNome })
        : await renameExperimentoCheckpoint({ id: cp.id, name: novoNome });
    if (!res.success) {
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  function salvarTitulo(novoNome: string) {
    setEditandoTitulo(false);
    const limpo = novoNome.trim();
    const anterior = cp.name;
    if (!limpo || limpo === anterior) return;
    onErro(null);
    registrarEdicao(`título de ${anterior}`, () => aplicarTitulo(anterior));
    startTransition(async () => {
      try {
        await aplicarTitulo(limpo);
      } catch {
        // Erro já foi para a linha via onErro.
      }
    });
  }

  function salvarData(novaData: string) {
    setEditandoData(false);
    const anterior = paraInputDate(cp.dueDate);
    if (!novaData || novaData === anterior) return;
    onErro(null);
    // Ctrl+Z devolve o prazo anterior pelo mesmo caminho de gravação. O
    // registro fica fora da transição para o desfazer poder ser aguardado — o
    // toast só aparece quando a reversão chegou ao banco.
    registrarEdicao(`prazo de ${cp.name}`, () => aplicarData(anterior));
    startTransition(async () => {
      try {
        await aplicarData(novaData);
      } catch {
        // Erro já foi para a linha via onErro.
      }
    });
  }

  const tags = (cp.tags ?? []).filter((t) => t.id !== tagDoGrupo);

  // Na visão enxuta o prazo só aparece no hover (ou no foco por teclado), logo
  // depois do nome: a data em toda linha era ruído, mas remarcar é gesto da
  // reunião e não pode sumir. `hidden` em vez de opacity para não reservar a
  // largura — com a data invisível ocupando espaço, as pills da direita
  // desalinhavam de uma linha para outra.
  const classeDoPrazo = enxuta
    ? "hidden group-hover/cp:inline-flex group-focus-within/cp:inline-flex"
    : "";
  const prazoEl = editandoData ? (
    // O input nasce focado e salva no change (o date picker fecha ao
    // escolher); Esc desiste sem gravar.
    <input
      type="date"
      autoFocus
      defaultValue={paraInputDate(cp.dueDate)}
      className="field shrink-0"
      style={{ padding: "1px 4px", fontSize: 11, width: 124 }}
      onChange={(e) => salvarData(e.target.value)}
      onBlur={() => setEditandoData(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditandoData(false);
      }}
    />
  ) : cp.podeEditar ? (
    <button
      type="button"
      onClick={() => setEditandoData(true)}
      data-tooltip={
        atrasado
          ? "Prazo vencido · clique para remarcar"
          : cp.emAndamento
            ? "Em andamento nesta semana · clique para alterar o prazo"
            : "Alterar o prazo"
      }
      className={`text-[11px] shrink-0 font-mono u-transition ${classeDoPrazo}`}
      style={{
        color: atrasado ? "var(--status-late-text)" : "var(--text-muted)",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        padding: "0 3px",
        cursor: "pointer",
      }}
    >
      {prazo}
    </button>
  ) : (
    <span
      className={`text-[11px] shrink-0 font-mono ${classeDoPrazo}`}
      style={{ color: atrasado ? "var(--status-late-text)" : "var(--text-muted)" }}
    >
      {prazo}
    </span>
  );

  // Progresso dos filhos — informação que fica visível com a árvore
  // recolhida, e segundo alvo de clique junto do chevron.
  const contagemEl = acordeon && (
    <button
      type="button"
      onClick={acordeon.alternar}
      className="text-[11px] shrink-0"
      style={{
        color:
          acordeon.atrasoDentro && !acordeon.aberto
            ? "var(--status-late-text)"
            : "var(--text-muted)",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
      data-tooltip={
        acordeon.atrasoDentro && !acordeon.aberto
          ? "Tem subcheckpoint atrasado · clique para expandir"
          : acordeon.aberto
            ? "Recolher subcheckpoints"
            : "Expandir subcheckpoints"
      }
    >
      {acordeon.feitos}/{acordeon.total}
    </button>
  );

  const lixeiraEl = cp.podeExcluir && (
    <IconButton
      boxSize={20}
      onClick={() => onPedirExclusao(cp)}
      className="icon-btn--danger shrink-0 opacity-0 group-hover/cp:opacity-100 group-focus-within/cp:opacity-100 focus-visible:opacity-100"
      title="Excluir checkpoint"
      aria-label={`Excluir checkpoint ${cp.name}`}
    >
      <Trash2 size={12} />
    </IconButton>
  );

  return (
    <div className={`flex items-center gap-1.5 min-w-0 group/cp ${salvando ? "opacity-60" : ""}`}>
      {/* Slot do chevron sempre presente, como no dashboard: alinha as caixas
          de um mesmo nível mesmo quando o checkpoint não tem filhos. */}
      <button
        type="button"
        onClick={acordeon?.alternar}
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 12,
          height: 13,
          background: "transparent",
          border: "none",
          padding: 0,
          color: acordeon ? "var(--text-muted)" : "transparent",
          cursor: acordeon ? "pointer" : "default",
          pointerEvents: acordeon ? "auto" : "none",
        }}
        tabIndex={acordeon ? 0 : -1}
        aria-hidden={!acordeon}
        aria-expanded={acordeon ? acordeon.aberto : undefined}
        aria-label={
          acordeon
            ? acordeon.aberto
              ? `Recolher subcheckpoints de ${cp.name}`
              : `Expandir subcheckpoints de ${cp.name}`
            : undefined
        }
      >
        {acordeon?.aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      <button
        type="button"
        onClick={onAlternarConclusao}
        disabled={!cp.podeEditar}
        hidden={cp.excluido}
        aria-pressed={concluido}
        aria-label={concluido ? `Reabrir ${cp.name}` : `Concluir ${cp.name}`}
        data-tooltip={cp.podeEditar ? (concluido ? "Reabrir" : "Concluir") : undefined}
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 13,
          height: 13,
          borderRadius: 3,
          padding: 0,
          border: concluido ? "none" : "1.5px solid var(--border-default)",
          background: concluido ? "var(--brand-primary)" : "transparent",
          cursor: cp.podeEditar ? "pointer" : "default",
        }}
      >
        {concluido && <Check size={9} strokeWidth={3} color="#fff" />}
      </button>

      {/* Mesma posição do detalhe da iniciativa: entre a caixa de concluir e
          o nome. A Weekly é a tela da reunião — era justamente aqui que a
          categoria não aparecia. */}
      {cp.excluido && <span className="shrink-0" style={{ width: 13 }} aria-hidden />}
      <CategoriaIcon categoria={cp.categoria} size={11} />
      {cp.caminho && (
        <span className="text-[11px] shrink-0 truncate" style={{ color: "var(--text-muted)", maxWidth: 160 }}>
          {cp.caminho} ›
        </span>
      )}

      {editandoTitulo ? (
        // Enter grava, Esc desiste, sair do campo grava o que ficou escrito —
        // mesmo contrato do resto das edições inline do produto.
        <input
          type="text"
          autoFocus
          defaultValue={cp.name}
          maxLength={200}
          className="field text-xs"
          style={{ padding: "1px 4px", minWidth: 0, flex: 1 }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => salvarTitulo(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              salvarTitulo(e.currentTarget.value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              // Devolve o texto original ANTES de fechar: o blur que vem em
              // seguida chamaria salvarTitulo com o que foi digitado, e o Esc
              // não cancelaria nada.
              e.currentTarget.value = cp.name;
              setEditandoTitulo(false);
            }
          }}
        />
      ) : cp.podeEditar ? (
        <button
          type="button"
          onClick={() => setEditandoTitulo(true)}
          data-tooltip={atrasado ? "Atrasado · clique para renomear" : "Clique para renomear"}
          className="text-xs truncate text-left u-transition"
          style={{
            color: atrasado
              ? "var(--status-late-text)"
              : concluido
                ? "var(--text-muted)"
                : "var(--text-secondary)",
            textDecoration: concluido ? "line-through" : "none",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: "var(--radius-sm)",
            padding: "0 3px",
            cursor: "text",
            minWidth: 0,
          }}
        >
          {cp.name}
        </button>
      ) : (
        <span
          className="text-xs truncate"
          style={{
            color: atrasado
              ? "var(--status-late-text)"
              : concluido
                ? "var(--text-muted)"
                : "var(--text-secondary)",
            textDecoration: concluido || cp.excluido ? "line-through" : "none",
          }}
          data-tooltip={atrasado ? `Atrasado: ${cp.name}` : cp.name}
        >
          {cp.name}
        </span>
      )}

      {/* Bolinhas do registro, coladas no fim do nome: o -ml desconta o gap
          da linha e o respiro do botão do nome. */}
      {cp.rotulos && cp.rotulos.length > 0 && (
        <span className="inline-flex items-center shrink-0 -ml-1">
          {cp.rotulos.map((r) => (
            <RotuloBolinha key={r.texto} rotulo={r} />
          ))}
        </span>
      )}

      {/* Enxuta: contagem e lixeira coladas ao nome — na coluna da direita
          ficavam longe demais da linha a que pertencem. A contagem vem antes
          do prazo para não andar quando ele aparece no hover. */}
      {enxuta && contagemEl}
      {enxuta && prazoEl}
      {enxuta && lixeiraEl}
      {/* Enxuta: tags e selo vão para a direita, numa coluna que se lê de
          cima a baixo — colado ao nome, cada pill começava num lugar. */}
      {enxuta && <span aria-hidden style={{ flex: "1 1 0" }} />}

      {/* Mesmo chip do painel de checkpoints: até 2 e "+N" com tooltip. */}
      {tags.length > 0 && <CheckpointTagChips tags={tags} />}

      {/* Na reunião, o marco já diz se a data dele fecha. */}
      {cp.progressoMarco && <MarcoProgressoSelo progresso={cp.progressoMarco} />}

      {!enxuta && contagemEl}
      {!enxuta && prazoEl}
      {!enxuta && lixeiraEl}
    </div>
  );
}


/** A lista achatada (pré-ordem, com profundidade) de volta à árvore. */
type No = { cp: WeeklyCheckpointRow; filhos: No[] };

function montarArvore(lista: WeeklyCheckpointRow[]): No[] {
  const raiz: No[] = [];
  // pilha[d] = último nó visto na profundidade d; o pai de um nó é o último
  // com profundidade menor.
  const pilha: No[] = [];
  for (const cp of lista) {
    const no: No = { cp, filhos: [] };
    pilha.length = cp.depth;
    const pai = pilha[pilha.length - 1];
    (pai ? pai.filhos : raiz).push(no);
    pilha[cp.depth] = no;
  }
  return raiz;
}

function temAtraso(no: No): boolean {
  return no.filhos.some((f) => (f.cp.atrasado && !f.cp.isCompleted) || temAtraso(f));
}

/** Comparação de nomes em pt-BR — a mesma de `ordenarPorTag` na Weekly. */
const porNome = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

type Grupo = {
  key: string;
  label: string;
  cor: string;
  linhas: WeeklyCheckpointRow[];
  /** Quem casou com a tag; o resto do grupo é ancestral de contexto. */
  matched: Set<string>;
  /**
   * Quantos aparecem no cabeçalho: os que casaram sem que o pai tenha casado
   * — as linhas de topo do grupo. Contar os subcheckpoints (que herdam a tag
   * do pai) dava "QA 5" sobre uma linha só, com os filhos recolhidos.
   */
  total: number;
};

/**
 * Os checkpoints em grupos de tag, pela mesma regra do detalhe da iniciativa
 * (`segmentarPorTag`: subcheckpoint sem tag fica com o pai, tag é N:N, "Sem
 * tag" no fim). Grupos em ordem alfabética, a mesma em que a Weekly já
 * ordena as linhas. `null` quando nenhum checkpoint tem tag.
 */
function agruparPorTag(lista: WeeklyCheckpointRow[]): Grupo[] | null {
  const tags = new Map<string, CheckpointTagLite>();
  for (const cp of lista) for (const t of cp.tags ?? []) tags.set(t.id, t);
  if (tags.size === 0) return null;
  const ordenadas = [...tags.values()].sort((a, b) => porNome.compare(a.name, b.name));

  // segmentarPorTag lê a árvore por parentId; a lista daqui é pré-ordem com
  // profundidade, e o pai é o último visto um nível acima.
  const pilha: string[] = [];
  const itens = lista.map((cp) => {
    pilha.length = cp.depth;
    const parentId = pilha[pilha.length - 1] ?? null;
    pilha[cp.depth] = cp.id;
    return { id: cp.id, parentId, tagIds: (cp.tags ?? []).map((t) => t.id), cp };
  });

  return segmentarPorTag(itens, ordenadas).map((g) => ({
    key: g.key,
    label: g.label,
    cor: g.key === SEM_TAG_KEY ? "neutral" : (tags.get(g.key)?.color ?? "neutral"),
    linhas: g.items.map((i) => i.cp),
    matched: g.matched,
    total: g.items.filter((i) => g.matched.has(i.id) && !(i.parentId && g.matched.has(i.parentId))).length,
  }));
}

/** Cabeçalho do grupo: a pill da tag, uma vez só, e quantos casaram. */
function CabecalhoDoGrupo({ grupo }: { grupo: Grupo }) {
  const c = checkpointTagColors(grupo.cor);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className="text-xs px-1.5 py-0.5 truncate"
        style={{ borderRadius: "var(--radius-full)", background: c.bg, color: c.text, minWidth: 0 }}
      >
        {grupo.label}
      </span>
      <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
        {grupo.total}
      </span>
    </div>
  );
}

/**
 * Os checkpoints da semana de um item, editáveis no próprio ritual: clicar no
 * prazo troca a data, e o ícone de lixeira exclui. Subcheckpoints ficam num
 * acordeon recolhido, como no card "Precisa de você" do dashboard.
 *
 * É o que a Weekly já pedia — a review é onde se descobre que algo escorregou
 * para a semana seguinte ou que o combinado não faz mais sentido. Sem isso,
 * cada ajuste virava uma viagem até o detalhe da iniciativa.
 *
 * `enxuta` (Weekly de Rituais): o prazo só aparece no hover, contagem e
 * lixeira ficam coladas ao nome, e tags e selos vão para a direita. Dentro de um `AgrupamentoPorTag` ligado, a lista
 * sai em grupos de tag.
 */
export function WeeklyCheckpoints({
  checkpoints,
  enxuta = false,
}: {
  checkpoints: WeeklyCheckpointRow[];
  enxuta?: boolean;
}) {
  const agrupar = useAgrupadoPorTag();
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<WeeklyCheckpointRow | null>(null);
  const [, startTransition] = useTransition();
  // Subcheckpoints começam recolhidos, como no dashboard: a leitura da reunião
  // é pelos checkpoints de topo, e quem quer a quebra abre. Guardado por id,
  // então sobrevive ao re-render que cada edição traz do servidor.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());

  if (checkpoints.length === 0) return null;

  const grupos = agrupar ? agruparPorTag(checkpoints) : null;

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function renderizar(no: No, grupo: Grupo | null): React.ReactNode {
    const temFilhos = no.filhos.length > 0;
    // Ancestral que só está no grupo para situar o subcheckpoint que casou
    // fica sempre aberto (como no detalhe): recolhido, o grupo mostraria só
    // o pai, que nem é da tag.
    const contexto = !!grupo && !grupo.matched.has(no.cp.id);
    const aberto = contexto || abertos.has(no.cp.id);
    return (
      <li key={no.cp.id} className="flex flex-col gap-1 min-w-0">
        <Linha
          cp={no.cp}
          tagDoGrupo={grupo?.key ?? null}
          enxuta={enxuta}
          acordeon={
            temFilhos
              ? {
                  aberto,
                  alternar: contexto ? () => {} : () => alternar(no.cp.id),
                  feitos: no.filhos.filter((f) => f.cp.isCompleted).length,
                  total: no.filhos.length,
                  atrasoDentro: temAtraso(no),
                }
              : null
          }
          onErro={setErro}
          onPedirExclusao={setAlvo}
        />
        {temFilhos && aberto && (
          // Linha-guia saindo do chevron do pai, a mesma do dashboard.
          <ul
            className="flex flex-col gap-1"
            style={{
              marginLeft: 5,
              paddingLeft: 8,
              borderLeft: "1px solid var(--border-subtle)",
            }}
          >
            {no.filhos.map((f) => renderizar(f, grupo))}
          </ul>
        )}
      </li>
    );
  }

  function excluir() {
    const cp = alvo;
    if (!cp) return;
    setAlvo(null);
    setErro(null);
    startTransition(async () => {
      const res =
        cp.kind === "iniciativa"
          ? await deleteCheckpoint(cp.id)
          : await deleteExperimentoCheckpoint(cp.id);
      if (!res.success) setErro(res.error);
    });
  }

  return (
    <>
      {grupos ? (
        <div className="mt-1.5 flex flex-col gap-2.5">
          {grupos.map((g) => (
            <div key={g.key} className="flex flex-col gap-1 min-w-0">
              <CabecalhoDoGrupo grupo={g} />
              <ul className="flex flex-col gap-1">
                {montarArvore(g.linhas).map((no) => renderizar(no, g))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {montarArvore(checkpoints).map((no) => renderizar(no, null))}
        </ul>
      )}

      {erro && (
        <p className="text-[11px] mt-1" style={{ color: "var(--status-error-text)" }}>
          {erro}
        </p>
      )}

      {alvo && (
        <ConfirmDialog
          title="Excluir checkpoint"
          message={`Excluir "${alvo.name}"? Os subcheckpoints dele também são excluídos. Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onConfirm={excluir}
          onCancel={() => setAlvo(null)}
        />
      )}
    </>
  );
}
