-- CreateEnum
CREATE TYPE "IniciativaStatus" AS ENUM ('BACKLOG', 'EM_ANDAMENTO', 'CONCLUIDA', 'PAUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ExperimentoStatus" AS ENUM ('BACKLOG', 'EM_ANDAMENTO', 'CONCLUIDO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "IceAction" AS ENUM ('EXECUTAR_AGORA', 'EM_SEGUIDA', 'BACKLOG', 'ARQUIVAR');

-- CreateEnum
CREATE TYPE "AusenciaType" AS ENUM ('FERIAS', 'LICENCA_MEDICA', 'LICENCA_MATERNIDADE', 'OUTROS');

-- CreateTable
CREATE TABLE "Quarter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Frente" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Frente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OKR" (
    "id" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "initialValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OKR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OKRUpdate" (
    "id" TEXT NOT NULL,
    "okrId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OKRUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Iniciativa" (
    "id" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "okrId" TEXT,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IniciativaStatus" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "docLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Iniciativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experimento" (
    "id" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "okrId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" "ExperimentoStatus" NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effortScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iceAction" "IceAction" NOT NULL DEFAULT 'BACKLOG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Experimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ausencia" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "AusenciaType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_email_key" ON "TeamMember"("email");

-- AddForeignKey
ALTER TABLE "OKR" ADD CONSTRAINT "OKR_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "Quarter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OKR" ADD CONSTRAINT "OKR_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OKRUpdate" ADD CONSTRAINT "OKRUpdate_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "OKR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OKRUpdate" ADD CONSTRAINT "OKRUpdate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iniciativa" ADD CONSTRAINT "Iniciativa_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "Quarter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iniciativa" ADD CONSTRAINT "Iniciativa_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iniciativa" ADD CONSTRAINT "Iniciativa_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "OKR"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iniciativa" ADD CONSTRAINT "Iniciativa_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "Quarter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "OKR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
