import { auth, signIn } from "@/lib/auth";
import { getInviteByToken } from "@/lib/invites";
import { redirect } from "next/navigation";
import { MemberRole } from "@/generated/prisma/enums";

const ROLE_LABELS: Record<MemberRole, string> = {
  VISITANTE: "Visitante",
  COLABORADOR: "Colaborador",
  LIDERANCA: "Liderança",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const session = await auth();
  if (session) {
    redirect("/");
  }

  const invite = await getInviteByToken(token);
  const isValid = invite && !invite.usedAt && invite.expiresAt > new Date();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-gray-100 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Sala de Growth</h1>
          {isValid ? (
            <p className="text-sm text-gray-500 mt-2">
              Você foi convidado para entrar como{" "}
              <span className="font-semibold text-gray-700">
                {ROLE_LABELS[invite.role as MemberRole]}
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-2">Link de convite</p>
          )}
        </div>

        {!isValid ? (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg text-center font-medium border border-red-100">
            {!invite
              ? "Convite não encontrado."
              : invite.usedAt
              ? "Este convite já foi utilizado."
              : "Este convite expirou."}
          </div>
        ) : (
          <>
            <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-100 space-y-1">
              <p>
                <span className="font-medium">E-mail:</span> {invite.email}
              </p>
              <p>
                <span className="font-medium">Cargo inicial:</span>{" "}
                {ROLE_LABELS[invite.role as MemberRole]}
              </p>
              <p className="text-xs text-blue-500">
                Expira em{" "}
                {new Date(invite.expiresAt).toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>

            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors font-medium text-sm"
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
              </button>
            </form>

            <p className="text-xs text-center text-gray-400">
              Faça login com o e-mail <span className="font-medium">{invite.email}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
