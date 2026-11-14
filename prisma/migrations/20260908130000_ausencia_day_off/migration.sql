-- AlterEnum
-- O Postgres insere o valor na posição pedida; BEFORE 'OUTROS' mantém OUTROS
-- como último item do enum (é o balde "qualquer outra coisa").
ALTER TYPE "AusenciaType" ADD VALUE 'DAY_OFF' BEFORE 'OUTROS';
