-- O histórico da Weekly (groupBy por checkpoint) e o ON DELETE SET NULL de cada
-- exclusão de checkpoint filtram por estas colunas sem weekStart; os únicos
-- existentes têm weekStart na frente e não servem. A tabela cresce toda semana.
CREATE INDEX "RegistroSemanal_initiativeCheckpointId_idx" ON "RegistroSemanal"("initiativeCheckpointId");
CREATE INDEX "RegistroSemanal_experimentoCheckpointId_idx" ON "RegistroSemanal"("experimentoCheckpointId");
