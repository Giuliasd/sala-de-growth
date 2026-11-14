import Link from "next/link";
import { SearchX } from "lucide-react";

// 404 das rotas autenticadas: cobre notFound() das páginas de detalhe
// (iniciativas/[id], experimentos/[id]) e links quebrados, mantendo o
// usuário dentro do layout do app em vez do 404 genérico do Next.
export default function AppNotFound() {
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
          style={{ width: 48, height: 48, borderRadius: 12, background: "var(--accent-subtle)" }}
        >
          <SearchX size={24} style={{ color: "var(--brand-primary)" }} strokeWidth={2} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Página não encontrada
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            O item pode ter sido removido ou o link está desatualizado.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium px-4 py-2 transition-opacity hover:opacity-90"
          style={{
            background: "var(--brand-primary)",
            color: "#FFFFFF",
            borderRadius: "var(--radius-md)",
          }}
        >
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
