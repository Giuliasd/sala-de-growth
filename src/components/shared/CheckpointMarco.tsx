"use client";

import { useState, type ComponentType } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { MemberChips } from "@/components/shared/MemberChips";
import { ProgressBar } from "@/components/shared/ProgressBar";
import {
  CursorTooltip,
  TooltipHint,
  TooltipLine,
  TooltipTitle,
  useCursorTooltip,
} from "@/components/shared/CursorTooltip";
import { familyBg, familyBorder, familyStrong } from "@/lib/statusConfig";
import {
  resumoDoRisco,
  type MarcoCheckpoint,
  type MotivoDeRisco,
  type ProgressoDoMarco,
} from "@/lib/checkpoint-marco";
import { formatFullDate } from "@/lib/date-utils";

/**
 * Peças visuais do marco com checkpoints necessários (regras em
 * lib/checkpoint-marco.ts). Tudo aqui é composição do design system:
 * a caixa de pill do Badge/MemberChips, os tokens da família lilás da
 * categoria Marco, a família peach do "atrasado" e o CursorTooltip.
 */

type Cores = { bg: string; text: string; border: string };

/** Lilás é a cor do marco (a mesma do ícone e da barra no calendário). */
const LILAS: Cores = { bg: "var(--lilac-soft)", text: "var(--lilac-strong)", border: "var(--lilac)" };
/** Risco fala a língua do atraso: família peach, a do "Atrasados" do dashboard. */
const RISCO: Cores = { bg: familyBg("peach"), text: familyStrong("peach"), border: familyBorder("peach") };
/**
 * Risco em TEXTO solto (sem fundo peach-soft por baixo): o token semântico de
 * atraso, que no tema escuro clareia — o peach-strong some sobre o card escuro.
 */
const TEXTO_RISCO = "var(--status-late-text)";
/** Tudo entregue: sage, a família de "concluído". */
const COMPLETO: Cores = { bg: familyBg("sage"), text: familyStrong("sage"), border: familyBorder("sage") };

export function coresDoProgresso(p: ProgressoDoMarco<MarcoCheckpoint>): Cores {
  if (p.emRisco) return RISCO;
  if (p.entregues === p.total) return COMPLETO;
  return LILAS;
}

/** Caixa de pill da linha — a mesma do chip de responsável e de tag. */
const PILL_CLASS = "text-xs px-1.5 py-0.5 shrink-0 inline-flex items-center gap-1";

/** Conteúdo do tooltip do marco: progresso, risco e o que falta. */
export function TooltipDoMarco({
  progresso,
  titulo = "Necessários para o marco",
  dica,
}: {
  progresso: ProgressoDoMarco<MarcoCheckpoint>;
  /** `null` = sem título (quando entra no meio de outro tooltip). */
  titulo?: string | null;
  dica?: string;
}) {
  const { entregues, total, pendentes, riscos } = progresso;
  const motivo = new Map(riscos.map((r) => [r.item.id, r.motivo]));
  return (
    <>
      {titulo && <TooltipTitle>{titulo}</TooltipTitle>}
      <TooltipLine>
        {titulo ? "" : "Necessários: "}
        {entregues} de {total} {total === 1 ? "entregue" : "entregues"}
      </TooltipLine>
      {riscos.length > 0 && <TooltipLine>⚠ {resumoDoRisco(riscos)}</TooltipLine>}
      {pendentes.length > 0 && (
        <>
          <TooltipLine dim>Falta:</TooltipLine>
          {pendentes.slice(0, 6).map((p) => (
            <TooltipLine key={p.id}>
              · {p.name}
              {motivo.get(p.id) === "atrasado" ? " (atrasado)" : motivo.get(p.id) === "depois_do_marco" ? " (vence depois)" : ""}
            </TooltipLine>
          ))}
          {pendentes.length > 6 && <TooltipLine dim>e mais {pendentes.length - 6}</TooltipLine>}
        </>
      )}
      {dica && <TooltipHint>{dica}</TooltipHint>}
    </>
  );
}

