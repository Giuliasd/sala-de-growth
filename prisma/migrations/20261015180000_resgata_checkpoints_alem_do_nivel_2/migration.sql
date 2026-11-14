-- Resgata checkpoints gravados abaixo do nível 2 (0 = topo).
--
-- O arrastar-e-soltar da lista não conferia a profundidade ao soltar ANTES ou
-- DEPOIS de uma linha: um checkpoint com filhos solto ao lado de um sub-sub
-- levava os filhos para o nível 3 ou mais. A página só busca três níveis, então
-- esses checkpoints sumiam da tela — continuavam no banco, invisíveis.
--
-- Cada um volta para o nível 2, pendurado no ancestral de nível 1 do seu ramo
-- (o mesmo ramo onde estava). Nada é apagado; quem estava no nível 2 ou acima
-- não muda. Rodar de novo não faz nada.

WITH RECURSIVE arvore AS (
  SELECT id, 0 AS nivel, NULL::text AS ancestral_nivel_1
  FROM "InitiativeCheckpoint"
  WHERE "parentId" IS NULL
  UNION ALL
  SELECT c.id, a.nivel + 1, CASE WHEN a.nivel = 0 THEN c.id ELSE a.ancestral_nivel_1 END
  FROM "InitiativeCheckpoint" c
  JOIN arvore a ON c."parentId" = a.id
)
UPDATE "InitiativeCheckpoint" c
SET "parentId" = a.ancestral_nivel_1
FROM arvore a
WHERE c.id = a.id AND a.nivel > 2;

WITH RECURSIVE arvore AS (
  SELECT id, 0 AS nivel, NULL::text AS ancestral_nivel_1
  FROM "ExperimentoCheckpoint"
  WHERE "parentId" IS NULL
  UNION ALL
  SELECT c.id, a.nivel + 1, CASE WHEN a.nivel = 0 THEN c.id ELSE a.ancestral_nivel_1 END
  FROM "ExperimentoCheckpoint" c
  JOIN arvore a ON c."parentId" = a.id
)
UPDATE "ExperimentoCheckpoint" c
SET "parentId" = a.ancestral_nivel_1
FROM arvore a
WHERE c.id = a.id AND a.nivel > 2;
