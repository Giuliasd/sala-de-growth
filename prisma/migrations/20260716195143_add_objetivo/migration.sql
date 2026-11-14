-- AlterTable
ALTER TABLE "OKR" ADD COLUMN     "objetivoId" TEXT;

-- CreateTable
CREATE TABLE "Objetivo" (
    "id" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objetivo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Objetivo" ADD CONSTRAINT "Objetivo_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "Quarter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OKR" ADD CONSTRAINT "OKR_objetivoId_fkey" FOREIGN KEY ("objetivoId") REFERENCES "Objetivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: para cada quarter que já tem OKRs, cria um Objetivo "Geral" e
-- vincula todos os OKRs existentes daquele quarter a ele. Assim os OKRs atuais
-- continuam visíveis, agora dentro de um objetivo único (que a liderança pode
-- renomear/dividir depois).
INSERT INTO "Objetivo" ("id", "quarterId", "title", "description", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), q."quarterId", 'Geral', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "quarterId" FROM "OKR") q;

UPDATE "OKR" o
SET "objetivoId" = obj."id"
FROM "Objetivo" obj
WHERE obj."quarterId" = o."quarterId" AND o."objetivoId" IS NULL;
