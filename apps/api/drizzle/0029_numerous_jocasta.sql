CREATE TABLE "Certification" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issuedAt" timestamp (3) with time zone,
	"expiresAt" timestamp (3) with time zone,
	"credentialUrl" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Language" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"proficiency" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Language" ADD CONSTRAINT "Language_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Certification_userId_idx" ON "Certification" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Language_userId_idx" ON "Language" USING btree ("userId");