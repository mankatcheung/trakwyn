CREATE TABLE "Award" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"date" timestamp (3) with time zone,
	"description" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Project" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"url" text,
	"startDate" timestamp (3) with time zone,
	"endDate" timestamp (3) with time zone,
	"description" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Award" ADD CONSTRAINT "Award_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Award_userId_idx" ON "Award" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Project_userId_idx" ON "Project" USING btree ("userId");