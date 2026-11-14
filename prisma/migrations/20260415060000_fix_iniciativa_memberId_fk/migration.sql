-- Re-add memberId FK to Iniciativa (dropped by add_multiple_responsibles migration)
-- and clean up leftover join table

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

DROP TABLE IF EXISTS "_IniciativaToTeamMember";

-- Also handle Experimento join table cleanup (idempotent)
DROP TABLE IF EXISTS "_ExperimentoToTeamMember";
