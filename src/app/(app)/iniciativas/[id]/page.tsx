import { getIniciativaDetail } from "@/actions/iniciativas";
import type { Metadata } from "next";
import { cache } from "react";
import { getQuarters } from "@/actions/quarters";
import { getFrentes } from "@/actions/frentes";
import { getTeamMembers } from "@/actions/team-members";
import { getOKRsForSelect } from "@/actions/okrs";
import { getCurrentMember } from "@/lib/session";
import { notFound } from "next/navigation";
import { IniciativaDetailView } from "@/components/iniciativas/IniciativaDetailView";

// Mesmo carregamento para a página e para o título da aba: `cache` dedupe dentro
// do render, então o título não custa uma consulta a mais.
const carregar = cache((id: string) => getIniciativaDetail(id));

// Aba com o nome do item: com várias abertas, todas se chamavam "Sala de Growth".
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const item = await carregar(id);
    return { title: item ? `${item.name} | Iniciativa | Sala de Growth` : "Iniciativa | Sala de Growth" };
  } catch {
    return { title: "Iniciativa | Sala de Growth" };
  }
}

export default async function IniciativaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [iniciativa, currentMember, quarters, frentes, allMembers] = await Promise.all([
    carregar(id),
    getCurrentMember(),
    getQuarters(),
    getFrentes(),
    getTeamMembers()
  ]);
  const members = allMembers.filter((m) => m.isActive && m.role !== "VISITANTE");

  if (!iniciativa) {
    notFound();
  }

  // Só id + objective: é o que o seletor de OKR usa. A consulta antiga trazia
  // frente, quarter, membros e duas contagens correlacionadas por OKR — a cada
  // abertura do popup de detalhe.
  const okrs = await getOKRsForSelect(iniciativa.quarterId);

  return (
    <IniciativaDetailView
      iniciativa={{
        ...iniciativa,
        checkpoints: iniciativa.checkpoints.map((cp) => ({
          id: cp.id,
          name: cp.name,
          description: cp.description,
          startDate: cp.startDate?.toISOString() ?? null,
          dueDate: cp.dueDate.toISOString(),
          isCompleted: cp.isCompleted,

          categoria: cp.categoria,
          completedAt: cp.completedAt?.toISOString() ?? null,
          order: cp.order,
          members: cp.members,
          tags: cp.tags,
          requisitos: cp.requisitos,
          children: (cp.children ?? []).map((sub) => ({
            id: sub.id,
            name: sub.name,
            description: sub.description,
            startDate: sub.startDate?.toISOString() ?? null,
            dueDate: sub.dueDate.toISOString(),
            isCompleted: sub.isCompleted,

            categoria: sub.categoria,
            completedAt: sub.completedAt?.toISOString() ?? null,
            order: sub.order,
            members: sub.members,
            tags: sub.tags,
            requisitos: sub.requisitos,
            children: ((sub as unknown as { children?: typeof sub[] }).children ?? []).map((gc) => ({
              id: gc.id,
              name: gc.name,
              description: gc.description,
              startDate: gc.startDate?.toISOString() ?? null,
              dueDate: gc.dueDate.toISOString(),
              isCompleted: gc.isCompleted,

              categoria: gc.categoria,
              completedAt: gc.completedAt?.toISOString() ?? null,
              order: gc.order,
              members: gc.members,
              tags: gc.tags,
              requisitos: gc.requisitos,
              children: [] as never[],
            })),
          })),
        })),
        comments: iniciativa.comments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          member: c.member,
        })),
      }}
      quarters={quarters}
      frentes={frentes}
      members={members}
      okrs={okrs}
      currentMemberId={currentMember.id}
    />
  );
}
