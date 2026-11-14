-- AlterTable
ALTER TABLE "TeamMember" ALTER COLUMN "email" DROP NOT NULL;

-- Sem backfill: o apagamento do e-mail é aplicado apenas nas PRÓXIMAS
-- desativações (em toggleMemberActive), nunca retroativamente nos membros que já
-- estão inativos. Assim, ambientes que ainda não aplicaram esta migration (prod)
-- não perdem os e-mails dos inativos existentes.