/**
 * Progresso do marco na lista, no MESMO formato da contagem de
 * subcheckpoints ("1/1"): texto pequeno e discreto, na coluna de contagem ao
 * lado do nome. Em risco o número fica na cor da data atrasada. É botão:
 * abre a lista dos necessários.
 */
export function MarcoProgressoContagem({
  progresso,
  aberto,
  onToggle,
}: {
  progresso: ProgressoDoMarco<MarcoCheckpoint>;
  aberto: boolean;
  onToggle: () => void;
}) {
  const { tip, bind, clear } = useCursorTooltip<null>();
  const { entregues, total, emRisco } = progresso;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          clear();
          onToggle();
        }}
        aria-expanded={aberto}
        aria-label={`${entregues} de ${total} checkpoints necessários entregues${emRisco ? ", marco em risco" : ""}. ${aberto ? "Esconder" : "Ver"} checkpoints necessários`}
        // Em risco: a MESMA cor e peso da data de fim atrasada na linha
        // (--status-late-text, negrito) — risco e atraso falam a mesma língua.
        className={`shrink-0 text-xs ${emRisco ? "font-bold text-[var(--status-late-text)]" : ""}`}
        style={{
          color: emRisco ? undefined : "var(--text-muted)",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
        }}
        {...bind(null)}
      >
        {entregues}/{total}
      </button>
      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipDoMarco
            progresso={progresso}
            dica={aberto ? "Clique para esconder a lista" : "Clique para ver os checkpoints"}
          />
        </CursorTooltip>
      )}
    </>
  );
}

/**
 * A mesma pill, só leitura — para o roadmap, a Weekly e o dashboard, onde
 * não há lista para abrir. O tooltip carrega o que falta.
 */
export function MarcoProgressoSelo({
  progresso,
  compacto = true,
}: {
  progresso: ProgressoDoMarco<MarcoCheckpoint>;
  compacto?: boolean;
}) {
  const { tip, bind } = useCursorTooltip<null>();
  const cores = coresDoProgresso(progresso);
  const { entregues, total, emRisco } = progresso;
  return (
    <>
      <span
        role="img"
        aria-label={`${entregues} de ${total} checkpoints necessários entregues${emRisco ? ", marco em risco" : ""}`}
        className={PILL_CLASS}
        style={{
          borderRadius: "var(--radius-full)",
          background: cores.bg,
          color: cores.text,
          // Sem borda, como a tag e o MarcoChip ao lado: a borda deixava o
          // selo 2px mais alto e com cara de outro componente na mesma linha.
          border: "none",
          whiteSpace: "nowrap",
          cursor: "default",
          fontVariantNumeric: "tabular-nums",
        }}
        {...bind(null)}
      >
        {emRisco ? (
          <AlertTriangle size={11} strokeWidth={2.25} />
        ) : entregues === total ? (
          <Check size={11} strokeWidth={2.5} />
        ) : null}
        {entregues}/{total}
        {!compacto && (total === 1 ? " entregue" : " entregues")}
      </span>
      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipDoMarco progresso={progresso} />
        </CursorTooltip>
      )}
    </>
  );
}

/**
 * Chip do checkpoint que é necessário para algum marco: diz, na própria
 * linha, que ele destrava uma data maior. Mesma caixa do chip de tag, em
 * lilás, só com o nome do marco (sem ícone: a coluna "Marco" já diz o que é).
 * Com mais de um marco vira "2 marcos" e os nomes vão no tooltip.
 */
