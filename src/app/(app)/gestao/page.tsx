import { getCurrentMember } from "@/lib/session"
import { redirect } from "next/navigation"
import { MemberRole } from "@/generated/prisma/enums"
import { getQuarters } from "@/actions/quarters"
import { getMemberStatsForQuarter } from "@/actions/gestao"
import { GestaoView } from "@/components/gestao/GestaoView"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Acompanhamento | Sala de Growth",
  description: "Visão de performance do time por membro.",
}

export default async function GestaoPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; view?: string; month?: string }>
}) {
  const currentMember = await getCurrentMember()
  if (currentMember.role !== MemberRole.LIDERANCA) {
    redirect("/dashboard")
  }

  const quarters = await getQuarters()
  const { quarter, view, month } = await searchParams

  const activeQuarter = quarters.find((q) => q.isActive)
  const now = new Date()
  const currentByDate = quarters.find((q) => {
    const start = new Date(q.startDate)
    const end = new Date(q.endDate)
    return now >= start && now <= end
  })

  const selectedQuarterId =
    quarter || activeQuarter?.id || currentByDate?.id || quarters[0]?.id || null

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId)
  const isMensal = view === "mensal"

  let monthStart: string | undefined
  let monthEnd: string | undefined
  let selectedMonthIndex = 0

  if (isMensal && selectedQuarter) {
    const rawMonthParam = parseInt(month ?? "1")
    const monthIdx = Number.isNaN(rawMonthParam)
      ? 0
      : Math.max(0, Math.min(2, rawMonthParam - 1))
    selectedMonthIndex = monthIdx

    const qStart = new Date(selectedQuarter.startDate)
    const mStart = new Date(
      Date.UTC(
        qStart.getUTCFullYear(),
        qStart.getUTCMonth() + monthIdx,
        1,
      ),
    )
    const mEnd = new Date(
      Date.UTC(
        qStart.getUTCFullYear(),
        qStart.getUTCMonth() + monthIdx + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    )
    monthStart = mStart.toISOString()
    monthEnd = mEnd.toISOString()
  }

  const memberStats = selectedQuarterId
    ? await getMemberStatsForQuarter(selectedQuarterId, monthStart, monthEnd)
    : []

  return (
    <GestaoView
      quarters={quarters}
      selectedQuarterId={selectedQuarterId}
      memberStats={memberStats}
      view={isMensal ? "mensal" : "trimestral"}
      selectedMonth={isMensal ? selectedMonthIndex + 1 : null}
    />
  )
}
