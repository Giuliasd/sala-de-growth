import type { Metadata } from "next";
import { getEventosDoCalendario } from "@/actions/calendario";
import { getFrentes } from "@/actions/frentes";
import { getTeamMembers } from "@/actions/team-members";
import { CalendarioView } from "@/components/calendario/CalendarioView";
import { filtrosDaUrl, formatMes, parseMes } from "@/lib/calendario";
import { hojeUTC, toISODateUTC } from "@/lib/date-utils";
import { getCurrentMember } from "@/lib/session";

export const metadata: Metadata = {
  title: "Calendário | Sala de Growth",
  description: "Lançamentos, análises, comunicações e marcos de iniciativas e experimentos.",
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mes = typeof params.mes === "string" ? params.mes : undefined;

  // "Hoje" no fuso de São Paulo: o servidor roda em UTC.
  const hoje = hojeUTC();
  const alvo = parseMes(mes) ?? { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() };
  const mesInicial = formatMes(alvo.ano, alvo.mes);
  const f = filtrosDaUrl(params);

  const [calendario, frentes, members, eu] = await Promise.all([
    getEventosDoCalendario(mesInicial),
    getFrentes(),
    getTeamMembers(),
    getCurrentMember(),
  ]);

  return (
    <CalendarioView
      mesInicial={mesInicial}
      inicial={calendario}
      hoje={toISODateUTC(hoje)}
      visaoInicial={params.visao === "lista" ? "lista" : "mes"}
      filtrosIniciais={{ ...f, tipos: [...f.tipos] }}
      frentes={frentes.map((fr) => ({ id: fr.id, name: fr.name }))}
      members={members.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
      // Quem pode ser responsável por um checkpoint novo — mesma regra do
      // detalhe do item: ativo e não visitante.
      responsaveis={members
        .filter((m) => m.isActive && m.role !== "VISITANTE")
        .map((m) => ({ id: m.id, name: m.name }))}
      eu={{ id: eu.id, podeEditar: eu.role !== "VISITANTE" }}
    />
  );
}