export function MarcoChip({
  marcos,
  onAbrir,
}: {
  marcos: { id: string; name: string; progresso: ProgressoDoMarco<MarcoCheckpoint> | null }[];
  /** Leva até o marco na lista. */
  onAbrir?: (marcoId: string) => void;
}) {
  const { tip, bind, clear } = useCursorTooltip<null>();
  if (marcos.length === 0) return null;
  const unico = marcos.length === 1 ? marcos[0] : null;
  const rotulo = unico ? unico.name : `${marcos.length} marcos`;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          clear();
          onAbrir?.(marcos[0].id);
        }}
        aria-label={`Necessário para ${unico ? `o marco "${unico.name}"` : `${marcos.length} marcos`}`}
        className={PILL_CLASS}
        style={{
          borderRadius: "var(--radius-full)",
          background: LILAS.bg,
          color: LILAS.text,
          border: "none",
          cursor: onAbrir ? "pointer" : "default",
          whiteSpace: "nowrap",
          // A coluna "Marco" da lista dita a largura; o nome trunca.
          maxWidth: "100%",
          minWidth: 0,
        }}
        {...bind(null)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</span>
      </button>
      {tip && (
        <CursorTooltip x={tip.x} y={tip.y}>
          <TooltipTitle>{marcos.length === 1 ? "Necessário para o marco" : "Necessário para os marcos"}</TooltipTitle>
          {marcos.map((m) => (
            <TooltipLine key={m.id}>
              {m.name}
              {m.progresso ? ` · ${m.progresso.entregues}/${m.progresso.total}` : ""}
              {m.progresso?.emRisco ? " ⚠" : ""}
            </TooltipLine>
          ))}
          {onAbrir && <TooltipHint>Clique para ir ao marco</TooltipHint>}
        </CursorTooltip>
      )}
    </>
  );
}

type Requisito = MarcoCheckpoint & { members: { id: string; name: string }[] };

/** Campo de "nome + Enter" da seção (vem de fora: mora no CheckpointSection). */
export type CampoDeAdicionar = ComponentType<{
  placeholder?: string;
  autoFocus?: boolean;
  onClose?: () => void;
  onAdd: (name: string) => Promise<string | null>;
}>;

