CREATE TABLE "ChatActionProposal" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"conversationId" text NOT NULL,
	"messageId" text,
	"toolName" text NOT NULL,
	"args" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"resolvedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ChatActionProposal" ADD CONSTRAINT "ChatActionProposal_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ChatActionProposal" ADD CONSTRAINT "ChatActionProposal_conversationId_Conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ChatActionProposal_conversationId_idx" ON "ChatActionProposal" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "ChatActionProposal_userId_idx" ON "ChatActionProposal" USING btree ("userId");