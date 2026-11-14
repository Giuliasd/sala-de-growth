-- CreateTable
CREATE TABLE "Acao" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "iniciativaId" TEXT,
    "experimentoId" TEXT,
    "repeticao" JSONB,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Acao_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_iniciativaId_fkey" FOREIGN KEY ("iniciativaId") REFERENCES "Iniciativa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_experimentoId_fkey" FOREIGN KEY ("experimentoId") REFERENCES "Experimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
