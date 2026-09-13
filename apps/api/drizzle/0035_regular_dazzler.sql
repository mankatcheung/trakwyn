CREATE TABLE `CalendarConnection` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`provider` text NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`accessTokenExpiresAt` integer NOT NULL,
	`externalCalendarId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CalendarConnection_userId_provider_key` ON `CalendarConnection` (`userId`,`provider`);--> statement-breakpoint
CREATE INDEX `CalendarConnection_userId_idx` ON `CalendarConnection` (`userId`);--> statement-breakpoint
CREATE TABLE `CalendarSyncedEvent` (
	`id` text PRIMARY KEY NOT NULL,
	`calendarConnectionId` text NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` text NOT NULL,
	`externalEventId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`calendarConnectionId`) REFERENCES `CalendarConnection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CalendarSyncedEvent_connection_source_key` ON `CalendarSyncedEvent` (`calendarConnectionId`,`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `CalendarSyncedEvent_calendarConnectionId_idx` ON `CalendarSyncedEvent` (`calendarConnectionId`);