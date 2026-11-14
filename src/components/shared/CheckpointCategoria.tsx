"use client";

import type { LucideIcon } from "lucide-react";
import { Flag, Send } from "lucide-react";
import type { CheckpointCategoria } from "@/lib/checkpoint-categoria";

/**
 * Categoria do checkpoint:
 * - "comunicação": o trabalho de avisar alguém (anúncio, e-mail, post, aviso ao
 *   time);
 * - "marco": uma data relevante do projeto.
 * A maioria dos checkpoints não tem categoria: `null` é o caso comum e não
 * recebe ícone nem cor própria.
 *
 * Vive num módulo só para o ícone e a cor não divergirem entre a lista, as
 * visões de mês/semana e a legenda — foi o que aconteceu com a cor de ausência,
 * que tinha uma tabela por tela.
 */
type CategoriaConfig = {
  label: string;
  /** Texto do filtro do card: "Apenas …". */
  filtro: string;
  icon: LucideIcon;
  /** Fundo da barra no calendário. */
  bar: string;
  /** O mesmo fundo como token CSS (pills de filtro, que não usam classe). */
  soft: string;
  /** Filete lateral e texto da barra. */
  accent: string;
  text: string;
};

/**
 * Nas barras do calendário sage é "concluído", peach é "prazo vencido", sky é
 * "em aberto" e butter é "hoje"/"ausência". Sobram blush (comunicação) e lilás
 * (marco) — uma família nova por categoria, para cada uma se reconhecer pela cor.
 */
export const CATEGORIA_CONFIG: Record<CheckpointCategoria, CategoriaConfig> = {
  COMUNICACAO: {
    label: "Comunicação",
    filtro: "Apenas comunicações",
    icon: Send,
    bar: "bg-blush-soft",
    soft: "var(--blush-soft)",
    accent: "var(--blush)",
    text: "var(--blush-strong)",
  },
  MARCO: {
    label: "Marco",
    filtro: "Apenas marcos",
    icon: Flag,
    bar: "bg-lilac-soft",
    soft: "var(--lilac-soft)",
    accent: "var(--lilac)",
    text: "var(--lilac-strong)",
  },
};

export function getCategoriaConfig(categoria: string | null | undefined) {
  if (!categoria) return null;
  return CATEGORIA_CONFIG[categoria as CheckpointCategoria] ?? null;
}

/**
 * Ícone da categoria, para a linha da lista (entre a caixa de concluir e o
 * nome) e para dentro da barra do calendário.
 */
export function CategoriaIcon({
  categoria,
  size = 12,
  className,
}: {
  categoria: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const cfg = getCategoriaConfig(categoria);
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <Icon
      size={size}
      strokeWidth={2}
      className={className}
      style={{ color: cfg.text, flexShrink: 0 }}
      aria-label={cfg.label}
    />
  );
}

/**
 * Seleção da categoria no formulário — a MESMA gramática do MemberPicker dos
 * responsáveis: uma pill por opção, clique liga, clique de novo desliga.
 *
 * Era um Dropdown com "Nenhuma" como primeira opção. Trocado porque no mesmo
 * formulário os responsáveis já se escolhem por pill: duas gramáticas para o
 * mesmo gesto, uma embaixo da outra. E o par ligado/desligado dispensa a
 * opção "Nenhuma" — não escolher já é não ter categoria.
 *
 * A pill ativa usa a cor da PRÓPRIA categoria (e não o verde da marca, como
 * a de responsável): é a mesma cor do ícone na linha, da barra no calendário
 * e do filtro "Apenas …". Com mais categorias, cada uma se
 * reconhece pela cor em vez de todas ficarem verdes.
 */
export function CategoriaPicker({
  value,
  onChange,
}: {
  value: CheckpointCategoria | null;
  onChange: (proxima: CheckpointCategoria | null) => void;
}) {
  const categorias = Object.keys(CATEGORIA_CONFIG) as CheckpointCategoria[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {categorias.map((cat) => {
        const cfg = CATEGORIA_CONFIG[cat];
        const Icon = cfg.icon;
        const ativa = value === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(ativa ? null : cat)}
            aria-pressed={ativa}
            // O fundo ativo vem por CLASSE (`cfg.bar` é "bg-blush-soft", não um
            // token): é a mesma classe da barra no calendário, então a pill e a
            // barra não podem divergir de tom.
            className={`px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
              ativa ? cfg.bar : ""
            }`}
            style={{
              borderRadius: "var(--radius-full)",
              border: `1px solid ${ativa ? cfg.accent : "var(--border-default)"}`,
              background: ativa ? undefined : "var(--bg-app)",
              color: ativa ? cfg.text : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <Icon size={11} strokeWidth={2} />
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}