CREATE TABLE "PostingRequirements" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"mustHave" text DEFAULT '[]' NOT NULL,
	"niceToHave" text DEFAULT '[]' NOT NULL,
	"keywords" text DEFAULT '[]' NOT NULL,
	"seniority" text,
	"postingHash" text NOT NULL,
	"promptVersion" integer NOT NULL,
	"generatedAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "PostingRequirements_applicationId_unique" UNIQUE("applicationId")
);
--> statement-breakpoint
ALTER TABLE "PostingRequirements" ADD CONSTRAINT "PostingRequirements_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;