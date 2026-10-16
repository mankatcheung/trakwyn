CREATE TABLE "InterviewQuestion" (
	"id" text PRIMARY KEY NOT NULL,
	"interviewRoundId" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "InterviewRound" ADD COLUMN "questionCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_interviewRoundId_InterviewRound_id_fk" FOREIGN KEY ("interviewRoundId") REFERENCES "public"."InterviewRound"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "InterviewQuestion_interviewRoundId_idx" ON "InterviewQuestion" USING btree ("interviewRoundId");