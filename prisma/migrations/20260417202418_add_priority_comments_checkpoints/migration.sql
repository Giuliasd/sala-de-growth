-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENTE', 'ALTA', 'MEDIA', 'BAIXA');

-- AlterTable
ALTER TABLE "Iniciativa" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIA';

-- CreateTable
CREATE TABLE "InitiativeComment" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InitiativeComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitiativeCheckpoint" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InitiativeCheckpoint_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InitiativeComment" ADD CONSTRAINT "InitiativeComment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeComment" ADD CONSTRAINT "InitiativeComment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeCheckpoint" ADD CONSTRAINT "InitiativeCheckpoint_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
