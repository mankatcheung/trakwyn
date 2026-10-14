CREATE TABLE "ResumeAtsScore" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"documentDraftId" text,
	"documentId" text,
	"score" integer NOT NULL,
	"label" text NOT NULL,
	"readable" boolean NOT NULL,
	"checksJson" text DEFAULT '[]' NOT NULL,
	"generatedAt" timestamp (3) with time zone NOT NULL,
	"resumeTextHash" text NOT NULL,
	CONSTRAINT "ResumeAtsScore_documentDraftId_unique" UNIQUE("documentDraftId"),
	CONSTRAINT "ResumeAtsScore_documentId_unique" UNIQUE("documentId"),
	CONSTRAINT "ResumeAtsScore_one_resume_check" CHECK (("ResumeAtsScore"."documentDraftId" IS NOT NULL) <> ("ResumeAtsScore"."documentId" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ResumeAtsScore" ADD CONSTRAINT "ResumeAtsScore_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ResumeAtsScore" ADD CONSTRAINT "ResumeAtsScore_documentDraftId_DocumentDraft_id_fk" FOREIGN KEY ("documentDraftId") REFERENCES "public"."DocumentDraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ResumeAtsScore" ADD CONSTRAINT "ResumeAtsScore_documentId_Document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ResumeAtsScore_applicationId_idx" ON "ResumeAtsScore" USING btree ("applicationId");