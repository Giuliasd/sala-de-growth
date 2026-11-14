-- Ação também pode ser prioridade da semana.
ALTER TABLE "WeeklyFocus" ADD COLUMN "acaoId" TEXT;

-- O foco continua apontando para UM item só, agora entre três tipos.
ALTER TABLE "WeeklyFocus" DROP CONSTRAINT "WeeklyFocus_um_item_apenas";
ALTER TABLE "WeeklyFocus" ADD CONSTRAINT "WeeklyFocus_um_item_apenas"
    CHECK ((("iniciativaId" IS NOT NULL)::int + ("experimentoId" IS NOT NULL)::int + ("acaoId" IS NOT NULL)::int) = 1);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFocus_weekStart_memberId_acaoId_key" ON "WeeklyFocus"("weekStart", "memberId", "acaoId");

-- AddForeignKey
ALTER TABLE "WeeklyFocus" ADD CONSTRAINT "WeeklyFocus_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
