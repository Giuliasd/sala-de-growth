import {
  AccessRevokedError,
  NotAuthenticatedError,
  getCurrentMember,
} from "@/lib/session";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { ToastHost } from "@/components/shared/Toast";
import { UndoHotkey } from "@/components/shared/UndoHotkey";
import { BuscaGlobal } from "@/components/shared/BuscaGlobal";
import { TooltipGlobal } from "@/components/shared/TooltipGlobal";
import { contarNaoLidas } from "@/lib/notificacoes-db";
import { Suspense } from "react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Um único `getCurrentMember()` cobre sessão + membro: chama auth() por dentro
  // e é a checagem de isActive/role desta request.
  let currentMember;
  try {
    currentMember = await getCurrentMember();
  } catch (err) {
    // Sem sessão: login.
    if (err instanceof NotAuthenticatedError) redirect("/login");
    // Conta desativada/removida com sessão ainda viva: tela de logout (fora
    // deste layout) encerra a sessão. Toda página e action seguinte
    // cai aqui de novo, então o corte é imediato mesmo com o cookie vivo.
    if (err instanceof AccessRevokedError) redirect("/logout?revogado=1");
    // Qualquer outra coisa é falha de infra (Postgres indisponível, pool
    // esgotado). NÃO é revogação de acesso: propaga para o error boundary, que
    // oferece "tentar novamente". Antes caía no mesmo `catch` e o usuário era
    // informado — falsamente — de que sua conta havia sido desativada.
    throw err;
  }
  const userRole = currentMember.role;
  const userName = currentMember.name;
  // O contador é conveniência: se a consulta falhar, o app abre sem o número.
  const notificacoesNaoLidas = await contarNaoLidas(currentMember.id).catch(() => 0);

  return (
    <div className="h-screen overflow-hidden flex" style={{ background: "var(--bg-app)" }}>
      <Suspense fallback={null}>
        <Sidebar userRole={userRole} userName={userName} notificacoesNaoLidas={notificacoesNaoLidas} />
      </Suspense>

      <main className="flex-1 min-w-0 overflow-auto">
        <Suspense fallback={null}>
          {/* Carimbo por render no servidor: no popup de detalhe, um valor novo
              depois do primeiro diz ao MainContent que uma action revalidou a
              página — ver DetailModal. A impureza é o objetivo aqui (Server
              Component, um render por request). */}
          {/* eslint-disable-next-line react-hooks/purity */}
          <MainContent renderedAt={Date.now()}>{children}</MainContent>
        </Suspense>
      </main>

      <ToastHost />
      <UndoHotkey />
      {/* Ctrl/⌘ + K em qualquer tela. */}
      <BuscaGlobal />
      {/* Tooltip do app para qualquer elemento com data-tooltip (substitui o title nativo). */}
      <TooltipGlobal />
    </div>
  );
}
