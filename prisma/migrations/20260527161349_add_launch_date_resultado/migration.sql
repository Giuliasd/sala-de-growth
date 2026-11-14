-- CreateEnum
CREATE TYPE "ResultadoFinal" AS ENUM ('SUCESSO', 'PARCIAL', 'FALHA');

-- AlterTable
ALTER TABLE "Experimento" ADD COLUMN     "launchDate" TIMESTAMP(3),
ADD COLUMN     "resultado" "ResultadoFinal";

-- AlterTable
ALTER TABLE "Iniciativa" ADD COLUMN     "launchDate" TIMESTAMP(3),
ADD COLUMN     "resultado" "ResultadoFinal";
