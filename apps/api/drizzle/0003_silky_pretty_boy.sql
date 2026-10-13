CREATE TABLE "ResumeMatch" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"documentDraftId" text,
	"documentId" text,
	"score" integer NOT NULL,
	"label" text NOT NULL,
	"matchedKeywords" text DEFAULT '[]' NOT NULL,
	"missingKeywords" text DEFAULT '[]' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"generatedAt" timestamp (3) with time zone NOT NULL,
	"resumeTextHash" text NOT NULL,
	CONSTRAINT "ResumeMatch_documentDraftId_unique" UNIQUE("documentDraftId"),
	CONSTRAINT "ResumeMatch_documentId_unique" UNIQUE("documentId"),
	CONSTRAINT "ResumeMatch_one_resume_check" CHECK (("ResumeMatch"."documentDraftId" IS NOT NULL) <> ("ResumeMatch"."documentId" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ResumeMatch" ADD CONSTRAINT "ResumeMatch_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ResumeMatch" ADD CONSTRAINT "ResumeMatch_documentDraftId_DocumentDraft_id_fk" FOREIGN KEY ("documentDraftId") REFERENCES "public"."DocumentDraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ResumeMatch" ADD CONSTRAINT "ResumeMatch_documentId_Document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ResumeMatch_applicationId_idx" ON "ResumeMatch" USING btree ("applicationId");