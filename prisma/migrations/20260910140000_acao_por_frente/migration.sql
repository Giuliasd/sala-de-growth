-- Ação passa a poder morar numa frente.
--
-- Nulável de propósito: parte do trabalho miúdo é transversal ("TH", "1:1",
-- "acompanhamento") e não pertence a frente nenhuma. Essas ações continuam
-- no balde "Também nesta semana" da Weekly.
--
-- ON DELETE SET NULL: apagar uma frente não pode levar a ação embora — ela é
-- trabalho de alguém, e sem frente ela volta para o balde transversal.

-- AlterTable
ALTER TABLE "Acao" ADD COLUMN "frenteId" TEXT;

-- CreateIndex
CREATE INDEX "Acao_frenteId_idx" ON "Acao"("frenteId");

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
