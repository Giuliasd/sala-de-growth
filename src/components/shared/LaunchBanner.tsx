import { Rocket, AlertCircle, ChartLine } from "lucide-react";

/**
 * Faixa de lançamento — padrão do card "Precisa de você" do dashboard, usada
 * também na Weekly de Rituais. Duas variantes:
 *
 * - "semana": lançamento na semana corrente — família pêssego (peach-soft de
 *   fundo, peach-strong no texto: o par legível nos dois temas).
 * - "proxima": aviso de lançamento na próxima semana — verde da marca
 *   (accent-subtle + brand-primary).
 *
 * Não recrie faixas locais de lançamento; use este componente.
 */
export function LaunchBanner({
  variant,
  date,
  className = "",
}: {
  variant: "semana" | "proxima";
  date: Date | string;
  className?: string;
}) {
  const fmt = new Date(date as Date).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  if (variant === "proxima") {
    return (
      <div
        className={`flex items-center gap-2 px-2 py-1.5 ${className}`.trim()}
        style={{ background: "var(--accent-subtle)", borderRadius: "var(--radius-sm)" }}
      >
        <AlertCircle size={13} style={{ color: "var(--brand-primary)", flexShrink: 0 }} />
        <p className="text-xs" style={{ color: "var(--brand-primary)" }}>
          Lançamento na próxima semana · {fmt}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 ${className}`.trim()}
      style={{ background: "var(--peach-soft)", borderRadius: "var(--radius-sm)" }}
    >
      <Rocket size={13} style={{ color: "var(--peach-strong)", flexShrink: 0 }} />
      <p className="text-xs font-medium" style={{ color: "var(--peach-strong)" }}>
        Lançamento · {fmt}
      </p>
    </div>
  );
}

/**
 * Faixa de análise de resultados — mesmo formato da de lançamento, com a
 * família azul (sky) e o ícone de gráfico no lugar do foguete: são dois marcos
 * diferentes do mesmo item e precisam se distinguir de relance quando caem na
 * mesma semana.
 *
 * - "semana": a análise é nesta semana.
 * - "proxima": aviso de que ela cai na semana que vem.
 */
export function AnalysisBanner({
  variant,
  date,
  className = "",
}: {
  variant: "semana" | "proxima";
  date: Date | string;
  className?: string;
}) {
  const fmt = new Date(date as Date).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  if (variant === "proxima") {
    return (
      <div
        className={`flex items-center gap-2 px-2 py-1.5 ${className}`.trim()}
        style={{ background: "var(--sky-soft)", borderRadius: "var(--radius-sm)" }}
      >
        <ChartLine size={13} style={{ color: "var(--sky-strong)", flexShrink: 0 }} />
        <p className="text-xs" style={{ color: "var(--sky-strong)" }}>
          Análise de resultados na próxima semana · {fmt}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 ${className}`.trim()}
      style={{ background: "var(--sky-soft)", borderRadius: "var(--radius-sm)" }}
    >
      <ChartLine size={13} style={{ color: "var(--sky-strong)", flexShrink: 0 }} />
      <p className="text-xs font-medium" style={{ color: "var(--sky-strong)" }}>
        Análise de resultados · {fmt}
      </p>
    </div>
  );
}
