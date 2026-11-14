-- AlterTable
ALTER TABLE "ExperimentoCheckpoint" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "InitiativeCheckpoint" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "InitiativeCheckpoint" ADD CONSTRAINT "InitiativeCheckpoint_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InitiativeCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentoCheckpoint" ADD CONSTRAINT "ExperimentoCheckpoint_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExperimentoCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
