-- CreateTable
CREATE TABLE "WeeklyAviso" (
    "weekStart" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "WeeklyAviso_pkey" PRIMARY KEY ("weekStart")
);

-- CreateIndex
CREATE INDEX "WeeklyAviso_updatedById_idx" ON "WeeklyAviso"("updatedById");

-- AddForeignKey
ALTER TABLE "WeeklyAviso" ADD CONSTRAINT "WeeklyAviso_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable
-- O card de comentários da Weekly deu lugar ao "Fique ligado". A tabela existiu
-- por um dia e nunca chegou a produção; deixá-la sem uso repetiria o caso da
-- tabela Acao, que ficou anos migrada sem interface.
DROP TABLE "WeeklyComment";
