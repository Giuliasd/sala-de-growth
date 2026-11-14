"use server";

import { prisma } from "@/lib/prisma";
import { dataSchema } from "@/lib/date-validation";
import { findQuarterCached } from "@/lib/quarters-cache";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AusenciaType, IniciativaStatus, MemberRole } from "@/generated/prisma/enums";
import { getCurrentMember, requireEditPermission, requireOwnershipPermission, type OwnershipMember } from "@/lib/session";
import { INICIATIVA_CONCLUIDA_STATUSES } from "@/lib/statusConfig";
import { mensagemDeTrava, travaQueBloqueia } from "@/lib/trava-ferias";


const createAusenciaSchema = z
  .object({
    memberId: z.string().uuid("Membro inválido."),
    type: z.nativeEnum(AusenciaType),
    startDate: dataSchema,
    endDate: dataSchema,
    notes: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: "A data de fim deve ser igual ou posterior à data de início.",
    path: ["endDate"],
  });

const updateAusenciaSchema = z
  .object({
    memberId: z.string().uuid("Membro inválido.").optional(),
    type: z.nativeEnum(AusenciaType).optional(),
    startDate: dataSchema.optional(),
    endDate: dataSchema.optional(),
    notes: z.string().max(500).optional().or(z.literal("")).nullable(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return new Date(d.endDate) >= new Date(d.startDate);
      return true;
    },
    { message: "A data de fim deve ser igual ou posterior à data de início.", path: ["endDate"] }
  );

type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// ─── Queries ───────────────────────────────────────────────────────

export async function getAusenciasByQuarter(quarterId: string) {
  await getCurrentMember();
  // Datas da lista de quarters em cache: sem round-trip antes da consulta.
  const quarter = await findQuarterCached(quarterId);
  if (!quarter) throw new Error("Quarter não encontrado.");

  return await prisma.ausencia.findMany({
    where: {
      startDate: { lte: quarter.endDate },
      endDate: { gte: quarter.startDate },
    },
    include: { member: { select: { id: true, name: true } } },
    orderBy: { startDate: "asc" },
  });
}

export async function getAusencias(filters: {
  memberId?: string;
  type?: string;
  rangeStart?: Date;
  rangeEnd?: Date;
}) {
  await getCurrentMember();
  return await prisma.ausencia.findMany({
    where: {
      ...(filters.memberId && { memberId: filters.memberId }),
      ...(filters.type && { type: filters.type as AusenciaType }),
      ...(filters.rangeStart &&
        filters.rangeEnd && {
          startDate: { lte: filters.rangeEnd },
          endDate: { gte: filters.rangeStart },
        }),
    },
    include: { member: { select: { id: true, name: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function getConflicts(rangeStart: Date, rangeEnd: Date) {
  await getCurrentMember();

  // Única query: busca iniciativas em que ALGUM responsável tem ausência
  // sobreposta no período. O WHERE com `members.some.ausencias.some` filtra no
  // banco, eliminando o loop O(n²) em JS.
  //
  // Com vários responsáveis, a mesma iniciativa pode gerar mais de um conflito —
  // um por pessoa ausente. É o que se quer: cada linha do alerta nomeia quem vai
  // faltar, e duas ausências simultâneas na mesma iniciativa são dois problemas.
  const iniciativas = await prisma.iniciativa.findMany({
    where: {
      deletedAt: null,
      status: { notIn: [...INICIATIVA_CONCLUIDA_STATUSES, IniciativaStatus.CANCELADA] as IniciativaStatus[] },
      endDate: { gte: rangeStart, lte: rangeEnd },
      members: {
        some: {
          ausencias: {
            some: { startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      endDate: true,
      startDate: true,
      members: {
        select: {
          id: true,
          name: true,
          ausencias: {
            where: { startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } },
            select: { id: true, type: true, startDate: true, endDate: true },
          },
        },
        orderBy: { name: "asc" },
      },
      frente: { select: { name: true } },
    },
  });

  const conflicts: Array<{
    iniciativa: { id: string; name: string; status: string; endDate: Date | null; member: { id: string; name: string } | null; frente: { name: string } };
    ausencia: { id: string; type: string; startDate: Date; endDate: Date; member: { id: string; name: string } };
  }> = [];

  for (const ini of iniciativas) {
    if (!ini.endDate) continue;
    const iniStart = new Date(ini.startDate ?? ini.endDate).getTime();
    const iniEnd = new Date(ini.endDate).getTime();

    for (const { ausencias: memberAusencias, ...memberData } of ini.members) {
      for (const aus of memberAusencias) {
        const ausStart = new Date(aus.startDate).getTime();
        const ausEnd = new Date(aus.endDate).getTime();
        if (iniStart <= ausEnd && iniEnd >= ausStart) {
          conflicts.push({
            iniciativa: { id: ini.id, name: ini.name, status: ini.status, endDate: ini.endDate, member: memberData, frente: ini.frente },
            ausencia: { id: aus.id, type: aus.type, startDate: aus.startDate, endDate: aus.endDate, member: memberData },
          });
        }
      }
    }
  }

  return conflicts;
}

// ─── Mutations ─────────────────────────────────────────────────────

// Garante que o membro atual pode editar a ausência (é dele ou é liderança).
/**
 * A trava de férias BLOQUEIA (não só avisa): férias que cruzam uma trava são
 * recusadas, para todos os perfis. Só o tipo FÉRIAS é barrado (ver lib/trava-ferias).
 */
async function erroDeTravaDeFerias(tipo: AusenciaType, inicio: Date, fim: Date): Promise<string | null> {
  if (tipo !== AusenciaType.FERIAS) return null;
  const travas = await prisma.travaFerias.findMany({
    where: { startDate: { lte: fim }, endDate: { gte: inicio } },
    select: { name: true, startDate: true, endDate: true },
  });
  const trava = travaQueBloqueia(travas, tipo, inicio, fim);
  return trava ? mensagemDeTrava(trava) : null;
}

async function requireAusenciaOwnership(id: string, member?: OwnershipMember) {
  const ausencia = await prisma.ausencia.findUnique({
    where: { id },
    select: { memberId: true },
  });
  if (!ausencia) throw new Error("Ausência não encontrada.");
  await requireOwnershipPermission([ausencia.memberId], member);
}

export async function createAusencia(
  data: z.infer<typeof createAusenciaSchema>
): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = createAusenciaSchema.parse(data);
    if (member.role !== MemberRole.LIDERANCA && v.memberId !== member.id) {
      throw new Error("Permissão negada. Você só pode registrar ausências para você mesmo.");
    }
    const erroTrava = await erroDeTravaDeFerias(v.type, new Date(v.startDate), new Date(v.endDate));
    if (erroTrava) return { success: false, error: erroTrava };
    const ausencia = await prisma.ausencia.create({
      data: {
        memberId: v.memberId,
        type: v.type,
        startDate: new Date(v.startDate),
        endDate: new Date(v.endDate),
        notes: v.notes || null,
      },
    });
    revalidatePath("/ausencias");
    revalidatePath("/dashboard");
    revalidatePath("/iniciativas");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: ausencia };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrada"))) return { success: false, error: error.message };
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    return { success: false, error: "Erro inesperado ao criar a ausência." };
  }
}

export async function updateAusencia(
  id: string,
  data: z.infer<typeof updateAusenciaSchema>
): Promise<ActionResponse> {
  try {
    const member = await requireEditPermission();
    const v = updateAusenciaSchema.parse(data);
    await requireAusenciaOwnership(id, member);
    if (v.memberId !== undefined && member.role !== MemberRole.LIDERANCA && v.memberId !== member.id) {
      throw new Error("Permissão negada. Você só pode registrar ausências para você mesmo.");
    }
    // Ordem das datas e trava valem para o período RESULTANTE: o refine do schema
    // só enxerga as duas datas quando ambas vêm no payload, e mandar só uma delas
    // invertia o período salvo.
    const salva = await prisma.ausencia.findUnique({
      where: { id },
      select: { type: true, startDate: true, endDate: true },
    });
    if (!salva) throw new Error("Ausência não encontrada.");
    const tipoFinal = v.type ?? salva.type;
    const inicioFinal = v.startDate !== undefined ? new Date(v.startDate) : salva.startDate;
    const fimFinal = v.endDate !== undefined ? new Date(v.endDate) : salva.endDate;
    if (fimFinal < inicioFinal) {
      return { success: false, error: "A data de fim deve ser igual ou posterior à data de início." };
    }
    // Só reavalia a trava se o que ela olha mudou: editar só a observação de uma
    // ausência antiga não pode ficar travado por uma trava criada depois.
    if (v.type !== undefined || v.startDate !== undefined || v.endDate !== undefined) {
      const erroTrava = await erroDeTravaDeFerias(tipoFinal, inicioFinal, fimFinal);
      if (erroTrava) return { success: false, error: erroTrava };
    }
    const ausencia = await prisma.ausencia.update({
      where: { id },
      data: {
        ...(v.memberId !== undefined && { memberId: v.memberId }),
        ...(v.type !== undefined && { type: v.type }),
        ...(v.startDate !== undefined && { startDate: new Date(v.startDate) }),
        ...(v.endDate !== undefined && { endDate: new Date(v.endDate) }),
        ...("notes" in v && { notes: v.notes || null }),
      },
    });
    revalidatePath("/ausencias");
    revalidatePath("/dashboard");
    revalidatePath("/iniciativas");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: ausencia };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrada"))) return { success: false, error: error.message };
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0].message };
    return { success: false, error: "Erro inesperado ao atualizar a ausência." };
  }
}

export async function deleteAusencia(id: string): Promise<ActionResponse> {
  try {
    await requireAusenciaOwnership(id);
    await prisma.ausencia.delete({ where: { id } });
    revalidatePath("/ausencias");
    revalidatePath("/dashboard");
    revalidatePath("/iniciativas");
    revalidatePath("/roadmap");
    revalidatePath("/rituais");
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Permissão negada") || error.message.includes("não encontrada"))) return { success: false, error: error.message };
    return { success: false, error: "Erro inesperado ao excluir a ausência." };
  }
}
