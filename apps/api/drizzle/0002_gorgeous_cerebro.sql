CREATE TABLE "MockInterviewQuestion" (
	"id" text PRIMARY KEY NOT NULL,
	"interviewRoundId" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answerSource" text DEFAULT 'user' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "InterviewRound" ADD COLUMN "mockQuestionCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "MockInterviewQuestion" ADD CONSTRAINT "MockInterviewQuestion_interviewRoundId_InterviewRound_id_fk" FOREIGN KEY ("interviewRoundId") REFERENCES "public"."InterviewRound"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "MockInterviewQuestion_interviewRoundId_idx" ON "MockInterviewQuestion" USING btree ("interviewRoundId");