-- JEF-692: account emails are stored trimmed and lowercased, and unique case-insensitively.
-- Stop, with the colliding addresses in the message, when two accounts differ only by case or
-- whitespace; those need merging or renaming by hand before this can apply.
DO $$
DECLARE
  collisions text;
BEGIN
  SELECT string_agg(normalised, ', ') INTO collisions
  FROM (
    SELECT lower(btrim("email")) AS normalised
    FROM "User"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) AS duplicated;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION 'JEF-692: accounts whose emails differ only by case or whitespace must be resolved first: %', collisions;
  END IF;
END
$$;--> statement-breakpoint
UPDATE "User" SET "email" = lower(btrim("email")), "backupEmail" = lower(btrim("backupEmail")) WHERE "email" <> lower(btrim("email")) OR "backupEmail" <> lower(btrim("backupEmail"));--> statement-breakpoint
ALTER TABLE "User" DROP CONSTRAINT "User_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" USING btree (lower("email"));
