import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./Badge";
import { IconTile } from "./IconTile";

interface CardHeaderProps {
  icon: LucideIcon;
  /** Fundo do chip do ícone. Padrão: accent-subtle. */
  iconBg?: string;
  /** Cor do ícone. Padrão: brand-primary. */
  iconColor?: string;
  title: ReactNode;
  /**
   * Pill neutra ao lado do título (ex.: "3 KRs", "1 no período"). String vira
   * um `Badge` pronto; para outra cor, passe o `Badge` você mesmo.
   */
  badge?: ReactNode;
  /** Linha de apoio abaixo do título. */
  subtitle?: ReactNode;
  /** Conteúdo à direita: progresso, botões, ações do card. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho grande de card: IconTile + título + pill + subtítulo, com espaço
 * para ações à direita.
 *
 * É o cabeçalho dos objetivos de OKR e do card "Precisa de você" do dashboard —
 * use-o quando o card é uma **seção de página** com nome próprio. Para painéis
 * menores dentro de uma grade (título de 14px e contador), use `SectionCard`.
 *
 * O componente não desenha superfície: coloque-o dentro de um `<Card>`. Num
 * card `padding={0}` (lista que sangra até a borda), envolva com o padding e a
 * divisória — é o que o card de Travas de Férias faz.
 */
export function CardHeader({
  icon,
  iconBg,
  iconColor,
  title,
  badge,
  subtitle,
  actions,
  className = "",
}: CardHeaderProps) {
  return (
    // flex-wrap + min-w no bloco do título: em tela estreita as ações descem
    // para a linha de baixo em vez de espremer o título numa coluna de 1 palavra.
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${className}`.trim()}>
      {/* items-start: com título de duas linhas o ícone centralizado descia para
          o meio do bloco e perdia a âncora com a primeira linha. */}
      <div className="flex items-start gap-3 min-w-[240px] flex-1">
        <IconTile icon={icon} bg={iconBg} color={iconColor} size={36} iconSize={18} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className="text-xl font-semibold leading-tight break-words"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h2>
            {typeof badge === "string" ? (
              <Badge bg="var(--bg-app)" color="var(--text-muted)" borderColor="var(--border-subtle)">
                {badge}
              </Badge>
            ) : (
              badge
            )}
          </div>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-w-full ml-auto">{actions}</div>}
    </div>
  );
}
