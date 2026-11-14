-- Responsabilidade passa a ser N:N em Iniciativa, Experimento e nos dois modelos
-- de Checkpoint (incluindo subcheckpoints, que são linhas da mesma tabela).
--
-- Não há "responsável principal": a coluna `memberId` sai e o responsável atual
-- de cada item vira a PRIMEIRA linha da tabela de junção. Nenhum vínculo é
-- perdido — o INSERT ... SELECT abaixo roda ANTES do DROP COLUMN.
--
-- Precedente: `20260414235900_add_multiple_responsibles` fez isso para
-- Iniciativa/Experimento e foi revertida em `20260415060000` com um
-- `DROP TABLE` seco, o que perdeu os vínculos daquela época. Aqui a ordem
-- (criar → copiar → dropar) é o que evita repetir aquilo.

-- CreateTable: tabelas de junção (formato implícito do Prisma: colunas A/B)
CREATE TABLE "_IniciativaToTeamMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_IniciativaToTeamMember_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_ExperimentoToTeamMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ExperimentoToTeamMember_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_InitiativeCheckpointToTeamMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_InitiativeCheckpointToTeamMember_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_ExperimentoCheckpointToTeamMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ExperimentoCheckpointToTeamMember_AB_pkey" PRIMARY KEY ("A","B")
);

-- Migração dos dados: o responsável único de hoje vira o único responsável da
-- lista. Roda antes do DROP COLUMN — sem isso, o vínculo se perde.
INSERT INTO "_IniciativaToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "Iniciativa" WHERE "memberId" IS NOT NULL;

INSERT INTO "_ExperimentoToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "Experimento" WHERE "memberId" IS NOT NULL;

INSERT INTO "_InitiativeCheckpointToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "InitiativeCheckpoint" WHERE "memberId" IS NOT NULL;

INSERT INTO "_ExperimentoCheckpointToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "ExperimentoCheckpoint" WHERE "memberId" IS NOT NULL;

-- CreateIndex: o lado A já é coberto pela PK composta; o B precisa do seu
-- (é por ele que se responde "o que é da fulana?").
CREATE INDEX "_IniciativaToTeamMember_B_index" ON "_IniciativaToTeamMember"("B");
CREATE INDEX "_ExperimentoToTeamMember_B_index" ON "_ExperimentoToTeamMember"("B");
CREATE INDEX "_InitiativeCheckpointToTeamMember_B_index" ON "_InitiativeCheckpointToTeamMember"("B");
CREATE INDEX "_ExperimentoCheckpointToTeamMember_B_index" ON "_ExperimentoCheckpointToTeamMember"("B");

-- AddForeignKey
ALTER TABLE "_IniciativaToTeamMember" ADD CONSTRAINT "_IniciativaToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_IniciativaToTeamMember" ADD CONSTRAINT "_IniciativaToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_ExperimentoToTeamMember" ADD CONSTRAINT "_ExperimentoToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ExperimentoToTeamMember" ADD CONSTRAINT "_ExperimentoToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_InitiativeCheckpointToTeamMember" ADD CONSTRAINT "_InitiativeCheckpointToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "InitiativeCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_InitiativeCheckpointToTeamMember" ADD CONSTRAINT "_InitiativeCheckpointToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_ExperimentoCheckpointToTeamMember" ADD CONSTRAINT "_ExperimentoCheckpointToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "ExperimentoCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ExperimentoCheckpointToTeamMember" ADD CONSTRAINT "_ExperimentoCheckpointToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey / DropIndex / DropColumn: o responsável único sai de cena.
ALTER TABLE "Iniciativa" DROP CONSTRAINT IF EXISTS "Iniciativa_memberId_fkey";
ALTER TABLE "Experimento" DROP CONSTRAINT IF EXISTS "Experimento_memberId_fkey";
ALTER TABLE "InitiativeCheckpoint" DROP CONSTRAINT IF EXISTS "InitiativeCheckpoint_memberId_fkey";
ALTER TABLE "ExperimentoCheckpoint" DROP CONSTRAINT IF EXISTS "ExperimentoCheckpoint_memberId_fkey";

DROP INDEX IF EXISTS "Iniciativa_memberId_idx";
DROP INDEX IF EXISTS "Experimento_memberId_idx";
DROP INDEX IF EXISTS "InitiativeCheckpoint_memberId_idx";
DROP INDEX IF EXISTS "ExperimentoCheckpoint_memberId_idx";

ALTER TABLE "Iniciativa" DROP COLUMN "memberId";
ALTER TABLE "Experimento" DROP COLUMN "memberId";
ALTER TABLE "InitiativeCheckpoint" DROP COLUMN "memberId";
ALTER TABLE "ExperimentoCheckpoint" DROP COLUMN "memberId";
