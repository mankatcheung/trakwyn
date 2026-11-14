CREATE TABLE "DocumentDraftVersion" (
	"id" text PRIMARY KEY NOT NULL,
	"draftId" text NOT NULL,
	"contentJson" text NOT NULL,
	"plainText" text NOT NULL,
	"source" text NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "DocumentDraftVersion" ADD CONSTRAINT "DocumentDraftVersion_draftId_DocumentDraft_id_fk" FOREIGN KEY ("draftId") REFERENCES "public"."DocumentDraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "DocumentDraftVersion_draftId_createdAt_idx" ON "DocumentDraftVersion" USING btree ("draftId","createdAt");