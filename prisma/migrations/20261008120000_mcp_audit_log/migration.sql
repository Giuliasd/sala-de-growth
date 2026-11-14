-- CreateTable
CREATE TABLE "McpAuditLog" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpAuditLog_memberId_createdAt_idx" ON "McpAuditLog"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "McpAuditLog_createdAt_idx" ON "McpAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "McpAuditLog" ADD CONSTRAINT "McpAuditLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
