ALTER TABLE "User" ADD COLUMN "onboardingGoals" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" timestamp (3) with time zone;--> statement-breakpoint
-- JEF-460: everyone who already has an account has been using the app, so they never see the welcome flow.
UPDATE "User" SET "onboardingCompletedAt" = now() WHERE "onboardingCompletedAt" IS NULL;
