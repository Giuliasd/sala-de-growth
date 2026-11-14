-- CreateTable
CREATE TABLE "WeeklyComment" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "memberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyComment_weekStart_createdAt_idx" ON "WeeklyComment"("weekStart", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyComment_memberId_idx" ON "WeeklyComment"("memberId");

-- AddForeignKey
ALTER TABLE "WeeklyComment" ADD CONSTRAINT "WeeklyComment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
