-- E-mail passa a ser gravado em minúsculas (ver src/lib/email.ts): o Google
-- devolve sempre minúsculo, e um cadastro/convite digitado com maiúsculas nunca
-- casava com o login.
--
-- Só toca linhas que mudariam E cujo e-mail em minúsculas ainda não existe em
-- outra linha — assim nunca viola o UNIQUE. Idempotente: rodar de novo não faz
-- nada. Linhas que sobrarem (conflito real de duplicidade) precisam de decisão
-- humana e ficam como estão.
UPDATE "TeamMember" AS t
SET "email" = lower(t."email")
WHERE t."email" IS NOT NULL
  AND t."email" <> lower(t."email")
  AND NOT EXISTS (
    SELECT 1 FROM "TeamMember" o
    WHERE o."email" = lower(t."email") AND o."id" <> t."id"
  );

UPDATE "Invite" AS i
SET "email" = lower(i."email")
WHERE i."email" <> lower(i."email")
  AND NOT EXISTS (
    SELECT 1 FROM "Invite" o
    WHERE o."email" = lower(i."email") AND o."id" <> i."id"
  );
