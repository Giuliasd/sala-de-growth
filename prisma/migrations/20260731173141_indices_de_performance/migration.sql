-- Índices de performance.
--
-- Até aqui o banco só tinha 6 índices além das primary keys: 3 unique
-- (TeamMember.email, Invite.email, Invite.token) e 3 das tabelas de junção
-- many-to-many. Nenhuma coluna de FK e nenhuma coluna de filtro era indexada —
-- o Postgres não indexa foreign key automaticamente (ao contrário do MySQL), e
-- o Prisma também não gera esses índices para Postgres.
--
-- Consequência: toda listagem virava sequential scan. Os casos mais caros:
--   * Iniciativa/Experimento filtram (quarterId, deletedAt) em quase toda tela.
--   * O detalhe de iniciativa desce 3 níveis de subcheckpoint; o Prisma resolve
--     cada nível com uma query separada (WHERE parentId IN (...)), então eram
--     ~4 scans completos da tabela de checkpoints por abertura de página.
--   * Ausência é sempre lida por janela de datas (dashboard, roadmap, ausências).
--
-- Nota operacional: CREATE INDEX pega um lock que bloqueia ESCRITA na tabela
-- (leitura segue livre). Nas tabelas deste app isso é questão de milissegundos.
-- CREATE INDEX CONCURRENTLY não é opção aqui porque o Prisma roda a migration
-- dentro de uma transação, e CONCURRENTLY não pode rodar em transação.

-- CreateIndex
CREATE INDEX "Invite_createdById_idx" ON "Invite"("createdById");

-- CreateIndex
CREATE INDEX "Objetivo_quarterId_idx" ON "Objetivo"("quarterId");

-- CreateIndex
CREATE INDEX "OKR_quarterId_idx" ON "OKR"("quarterId");

-- CreateIndex
CREATE INDEX "OKR_frenteId_idx" ON "OKR"("frenteId");

-- CreateIndex
CREATE INDEX "OKR_objetivoId_idx" ON "OKR"("objetivoId");

-- CreateIndex
CREATE INDEX "OKRUpdate_okrId_idx" ON "OKRUpdate"("okrId");

-- CreateIndex
CREATE INDEX "OKRUpdate_memberId_idx" ON "OKRUpdate"("memberId");

-- CreateIndex
CREATE INDEX "Iniciativa_quarterId_deletedAt_idx" ON "Iniciativa"("quarterId", "deletedAt");

-- CreateIndex
CREATE INDEX "Iniciativa_memberId_idx" ON "Iniciativa"("memberId");

-- CreateIndex
CREATE INDEX "Iniciativa_frenteId_idx" ON "Iniciativa"("frenteId");

-- CreateIndex
CREATE INDEX "Iniciativa_okrId_idx" ON "Iniciativa"("okrId");

-- CreateIndex
CREATE INDEX "Iniciativa_status_idx" ON "Iniciativa"("status");

-- CreateIndex
CREATE INDEX "Iniciativa_endDate_idx" ON "Iniciativa"("endDate");

-- CreateIndex
CREATE INDEX "InitiativeComment_initiativeId_idx" ON "InitiativeComment"("initiativeId");

-- CreateIndex
CREATE INDEX "InitiativeComment_memberId_idx" ON "InitiativeComment"("memberId");

-- CreateIndex
CREATE INDEX "InitiativeCheckpoint_initiativeId_idx" ON "InitiativeCheckpoint"("initiativeId");

-- CreateIndex
CREATE INDEX "InitiativeCheckpoint_parentId_idx" ON "InitiativeCheckpoint"("parentId");

-- CreateIndex
CREATE INDEX "InitiativeCheckpoint_memberId_idx" ON "InitiativeCheckpoint"("memberId");

-- CreateIndex
CREATE INDEX "InitiativeCheckpoint_dueDate_idx" ON "InitiativeCheckpoint"("dueDate");

-- CreateIndex
CREATE INDEX "InitiativeCheckpoint_startDate_idx" ON "InitiativeCheckpoint"("startDate");

-- CreateIndex
CREATE INDEX "Experimento_quarterId_deletedAt_idx" ON "Experimento"("quarterId", "deletedAt");

-- CreateIndex
CREATE INDEX "Experimento_memberId_idx" ON "Experimento"("memberId");

-- CreateIndex
CREATE INDEX "Experimento_frenteId_idx" ON "Experimento"("frenteId");

-- CreateIndex
CREATE INDEX "Experimento_okrId_idx" ON "Experimento"("okrId");

-- CreateIndex
CREATE INDEX "Experimento_status_idx" ON "Experimento"("status");

-- CreateIndex
CREATE INDEX "Experimento_iceScore_idx" ON "Experimento"("iceScore");

-- CreateIndex
CREATE INDEX "ExperimentoComment_experimentoId_idx" ON "ExperimentoComment"("experimentoId");

-- CreateIndex
CREATE INDEX "ExperimentoComment_memberId_idx" ON "ExperimentoComment"("memberId");

-- CreateIndex
CREATE INDEX "ExperimentoCheckpoint_experimentoId_idx" ON "ExperimentoCheckpoint"("experimentoId");

-- CreateIndex
CREATE INDEX "ExperimentoCheckpoint_parentId_idx" ON "ExperimentoCheckpoint"("parentId");

-- CreateIndex
CREATE INDEX "ExperimentoCheckpoint_memberId_idx" ON "ExperimentoCheckpoint"("memberId");

-- CreateIndex
CREATE INDEX "ExperimentoCheckpoint_dueDate_idx" ON "ExperimentoCheckpoint"("dueDate");

-- CreateIndex
CREATE INDEX "ExperimentoCheckpoint_startDate_idx" ON "ExperimentoCheckpoint"("startDate");

-- CreateIndex
CREATE INDEX "Ausencia_startDate_endDate_idx" ON "Ausencia"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Ausencia_memberId_idx" ON "Ausencia"("memberId");

-- CreateIndex
CREATE INDEX "PlaybookLink_sectionId_idx" ON "PlaybookLink"("sectionId");

-- CreateIndex
CREATE INDEX "Acao_responsavelId_idx" ON "Acao"("responsavelId");

-- CreateIndex
CREATE INDEX "Acao_iniciativaId_idx" ON "Acao"("iniciativaId");

-- CreateIndex
CREATE INDEX "Acao_experimentoId_idx" ON "Acao"("experimentoId");

-- CreateIndex
CREATE INDEX "Acao_deletedAt_idx" ON "Acao"("deletedAt");

-- CreateIndex
CREATE INDEX "Acao_dataInicio_dataFim_idx" ON "Acao"("dataInicio", "dataFim");
