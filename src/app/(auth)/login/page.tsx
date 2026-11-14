import { ADMIN_EMAIL, auth, DB_UNAVAILABLE_ERROR, isDevBypassEnabled, signIn } from "@/lib/auth"
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton"
import { redirect } from "next/navigation"

// Assinatura da paleta do design system (peach, butter, sage, sky, blush).
// Um aceno discreto à identidade visual — some para leitores de tela.
const PALETTE_DOTS = ["var(--peach)", "var(--butter)", "var(--sage)", "var(--sky)", "var(--blush)"]

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth()

  // Se já logado, vai pra rota do dashboard/app
  if (session) {
    redirect("/") // ou qualquer página inicial do (app)
  }

  const { error } = await searchParams
  const errorParam = Array.isArray(error) ? error[0] : error
  // Banco indisponível NÃO pode cair na mensagem de acesso negado: acusar a conta
  // da pessoa por uma falha de infraestrutura manda ela procurar a liderança em
  // vez de simplesmente tentar de novo. As outras falhas caem num fallback
  // genérico pra não deixar ninguém sem feedback.
  const errorMessage = errorParam
    ? errorParam === DB_UNAVAILABLE_ERROR
      ? "Não conseguimos verificar seu acesso agora — falha momentânea de conexão. Tente entrar novamente."
      : errorParam === "AccessDenied"
        ? "Sua conta não possui acesso autorizado. Use uma conta cadastrada."
        : "Não foi possível entrar. Tente novamente."
    : null

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        // Fundo cream com um halo suave da marca no topo — funciona em claro e escuro.
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
        {/* Marca — mesmo quadrado verde-floresta com "S" da sidebar */}
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
              Sala de Growth
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Onde o time de Growth planeja, experimenta e aprende junto.
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

        {errorMessage && (
          <div
            className="p-3 text-sm rounded-lg text-center font-medium"
            style={{
              background: "var(--status-error-bg)",
              color: "var(--status-error-text)",
              border: "1px solid var(--status-error-bg)",
            }}
          >
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">
          <form
            action={async () => {
              "use server"
              await signIn("google", { redirectTo: "/" })
            }}
          >
            <AuthSubmitButton
              pendingLabel="Entrando…"
              style={
                {
                  "--btn-bg": "var(--brand-primary)",
                  "--btn-bg-hover": "var(--brand-primary-hover)",
                  "--btn-fg": "var(--on-brand)",
                  "--btn-weight": 600,
                  gap: 10,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                } as React.CSSProperties
              }
            >
              <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Entrar com Google
            </AuthSubmitButton>
          </form>

          {isDevBypassEnabled && (
            <form
              action={async () => {
                "use server"
                await signIn("dev-bypass", {
                  email: ADMIN_EMAIL,
                  redirectTo: "/",
                })
              }}
            >
              <AuthSubmitButton
                pendingLabel="Entrando…"
                style={
                  {
                    "--btn-bg": "transparent",
                    "--btn-bg-hover": "var(--accent-subtle)",
                    "--btn-fg": "var(--text-secondary)",
                    border: "1px dashed var(--border-default)",
                    padding: "10px 16px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                  } as React.CSSProperties
                }
              >
                Entrar como admin (dev)
              </AuthSubmitButton>
            </form>
          )}
        </div>

        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Acesso restrito a contas convidadas pela liderança
        </p>
      </div>
    </div>
  )
}
