CREATE TABLE "ResumeGapDismissal" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"key" text NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ResumeGapDismissal" ADD CONSTRAINT "ResumeGapDismissal_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ResumeGapDismissal_applicationId_key_idx" ON "ResumeGapDismissal" USING btree ("applicationId","key");