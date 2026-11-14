import type { Metadata } from "next";
import { getCurrentMember } from "@/lib/session";
import { limparAvisosAntigos, listarNotificacoes } from "@/lib/notificacoes-db";
import { NotificacoesLista } from "@/components/notificacoes/NotificacoesLista";

export const metadata: Metadata = {
  title: "Notificações | Sala de Growth",
};

export default async function NotificacoesPage() {
  const eu = await getCurrentMember();
  // Higiene sem custo para a tela: avisos com mais de 90 dias saem sozinhos,
  // sem esperar a limpeza para mostrar a lista.
  void limparAvisosAntigos(eu.id);
  const { avisos, proximo } = await listarNotificacoes(eu.id);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <NotificacoesLista inicial={avisos} proximoInicial={proximo} />
    </div>
  );
}
