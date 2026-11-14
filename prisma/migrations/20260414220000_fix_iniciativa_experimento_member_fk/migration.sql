-- Drop many-to-many join tables if they exist
DROP TABLE IF EXISTS "_IniciativaToTeamMember";
DROP TABLE IF EXISTS "_ExperimentoToTeamMember";

-- Add memberId FK to Iniciativa (idempotent)
ALTER TABLE "Iniciativa" ADD COLUMN IF NOT EXISTS "memberId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Iniciativa_memberId_fkey'
  ) THEN
    ALTER TABLE "Iniciativa" ADD CONSTRAINT "Iniciativa_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- Add memberId FK to Experimento (idempotent)
ALTER TABLE "Experimento" ADD COLUMN IF NOT EXISTS "memberId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Experimento_memberId_fkey'
  ) THEN
    ALTER TABLE "Experimento" ADD CONSTRAINT "Experimento_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
