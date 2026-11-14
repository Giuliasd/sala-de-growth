-- Nova categoria de checkpoint: MARCO, uma data relevante do projeto.
--
-- Não precisa de coluna nova: `categoria` já existe nas duas tabelas de
-- checkpoint (InitiativeCheckpoint e ExperimentoCheckpoint) e é do tipo
-- "CheckpointCategoria", então basta acrescentar o valor ao enum. Nenhum
-- checkpoint existente muda.
--
-- ADD VALUE é seguro aqui: o valor novo não é usado nesta mesma migration.

-- AlterEnum
ALTER TYPE "CheckpointCategoria" ADD VALUE 'MARCO';
