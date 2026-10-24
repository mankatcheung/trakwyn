CREATE TABLE "BillingEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"processedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "billingCustomerId" text;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "billingSubscriptionId" text;--> statement-breakpoint
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;