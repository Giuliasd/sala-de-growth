-- Horários do ritual configuráveis (fechamento da semana e fim do
-- planejamento), com vigência por semana. Sem linhas, vale o padrão do código:
-- sexta 14:59 / segunda 23:59. Ver o model no schema.

-- CreateTable
CREATE TABLE "HorarioDoRitual" (
    "id" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fechamentoDia" INTEGER NOT NULL,
    "fechamentoMinuto" INTEGER NOT NULL,
    "planejamentoDia" INTEGER NOT NULL,
    "planejamentoMinuto" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorarioDoRitual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HorarioDoRitual_vigenteDesde_key" ON "HorarioDoRitual"("vigenteDesde");
