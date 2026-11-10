CREATE TABLE "CalendarConnection" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"accessTokenExpiresAt" timestamp (3) with time zone NOT NULL,
	"externalCalendarId" text NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CalendarSyncedEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"calendarConnectionId" text NOT NULL,
	"sourceType" text NOT NULL,
	"sourceId" text NOT NULL,
	"externalEventId" text NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CalendarSyncedEvent" ADD CONSTRAINT "CalendarSyncedEvent_calendarConnectionId_CalendarConnection_id_fk" FOREIGN KEY ("calendarConnectionId") REFERENCES "public"."CalendarConnection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "CalendarConnection_userId_provider_key" ON "CalendarConnection" USING btree ("userId","provider");--> statement-breakpoint
CREATE INDEX "CalendarConnection_userId_idx" ON "CalendarConnection" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "CalendarSyncedEvent_connection_source_key" ON "CalendarSyncedEvent" USING btree ("calendarConnectionId","sourceType","sourceId");--> statement-breakpoint
CREATE INDEX "CalendarSyncedEvent_calendarConnectionId_idx" ON "CalendarSyncedEvent" USING btree ("calendarConnectionId");