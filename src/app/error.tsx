"use client";

// Error boundary da RAIZ. Existe por um detalhe do App Router: um `error.tsx`
// não captura o erro lançado pelo `layout.tsx` do MESMO segmento — o erro sobe
// para o boundary do segmento pai. Ou seja, `(app)/error.tsx` cobre as páginas,
// mas não `(app)/layout.tsx`, que é justamente onde roda o gate de sessão
// (`getCurrentMember`). Sem este arquivo, uma indisponibilidade do Postgres no
// gate cairia na tela de erro crua do Next.
//
// Renderiza dentro do root layout, então herda tema, fontes e tokens.

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] erro ao renderizar:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg-app)" }}
    >
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
            Não foi possível carregar a Sala de Growth
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Houve uma falha de conexão com o banco. Sua sessão continua válida —
            isso costuma ser temporário, tente novamente em instantes.
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
