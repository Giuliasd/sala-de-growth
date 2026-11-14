/*
  Warnings:

  - You are about to drop the `_ExperimentoToTeamMember` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_ExperimentoToTeamMember" DROP CONSTRAINT "_ExperimentoToTeamMember_A_fkey";

-- DropForeignKey
ALTER TABLE "_ExperimentoToTeamMember" DROP CONSTRAINT "_ExperimentoToTeamMember_B_fkey";

-- AlterTable
ALTER TABLE "Experimento" ADD COLUMN     "memberId" TEXT;

-- DropTable
DROP TABLE "_ExperimentoToTeamMember";

-- AddForeignKey
ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
