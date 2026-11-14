-- Ordem manual das tags de checkpoint (arrastar no gerenciador de tags). Ela
-- define a ordem dos grupos na visão segmentada por tag.
ALTER TABLE "CheckpointTag" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Tags existentes mantêm a ordem em que apareciam no gerenciador: criação.
UPDATE "CheckpointTag" t
SET "order" = o.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY COALESCE("iniciativaId", "experimentoId")
    ORDER BY "createdAt", id
  ) - 1 AS rn
  FROM "CheckpointTag"
) o
WHERE t.id = o.id;
