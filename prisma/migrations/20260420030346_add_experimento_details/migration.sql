-- CreateTable
CREATE TABLE "ExperimentoComment" (
    "id" TEXT NOT NULL,
    "experimentoId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentoComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentoCheckpoint" (
    "id" TEXT NOT NULL,
    "experimentoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentoCheckpoint_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExperimentoComment" ADD CONSTRAINT "ExperimentoComment_experimentoId_fkey" FOREIGN KEY ("experimentoId") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentoComment" ADD CONSTRAINT "ExperimentoComment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentoCheckpoint" ADD CONSTRAINT "ExperimentoCheckpoint_experimentoId_fkey" FOREIGN KEY ("experimentoId") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
