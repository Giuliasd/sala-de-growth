import Link from "next/link"
import { auth } from "@/lib/auth"
import { handleSignOut } from "@/actions/auth"
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton"
import { redirect } from "next/navigation"
import { safeInternalPath } from "@/lib/url"

// Assinatura da paleta do design system — mesmo aceno discreto da tela de login.
const PALETTE_DOTS = ["var(--peach)", "var(--butter)", "var(--sage)", "var(--sky)", "var(--blush)"]

export default async function LogoutPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth()

  // Sem sessão não há o que confirmar — manda direto pro login.
  if (!session) {
    redirect("/login")
  }

  const { from, revogado } = await searchParams
  const backTo = safeInternalPath(from)
  // Acesso revogado (membro desativado com sessão ainda viva): copy própria e
  // sem o botão "Voltar" — não há pra onde voltar.
  const isRevoked = (Array.isArray(revogado) ? revogado[0] : revogado) === "1"

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        // Mesmo halo suave da marca do login — funciona em claro e escuro.
        background:
          "radial-gradient(900px 520px at 50% -8%, color-mix(in srgb, var(--brand-primary) 10%, transparent), transparent 70%), var(--bg-app)",
      }}
    >
      <div
        className="max-w-sm w-full p-8 space-y-7 page-enter"
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Marca — mesmo quadrado verde-floresta com "S" da sidebar e do login */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 60,
              height: 60,
              borderRadius: "var(--radius-lg)",
              background: "var(--brand-primary)",
              boxShadow: "0 8px 24px color-mix(in srgb, var(--brand-primary) 30%, transparent)",
            }}
          >
            <span
              className="font-bold select-none"
              style={{ color: "var(--on-brand)", fontSize: 28, lineHeight: 1 }}
            >
              S
            </span>
          </div>

          <div className="space-y-1.5">
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {isRevoked ? "Seu acesso foi encerrado" : "Tem certeza que deseja sair?"}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {isRevoked
                ? "Sua conta foi desativada na Sala de Growth. Se você acha que isso é um engano, fale com a liderança."
                : "Você vai encerrar sua sessão na Sala de Growth. É só entrar de novo quando voltar."}
            </p>
          </div>

          {/* Assinatura da paleta */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {PALETTE_DOTS.map((color) => (
              <span
                key={color}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "var(--radius-full)",
                  background: color,
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <form action={handleSignOut}>
            <AuthSubmitButton
              pendingLabel="Saindo…"
              style={
                {
                  "--btn-bg": "var(--brand-primary)",
                  "--btn-bg-hover": "var(--brand-primary-hover)",
                  "--btn-fg": "var(--on-brand)",
                  "--btn-weight": 600,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                } as React.CSSProperties
              }
            >
              Sair da conta
            </AuthSubmitButton>
          </form>

          {!isRevoked && (
            <Link
              href={backTo}
              className="btn u-pressable w-full"
              style={
                {
                  "--btn-bg": "var(--bg-surface)",
                  "--btn-bg-hover": "var(--bg-app)",
                  "--btn-fg": "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  padding: "10px 16px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                } as React.CSSProperties
              }
            >
              Voltar
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
