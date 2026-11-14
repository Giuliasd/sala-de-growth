"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { descreverMudanca, type CampoDoHistorico } from "@/lib/historico";
import { z } from "zod";

export type EventoDoHistorico = {
  id: string;
  /** ISO. As linhas de uma mesma edição têm o mesmo instante. */
  quando: string;
  /** null quando o autor foi removido. */
  ator: string | null;
  texto: string;
};

type ActionResponse<T> = { success: true; data: T } | { success: false; error: string };

const POR_PAGINA = 40;

const schema = z.object({
  entidade: z.enum(["iniciativa", "experimento"]),
  id: z.string().uuid("Item inválido."),
  /** Cursor: só eventos ANTERIORES a este instante (ISO). */
  antesDe: z.string().datetime().optional(),
});

/**
 * Histórico de um item, do mais recente para o mais antigo.
 *
 * Qualquer membro logado lê (o item em si já é legível para todos). A página é
 * cortada só entre EDIÇÕES, nunca no meio de uma: as linhas de uma mesma edição
 * compartilham o `createdAt`, e um cursor por instante pularia as que ficaram
 * para trás se o corte caísse no meio delas.
 */
export async function getHistoricoDoItem(input: {
  entidade: "iniciativa" | "experimento";
  id: string;
  antesDe?: string;
}): Promise<ActionResponse<{ eventos: EventoDoHistorico[]; proximo: string | null }>> {
  try {
    await getCurrentMember();
    const v = schema.parse(input);

    const linhas = await prisma.historicoItem.findMany({
      where: {
        entidade: v.entidade === "iniciativa" ? "INICIATIVA" : "EXPERIMENTO",
        entidadeId: v.id,
        ...(v.antesDe && { createdAt: { lt: new Date(v.antesDe) } }),
      },
      select: {
        id: true, campo: true, de: true, para: true, detalhe: true, createdAt: true,
        ator: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: POR_PAGINA + 1,
    });

    let pagina = linhas;
    let proximo: string | null = null;
    if (linhas.length > POR_PAGINA) {
      const corte = linhas[POR_PAGINA - 1].createdAt.getTime();
      // A edição que atravessa o limite vai inteira para a próxima página.
      const inteiras = linhas.filter((l) => l.createdAt.getTime() > corte);
      pagina = inteiras.length > 0 ? inteiras : linhas.slice(0, POR_PAGINA);
      proximo = pagina[pagina.length - 1].createdAt.toISOString();
    }

    return {
      success: true,
      data: {
        proximo,
        eventos: pagina.map((l) => ({
          id: l.id,
          quando: l.createdAt.toISOString(),
          ator: l.ator?.name ?? null,
          texto: descreverMudanca({
            campo: l.campo as CampoDoHistorico,
            de: l.de,
            para: l.para,
            detalhe: l.detalhe,
          }),
        })),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    console.error("getHistoricoDoItem error:", error);
    return { success: false, error: "Não foi possível carregar o histórico." };
  }
}
