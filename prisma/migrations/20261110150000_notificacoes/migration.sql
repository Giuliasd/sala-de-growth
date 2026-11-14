-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('RESPONSAVEL_ADICIONADO', 'RESPONSAVEL_REMOVIDO', 'MENCAO', 'COMENTARIO', 'ITEM_CONVERTIDO', 'ITEM_DUPLICADO');

-- CreateEnum
CREATE TYPE "AlvoNotificacao" AS ENUM ('INICIATIVA', 'EXPERIMENTO', 'OKR', 'ACAO_SEMANA');

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "notificacoesSilenciadas" "TipoNotificacao"[] DEFAULT ARRAY[]::"TipoNotificacao"[];

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "autorId" TEXT,
    "tipo" "TipoNotificacao" NOT NULL,
    "alvo" "AlvoNotificacao" NOT NULL,
    "alvoId" TEXT NOT NULL,
    "alvoNome" TEXT NOT NULL,
    "subitem" TEXT,
    "trecho" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "lidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacao_destinatarioId_createdAt_idx" ON "Notificacao"("destinatarioId", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacao_destinatarioId_lidaEm_idx" ON "Notificacao"("destinatarioId", "lidaEm");

-- CreateIndex
CREATE INDEX "Notificacao_autorId_idx" ON "Notificacao"("autorId");

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

