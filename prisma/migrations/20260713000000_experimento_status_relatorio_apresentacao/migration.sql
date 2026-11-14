-- Novo fluxo de status de Experimento: remove CONCLUIDO e adiciona
-- RELATORIO_PRONTO e RESULTADOS_APRESENTADOS (após AGUARDANDO_RESULTADOS).
-- Os experimentos que estavam em CONCLUIDO passam a RELATORIO_PRONTO.
--
-- Postgres não permite remover valor de enum in-place, então recriamos o tipo.
-- O remapeamento acontece no próprio cast (CASE), de forma atômica — sem
-- ALTER TYPE ... ADD VALUE (que não pode ser usado na mesma transação).

CREATE TYPE "ExperimentoStatus_new" AS ENUM ('BACKLOG', 'EM_ANDAMENTO', 'AGUARDANDO_RESULTADOS', 'RELATORIO_PRONTO', 'RESULTADOS_APRESENTADOS', 'ARQUIVADO');

ALTER TABLE "Experimento"
  ALTER COLUMN "status" TYPE "ExperimentoStatus_new"
  USING (
    CASE "status"::text
      WHEN 'CONCLUIDO' THEN 'RELATORIO_PRONTO'
      ELSE "status"::text
    END::"ExperimentoStatus_new"
  );

DROP TYPE "ExperimentoStatus";
ALTER TYPE "ExperimentoStatus_new" RENAME TO "ExperimentoStatus";
