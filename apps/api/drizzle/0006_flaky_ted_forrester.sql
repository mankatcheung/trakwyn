ALTER TABLE "User" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "planExpiresAt" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "planSource" text;