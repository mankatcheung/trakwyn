ALTER TABLE "User" ADD COLUMN "documentBytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "User" SET "documentBytes" = totals.bytes FROM (SELECT a."userId" AS "userId", SUM(d."sizeBytes") AS bytes FROM "Document" d INNER JOIN "JobApplication" a ON a."id" = d."applicationId" GROUP BY a."userId") AS totals WHERE "User"."id" = totals."userId";
