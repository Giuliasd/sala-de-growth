import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface SegmentedItem {
  /** Valor único do item; casa com `value` para marcar o ativo. */
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Se presente, o item vira um link de navegação (usa next/link). */
  href?: string;
}

interface SegmentedToggleProps {
  items: SegmentedItem[];
  /** Valor atualmente ativo. */
  value: string;
  /** Callback para modo estado (ignorado em itens com href). */
  onChange?: (value: string) => void;
  /** id do label acessível do grupo. */
  ariaLabel?: string;
  className?: string;
}

// Controle segmentado do design system: "escolha um" entre N opções.
// Substitui os toggles inline (view/período) que repetiam cores e hover em JS.
// Estado ativo/hover/foco vivem na classe `.seg` em globals.css.
export function SegmentedToggle({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: SegmentedToggleProps) {
  return (
    <div className={`seg ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        const content = (
          <>
            {item.icon && <item.icon size={14} />}
            {item.label}
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.value}
              href={item.href}
              className="seg-item"
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={item.value}
            type="button"
            className="seg-item"
            data-active={active}
            aria-pressed={active}
            onClick={() => onChange?.(item.value)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
