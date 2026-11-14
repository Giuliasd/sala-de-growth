-- CreateTable
CREATE TABLE "WeeklyFocus" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "memberId" TEXT NOT NULL,
    "iniciativaId" TEXT,
    "experimentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyFocus_pkey" PRIMARY KEY ("id")
);

-- O foco aponta para UM item: iniciativa ou experimento, nunca os dois nem
-- nenhum. O Prisma não expressa isso no schema, então a regra fica no banco.
ALTER TABLE "WeeklyFocus" ADD CONSTRAINT "WeeklyFocus_um_item_apenas"
    CHECK ((("iniciativaId" IS NOT NULL)::int + ("experimentoId" IS NOT NULL)::int) = 1);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFocus_weekStart_memberId_iniciativaId_key" ON "WeeklyFocus"("weekStart", "memberId", "iniciativaId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFocus_weekStart_memberId_experimentoId_key" ON "WeeklyFocus"("weekStart", "memberId", "experimentoId");

-- CreateIndex
CREATE INDEX "WeeklyFocus_weekStart_idx" ON "WeeklyFocus"("weekStart");

-- CreateIndex
CREATE INDEX "WeeklyFocus_memberId_idx" ON "WeeklyFocus"("memberId");

-- AddForeignKey
ALTER TABLE "WeeklyFocus" ADD CONSTRAINT "WeeklyFocus_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyFocus" ADD CONSTRAINT "WeeklyFocus_iniciativaId_fkey" FOREIGN KEY ("iniciativaId") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyFocus" ADD CONSTRAINT "WeeklyFocus_experimentoId_fkey" FOREIGN KEY ("experimentoId") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