/** Mesma caixa de concluído da linha, em tamanho menor. Sem `onToggle`, só leitura. */
function CaixaDeConclusao({
  concluido,
  rotulo,
  onToggle,
}: {
  concluido: boolean;
  rotulo: string;
  onToggle?: () => void;
}) {
  const classe = `w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
    concluido ? "bg-forest border-forest text-cream" : "bg-paper border-line"
  }`;
  if (!onToggle) {
    return (
      <span aria-hidden="true" className={classe}>
        {concluido && <Check size={9} strokeWidth={3} />}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={concluido}
      aria-label={rotulo}
      onClick={onToggle}
      className={`${classe} ${concluido ? "" : "hover:border-forest"}`}
      style={{ padding: 0 }}
    >
      {concluido && <Check size={9} strokeWidth={3} />}
    </button>
  );
}

/**
 * Lista dos necessários, aberta pela setinha da linha do marco. Cada necessário
 * entra SOZINHO: um subcheckpoint não traz o pai nem os irmãos, e um pai não
 * traz os filhos — a lista é plana. Por isso, quando o necessário é um
 * subcheckpoint, o nome do pai aparece esmaecido antes do nome, só para situar.
 *
 * Clicar no nome leva até a linha dele na árvore. Com `onToggle`, dá para
 * concluir ali mesmo (a caixa é a da linha, só menor), e `onAddNecessario` cria
 * um checkpoint já atrelado ao marco, sem sair da lista.
 */
export function MarcoRequisitosLista({
  progresso,
  onAbrir,
  onToggle,
  paiDe,
  onAddNecessario,
  CampoDeAdicionar: Campo,
}: {
  progresso: ProgressoDoMarco<Requisito>;
  onAbrir: (id: string) => void;
  onToggle?: (id: string) => void;
  /** Nome do pai do checkpoint, ou `null` no nível principal. */
  paiDe?: (id: string) => string | null;
  /** Cria um checkpoint novo e o atrela a este marco. */
  onAddNecessario?: (name: string) => Promise<string | null>;
  CampoDeAdicionar?: CampoDeAdicionar;
}) {
  const [criando, setCriando] = useState(false);
  const motivo = new Map(progresso.riscos.map((r) => [r.item.id, r.motivo]));
  const pct = (progresso.entregues / progresso.total) * 100;
  return (
    <div
      className="mt-1.5 mb-0.5 space-y-1.5"
      style={{
        borderLeft: `2px solid ${LILAS.border}`,
        paddingLeft: 10,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="shrink-0"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Necessários
        </span>
        <div className="flex-1 min-w-0">
          <ProgressBar value={pct} />
        </div>
        {progresso.emRisco && (
          <span className="text-[11px] shrink-0" style={{ color: TEXTO_RISCO }}>
            {resumoDoRisco(progresso.riscos)}
          </span>
        )}
      </div>
      <ul className="space-y-0.5">
        {progresso.requisitos.map((r) => {
          const m: MotivoDeRisco | undefined = motivo.get(r.id);
          const pai = paiDe?.(r.id) ?? null;
          return (
            <li key={r.id} className="flex items-center gap-2 min-w-0">
              <CaixaDeConclusao
                concluido={r.isCompleted}
                rotulo={
                  r.isCompleted
                    ? `Marcar "${r.name}" como não concluído`
                    : `Marcar "${r.name}" como concluído`
                }
                onToggle={onToggle ? () => onToggle(r.id) : undefined}
              />
              <button
                type="button"
                onClick={() => onAbrir(r.id)}
                className="text-xs min-w-0 truncate text-left hover:underline"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: r.isCompleted ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: r.isCompleted ? "line-through" : undefined,
                }}
              >
                {pai && <span style={{ color: "var(--text-muted)", textDecoration: "none" }}>{pai} › </span>}
                {r.name}
              </button>
              <span className="flex-1" />
              {m && (
                <span className="text-[11px] shrink-0" style={{ color: TEXTO_RISCO }}>
                  {m === "atrasado" ? "atrasado" : "vence depois do marco"}
                </span>
              )}
              <MemberChips members={r.members} max={2} />
              <span
                className="text-[11px] font-mono shrink-0"
                style={{ color: m ? TEXTO_RISCO : "var(--text-muted)", fontWeight: m ? 700 : undefined }}
              >
                {formatFullDate(r.dueDate)}
              </span>
            </li>
          );
        })}
      </ul>
      {onAddNecessario && Campo && (
        criando ? (
          <Campo
            autoFocus
            onClose={() => setCriando(false)}
            placeholder="Novo checkpoint necessário e apertar Enter…"
            onAdd={onAddNecessario}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-forest transition-colors"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          >
            <Plus size={12} /> Novo checkpoint necessário
          </button>
        )
      )}
    </div>
  );
}

/**
 * Escolha dos necessários no formulário do marco — a mesma gramática de
 * responsáveis, categoria e tags: uma pill por opção, clique liga e desliga.
 * A ativa fica em lilás, a cor do marco. Só aparecem os elegíveis (qualquer
 * checkpoint que não seja marco); a regra é de `podeSerRequisito`. Subcheckpoint
 * leva o nome do pai esmaecido antes do próprio, para situar.
 */
export function MarcoRequisitosPicker({
  opcoes,
  value,
  onChange,
  vazio = "Nenhum checkpoint para atrelar ainda.",
}: {
  opcoes: { id: string; name: string; isCompleted: boolean; pai?: string | null }[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Texto quando não há o que escolher. */
  vazio?: string;
}) {
  if (opcoes.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {vazio}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const ativa = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(ativa ? value.filter((v) => v !== o.id) : [...value, o.id])}
            aria-pressed={ativa}
            aria-label={o.name}
            className="px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1.5"
            style={{
              borderRadius: "var(--radius-full)",
              border: `1px solid ${ativa ? LILAS.border : "var(--border-default)"}`,
              background: ativa ? LILAS.bg : "var(--bg-app)",
              color: ativa ? LILAS.text : "var(--text-secondary)",
              cursor: "pointer",
              maxWidth: 240,
            }}
          >
            {ativa && <Check size={11} strokeWidth={2.5} className="shrink-0" />}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: o.isCompleted ? "line-through" : undefined,
              }}
            >
              {o.pai && <span style={{ opacity: 0.6 }}>{o.pai} › </span>}
              {o.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
