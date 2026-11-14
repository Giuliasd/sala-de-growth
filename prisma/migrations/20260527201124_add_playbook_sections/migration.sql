-- AlterTable
ALTER TABLE "PlaybookLink" ADD COLUMN     "sectionId" TEXT;

-- CreateTable
CREATE TABLE "PlaybookSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookSection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlaybookLink" ADD CONSTRAINT "PlaybookLink_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PlaybookSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
