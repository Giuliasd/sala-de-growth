interface ProgressBarProps {
  value: number;
  variant?: "default" | "time" | "dynamic";
  showLabel?: boolean;
  className?: string;
  /**
   * Marca vertical numa posição da barra (0–100). Usada nos OKRs para o tempo
   * decorrido do quarter: sem ela, 38% no dia 20 e no dia 80 parecem a mesma
   * coisa.
   */
  marker?: number;
  /** Texto do tooltip nativo do marcador (ex.: "62% do quarter decorrido"). */
  markerTitle?: string;
}

export function ProgressBar({
  value,
  variant = "default",
  showLabel = false,
  className = "",
  marker,
  markerTitle,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  let fillColorClass = "bg-forest";
  if (variant === "time") {
    fillColorClass = "bg-sky";
  } else if (variant === "dynamic") {
    if (clamped <= 33) fillColorClass = "bg-peach";
    else if (clamped <= 66) fillColorClass = "bg-butter";
    else fillColorClass = "bg-progress-good";
  }

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <span
          className={`tabular-nums font-mono block mb-1 text-right text-xs ${
            variant === "dynamic" ? "text-ink-soft" : "text-forest"
          }`}
        >
          {clamped.toFixed(1)}%
        </span>
      )}
      {/* relative + overflow visível no wrapper: o marcador precisa passar por
          cima da barra sem ser recortado pelo rounded-full dela. */}
      <div className="w-full relative">
        <div className="w-full bg-line rounded-full h-2 overflow-hidden">
          <div
            className={`${fillColorClass} rounded-full h-full transition-all duration-500 ease-in-out`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {marker !== undefined && (
          <span
            aria-hidden="true"
            data-tooltip={markerTitle}
            className="absolute top-1/2"
            style={{
              left: `${Math.min(100, Math.max(0, marker))}%`,
              width: 2,
              height: 12,
              marginLeft: -1,
              transform: "translateY(-50%)",
              background: "var(--text-muted)",
              borderRadius: 1,
              opacity: 0.75,
            }}
          />
        )}
      </div>
    </div>
  );
}
