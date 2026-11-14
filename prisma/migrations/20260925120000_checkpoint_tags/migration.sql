-- Tags de checkpoint, configuradas por iniciativa/experimento.
--
-- Uma tabela só para os dois donos (e não CheckpointTag duplicada como os
-- checkpoints): a tag é só nome + cor, e o que muda de um lado para o outro é
-- apenas a FK. O CHECK garante que cada tag tem exatamente um dono.
--
-- Os nomes são únicos DENTRO do dono: a mesma "Design" pode existir em duas
-- iniciativas diferentes, cada uma com a sua cor.

-- CreateTable
CREATE TABLE "CheckpointTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'sky',
    "iniciativaId" TEXT,
    "experimentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckpointTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CheckpointTag_um_dono_check" CHECK (("iniciativaId" IS NULL) <> ("experimentoId" IS NULL))
);

-- CreateTable
CREATE TABLE "_CheckpointTagToInitiativeCheckpoint" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CheckpointTagToInitiativeCheckpoint_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CheckpointTagToExperimentoCheckpoint" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CheckpointTagToExperimentoCheckpoint_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckpointTag_iniciativaId_name_key" ON "CheckpointTag"("iniciativaId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CheckpointTag_experimentoId_name_key" ON "CheckpointTag"("experimentoId", "name");

-- CreateIndex
CREATE INDEX "_CheckpointTagToInitiativeCheckpoint_B_index" ON "_CheckpointTagToInitiativeCheckpoint"("B");

-- CreateIndex
CREATE INDEX "_CheckpointTagToExperimentoCheckpoint_B_index" ON "_CheckpointTagToExperimentoCheckpoint"("B");

-- AddForeignKey
ALTER TABLE "CheckpointTag" ADD CONSTRAINT "CheckpointTag_iniciativaId_fkey" FOREIGN KEY ("iniciativaId") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointTag" ADD CONSTRAINT "CheckpointTag_experimentoId_fkey" FOREIGN KEY ("experimentoId") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CheckpointTagToInitiativeCheckpoint" ADD CONSTRAINT "_CheckpointTagToInitiativeCheckpoint_A_fkey" FOREIGN KEY ("A") REFERENCES "CheckpointTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CheckpointTagToInitiativeCheckpoint" ADD CONSTRAINT "_CheckpointTagToInitiativeCheckpoint_B_fkey" FOREIGN KEY ("B") REFERENCES "InitiativeCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CheckpointTagToExperimentoCheckpoint" ADD CONSTRAINT "_CheckpointTagToExperimentoCheckpoint_A_fkey" FOREIGN KEY ("A") REFERENCES "CheckpointTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CheckpointTagToExperimentoCheckpoint" ADD CONSTRAINT "_CheckpointTagToExperimentoCheckpoint_B_fkey" FOREIGN KEY ("B") REFERENCES "ExperimentoCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
