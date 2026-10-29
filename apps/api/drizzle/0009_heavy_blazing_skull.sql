CREATE TABLE "UserActionToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"purpose" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"usedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "deletionScheduledAt" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "UserActionToken" ADD CONSTRAINT "UserActionToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UserActionToken_userId_purpose_key" ON "UserActionToken" USING btree ("userId","purpose");--> statement-breakpoint
CREATE INDEX "UserActionToken_tokenHash_idx" ON "UserActionToken" USING btree ("tokenHash");