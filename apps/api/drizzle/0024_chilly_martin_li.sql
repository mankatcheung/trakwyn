ALTER TABLE "DocumentDraft" ADD COLUMN "aiTraceId" text;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "aiTraceId" text;--> statement-breakpoint
ALTER TABLE "AiFeedback" ADD COLUMN "traceId" text;