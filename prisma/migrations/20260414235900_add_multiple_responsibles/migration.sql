-- CreateTable: junction tables for many-to-many
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

CREATE TABLE "_OKRToTeamMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_OKRToTeamMember_AB_pkey" PRIMARY KEY ("A","B")
);

-- Migrate existing single memberId to junction tables (before dropping columns)
INSERT INTO "_IniciativaToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "Iniciativa" WHERE "memberId" IS NOT NULL;

INSERT INTO "_ExperimentoToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "Experimento" WHERE "memberId" IS NOT NULL;

INSERT INTO "_OKRToTeamMember" ("A", "B")
SELECT "id", "memberId" FROM "OKR" WHERE "memberId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "_IniciativaToTeamMember_B_index" ON "_IniciativaToTeamMember"("B");
CREATE INDEX "_ExperimentoToTeamMember_B_index" ON "_ExperimentoToTeamMember"("B");
CREATE INDEX "_OKRToTeamMember_B_index" ON "_OKRToTeamMember"("B");

-- AddForeignKey for junction tables
ALTER TABLE "_IniciativaToTeamMember" ADD CONSTRAINT "_IniciativaToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_IniciativaToTeamMember" ADD CONSTRAINT "_IniciativaToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_ExperimentoToTeamMember" ADD CONSTRAINT "_ExperimentoToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ExperimentoToTeamMember" ADD CONSTRAINT "_ExperimentoToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_OKRToTeamMember" ADD CONSTRAINT "_OKRToTeamMember_A_fkey"
    FOREIGN KEY ("A") REFERENCES "OKR"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_OKRToTeamMember" ADD CONSTRAINT "_OKRToTeamMember_B_fkey"
    FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey (old single-member FKs)
ALTER TABLE "Iniciativa" DROP CONSTRAINT IF EXISTS "Iniciativa_memberId_fkey";
ALTER TABLE "Experimento" DROP CONSTRAINT IF EXISTS "Experimento_memberId_fkey";
ALTER TABLE "OKR" DROP CONSTRAINT IF EXISTS "OKR_memberId_fkey";

-- DropColumn
ALTER TABLE "Iniciativa" DROP COLUMN IF EXISTS "memberId";
ALTER TABLE "Experimento" DROP COLUMN IF EXISTS "memberId";
ALTER TABLE "OKR" DROP COLUMN IF EXISTS "memberId";
