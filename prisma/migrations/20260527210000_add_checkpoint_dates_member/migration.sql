-- AlterTable
ALTER TABLE "InitiativeCheckpoint" ADD COLUMN     "memberId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExperimentoCheckpoint" ADD COLUMN     "memberId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "InitiativeCheckpoint" ADD CONSTRAINT "InitiativeCheckpoint_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentoCheckpoint" ADD CONSTRAINT "ExperimentoCheckpoint_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
