-- Registro da semana: cada checkpoint que fez parte da Weekly de uma semana,
-- com a foto congelada no fechamento (sexta, 14:59). Ver o model no schema.

-- CreateEnum
CREATE TYPE "OrigemNaSemana" AS ENUM ('PLANEJADO', 'ENTROU');

-- CreateEnum
CREATE TYPE "DesfechoNaSemana" AS ENUM ('CONCLUIDO', 'REMARCADO', 'ABERTO', 'EXCLUIDO', 'EM_ANDAMENTO');

-- CreateTable
CREATE TABLE "RegistroSemanal" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "initiativeCheckpointId" TEXT,
    "experimentoCheckpointId" TEXT,
    "iniciativaId" TEXT,
    "experimentoId" TEXT,
    "origem" "OrigemNaSemana" NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nome" TEXT NOT NULL,
    "caminho" TEXT,
    "categoria" "CheckpointCategoria",
    "prazoAoEntrar" TIMESTAMP(3) NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "inicio" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "responsaveisIds" TEXT[],
    "tags" JSONB NOT NULL DEFAULT '[]',
    "itemNome" TEXT NOT NULL,
    "itemStatus" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "frenteNome" TEXT NOT NULL,
    "remarcacoes" INTEGER NOT NULL DEFAULT 0,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" TEXT,
    "desfecho" "DesfechoNaSemana",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroSemanal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroSemanal_weekStart_idx" ON "RegistroSemanal"("weekStart");

-- CreateIndex
CREATE INDEX "RegistroSemanal_desfecho_weekStart_idx" ON "RegistroSemanal"("desfecho", "weekStart");

-- CreateIndex
CREATE INDEX "RegistroSemanal_iniciativaId_idx" ON "RegistroSemanal"("iniciativaId");

-- CreateIndex
CREATE INDEX "RegistroSemanal_experimentoId_idx" ON "RegistroSemanal"("experimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroSemanal_weekStart_initiativeCheckpointId_key" ON "RegistroSemanal"("weekStart", "initiativeCheckpointId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroSemanal_weekStart_experimentoCheckpointId_key" ON "RegistroSemanal"("weekStart", "experimentoCheckpointId");

-- AddForeignKey
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_initiativeCheckpointId_fkey" FOREIGN KEY ("initiativeCheckpointId") REFERENCES "InitiativeCheckpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_experimentoCheckpointId_fkey" FOREIGN KEY ("experimentoCheckpointId") REFERENCES "ExperimentoCheckpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_iniciativaId_fkey" FOREIGN KEY ("iniciativaId") REFERENCES "Iniciativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_experimentoId_fkey" FOREIGN KEY ("experimentoId") REFERENCES "Experimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_excluidoPorId_fkey" FOREIGN KEY ("excluidoPorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Um item só: o registro pertence a uma iniciativa OU a um experimento.
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_um_item"
    CHECK ((("iniciativaId" IS NOT NULL)::int + ("experimentoId" IS NOT NULL)::int) = 1);

-- No máximo um checkpoint: os dois ficam NULL quando o checkpoint é excluído
-- (ON DELETE SET NULL), e o registro continua contando que ele esteve na semana.
ALTER TABLE "RegistroSemanal" ADD CONSTRAINT "RegistroSemanal_um_checkpoint"
    CHECK ((("initiativeCheckpointId" IS NOT NULL)::int + ("experimentoCheckpointId" IS NOT NULL)::int) <= 1);
