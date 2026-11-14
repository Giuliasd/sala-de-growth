-- CreateTable
CREATE TABLE "AcaoSemana" (
    "id" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcaoSemana_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcaoSemana_acaoId_weekStart_key" ON "AcaoSemana"("acaoId", "weekStart");

-- CreateIndex
CREATE INDEX "AcaoSemana_weekStart_idx" ON "AcaoSemana"("weekStart");

-- AddForeignKey
ALTER TABLE "AcaoSemana" ADD CONSTRAINT "AcaoSemana_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
