-- CreateTable
CREATE TABLE "TravaFerias" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravaFerias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravaFerias_startDate_endDate_idx" ON "TravaFerias"("startDate", "endDate");
