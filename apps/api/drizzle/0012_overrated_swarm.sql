ALTER TABLE "LlmUsageEvent" ADD COLUMN "costMicros" bigint;--> statement-breakpoint
ALTER TABLE "LlmUsageEvent" ADD COLUMN "feature" text;--> statement-breakpoint
ALTER TABLE "LlmUsageEvent" ADD COLUMN "source" text DEFAULT 'byok' NOT NULL;--> statement-breakpoint
CREATE INDEX "LlmUsageEvent_userId_source_createdAt_idx" ON "LlmUsageEvent" USING btree ("userId","source","createdAt");