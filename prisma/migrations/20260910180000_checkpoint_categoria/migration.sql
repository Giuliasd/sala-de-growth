-- Categoria do checkpoint. Nula = checkpoint comum, que é a maioria — por isso
-- a coluna é nulável e não tem default: nenhum checkpoint existente vira
-- "comunicação" por acidente.
--
-- Enum e não boolean para caber mais categoria depois sem trocar o tipo.
--
-- As duas tabelas de checkpoint são paralelas (InitiativeCheckpoint e
-- ExperimentoCheckpoint): mexer em uma sem a outra deixa a feature pela metade.

-- CreateEnum
CREATE TYPE "CheckpointCategoria" AS ENUM ('COMUNICACAO');

-- AlterTable
ALTER TABLE "InitiativeCheckpoint" ADD COLUMN "categoria" "CheckpointCategoria";

-- AlterTable
ALTER TABLE "ExperimentoCheckpoint" ADD COLUMN "categoria" "CheckpointCategoria";
