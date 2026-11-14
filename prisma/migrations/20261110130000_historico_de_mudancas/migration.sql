-- CreateEnum
CREATE TYPE "HistoricoEntidade" AS ENUM ('INICIATIVA', 'EXPERIMENTO');

-- CreateTable
CREATE TABLE "HistoricoItem" (
    "id" TEXT NOT NULL,
    "entidade" "HistoricoEntidade" NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "atorId" TEXT,
    "campo" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricoItem_entidade_entidadeId_createdAt_idx" ON "HistoricoItem"("entidade", "entidadeId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoItem_atorId_idx" ON "HistoricoItem"("atorId");

-- AddForeignKey
ALTER TABLE "HistoricoItem" ADD CONSTRAINT "HistoricoItem_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

