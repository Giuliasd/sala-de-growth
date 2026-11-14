-- Histórico de KR é sempre lido por KR, do mais recente (sparkline, última
-- atualização, velocidade). O índice só por okrId obriga a ordenar depois.
CREATE INDEX "OKRUpdate_okrId_date_idx" ON "OKRUpdate"("okrId", "date");
