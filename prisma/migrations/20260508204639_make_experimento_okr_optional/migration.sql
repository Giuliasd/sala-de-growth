-- DropForeignKey
ALTER TABLE "Experimento" DROP CONSTRAINT "Experimento_okrId_fkey";

-- AlterTable
ALTER TABLE "Experimento" ALTER COLUMN "okrId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "OKR"("id") ON DELETE SET NULL ON UPDATE CASCADE;
