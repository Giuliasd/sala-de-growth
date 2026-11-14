-- CreateTable
CREATE TABLE "_ICMarcoRequisitos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ICMarcoRequisitos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ECMarcoRequisitos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ECMarcoRequisitos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ICMarcoRequisitos_B_index" ON "_ICMarcoRequisitos"("B");

-- CreateIndex
CREATE INDEX "_ECMarcoRequisitos_B_index" ON "_ECMarcoRequisitos"("B");

-- AddForeignKey
ALTER TABLE "_ICMarcoRequisitos" ADD CONSTRAINT "_ICMarcoRequisitos_A_fkey" FOREIGN KEY ("A") REFERENCES "InitiativeCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ICMarcoRequisitos" ADD CONSTRAINT "_ICMarcoRequisitos_B_fkey" FOREIGN KEY ("B") REFERENCES "InitiativeCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ECMarcoRequisitos" ADD CONSTRAINT "_ECMarcoRequisitos_A_fkey" FOREIGN KEY ("A") REFERENCES "ExperimentoCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ECMarcoRequisitos" ADD CONSTRAINT "_ECMarcoRequisitos_B_fkey" FOREIGN KEY ("B") REFERENCES "ExperimentoCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

