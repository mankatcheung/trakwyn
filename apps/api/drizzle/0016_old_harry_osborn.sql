ALTER TABLE "User" ADD COLUMN "aiCreditsUsed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "aiCreditsPeriodStart" timestamp (3) with time zone;