ALTER TABLE "MockInterviewQuestion" ADD COLUMN "talkingPoints" text;--> statement-breakpoint
ALTER TABLE "MockInterviewQuestion" ADD COLUMN "talkingPointsGeneratedAt" timestamp (3) with time zone;