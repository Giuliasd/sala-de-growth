"use client";

// Error boundary global das rotas autenticadas. Páginas com boundary próprio
// (ex.: dashboard/error.tsx) têm precedência; este cobre todas as demais para
// que uma falha de dados não derrube o usuário na tela de erro crua do Next.

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] erro ao renderizar:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div
        className="flex flex-col items-center text-center gap-4 max-w-md"
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          padding: 32,
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 48, height: 48, borderRadius: 12, background: "var(--status-error-bg)" }}
        >
          <AlertTriangle size={24} style={{ color: "var(--status-error-text)" }} strokeWidth={2} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Não foi possível carregar esta página
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Houve uma falha ao buscar os dados. Isso costuma ser temporário —
            tente novamente em instantes.
          </p>
        </div>
        <button
          onClick={reset}
          className="text-sm font-medium px-4 py-2 transition-opacity hover:opacity-90"
          style={{
            background: "var(--brand-primary)",
            color: "#FFFFFF",
            borderRadius: "var(--radius-md)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
