CREATE TABLE "AiFeedback" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"targetKind" text NOT NULL,
	"targetId" text NOT NULL,
	"feature" text NOT NULL,
	"rating" text NOT NULL,
	"reason" text,
	"provider" text,
	"model" text,
	"promptVersion" integer,
	"source" text,
	"tier" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD COLUMN "aiProvider" text;--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD COLUMN "aiModel" text;--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD COLUMN "aiPromptVersion" integer;--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD COLUMN "aiSource" text;--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD COLUMN "aiTier" text;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "aiProvider" text;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "aiModel" text;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "aiPromptVersion" integer;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "aiSource" text;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "aiTier" text;--> statement-breakpoint
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "AiFeedback_userId_targetKind_targetId_key" ON "AiFeedback" USING btree ("userId","targetKind","targetId");--> statement-breakpoint
CREATE INDEX "AiFeedback_feature_rating_idx" ON "AiFeedback" USING btree ("feature","rating");