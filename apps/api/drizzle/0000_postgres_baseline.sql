CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text,
	"name" text,
	"timezone" text,
	"targetRole" text,
	"emailVerifiedAt" timestamp (3) with time zone,
	"avatarKey" text,
	"weeklyDigestEnabled" boolean DEFAULT true NOT NULL,
	"digestFrequency" text DEFAULT 'weekly' NOT NULL,
	"lastDigestSentAt" timestamp (3) with time zone,
	"followUpRemindersEnabled" boolean DEFAULT true NOT NULL,
	"pushNotificationsEnabled" boolean DEFAULT false NOT NULL,
	"weeklyApplicationGoal" integer DEFAULT 5 NOT NULL,
	"applicationCount" integer DEFAULT 0 NOT NULL,
	"totpSecret" text,
	"totpEnabled" boolean DEFAULT false NOT NULL,
	"defaultLlmProvider" text,
	"customAiPrompt" text,
	"useCrossApplicationContext" boolean DEFAULT false NOT NULL,
	"llmFallbackWhenLimited" boolean DEFAULT false NOT NULL,
	"backupEmail" text,
	"backupEmailVerifiedAt" timestamp (3) with time zone,
	"onboardingChecklistDismissedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "BackupEmailVerificationToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"newBackupEmail" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"usedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "BackupEmailVerificationToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "EmailVerificationToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"newEmail" text,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"usedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "EmailVerificationToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "LoginEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "OAuthAccount" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"email" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PasswordResetToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"usedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "PasswordResetToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "SecurityEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"eventType" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"userAgent" text,
	"ipAddress" text,
	"deviceLabel" text,
	"location" text,
	"lastUsedAt" timestamp (3) with time zone NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"revokedAt" timestamp (3) with time zone,
	"currentRefreshTokenId" text,
	"previousRefreshTokenId" text,
	"previousRotatedAt" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "TotpBackupCode" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"codeHash" text NOT NULL,
	"usedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "TotpBackupCode_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
CREATE TABLE "ApiToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"tokenHash" text NOT NULL,
	"scope" text DEFAULT 'full' NOT NULL,
	"lastUsedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ApiToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "LlmApiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"apiKey" text NOT NULL,
	"model" text,
	"baseUrl" text,
	"monthlyTokenLimit" bigint,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LlmUsageEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"promptTokens" integer NOT NULL,
	"completionTokens" integer NOT NULL,
	"cacheReadTokens" integer,
	"cacheWriteTokens" integer,
	"estimated" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "McpOAuthAccessToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"clientId" text NOT NULL,
	"familyId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"scope" text NOT NULL,
	"audience" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"revokedAt" timestamp (3) with time zone,
	"lastUsedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "McpOAuthAccessToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "McpOAuthAuthorizationCode" (
	"id" text PRIMARY KEY NOT NULL,
	"codeHash" text NOT NULL,
	"familyId" text NOT NULL,
	"clientId" text NOT NULL,
	"userId" text NOT NULL,
	"redirectUri" text NOT NULL,
	"scope" text NOT NULL,
	"codeChallenge" text NOT NULL,
	"codeChallengeMethod" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"consumedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "McpOAuthAuthorizationCode_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
CREATE TABLE "McpOAuthClient" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirectUris" text NOT NULL,
	"revokedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "McpOAuthRefreshToken" (
	"id" text PRIMARY KEY NOT NULL,
	"tokenHash" text NOT NULL,
	"familyId" text NOT NULL,
	"clientId" text NOT NULL,
	"userId" text NOT NULL,
	"scope" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"usedAt" timestamp (3) with time zone,
	"revokedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "McpOAuthRefreshToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "ShareLink" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"tokenHash" text NOT NULL,
	"lastUsedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ShareLink_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "ActivityLog" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"actorId" text NOT NULL,
	"eventType" text NOT NULL,
	"payload" text NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ApplicationTag" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CompanyBriefing" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"content" text NOT NULL,
	"generatedAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "CompanyBriefing_applicationId_unique" UNIQUE("applicationId")
);
--> statement-breakpoint
CREATE TABLE "Contact" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"linkedinUrl" text,
	"notes" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Document" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"name" text NOT NULL,
	"mimeType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"storageKey" text NOT NULL,
	"documentType" text DEFAULT 'other' NOT NULL,
	"version" text,
	"sourceDraftId" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "Document_storageKey_unique" UNIQUE("storageKey")
);
--> statement-breakpoint
CREATE TABLE "DocumentDraft" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"contentJson" text DEFAULT '{}' NOT NULL,
	"plainText" text DEFAULT '' NOT NULL,
	"sourceDocumentId" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InterviewRound" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"scheduledAt" timestamp (3) with time zone,
	"completedAt" timestamp (3) with time zone,
	"interviewerName" text,
	"notes" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"pushNotificationSentAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "JobApplication" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"jobUrl" text,
	"location" text,
	"salaryRange" text,
	"description" text,
	"appliedAt" timestamp (3) with time zone,
	"starred" boolean DEFAULT false NOT NULL,
	"source" text,
	"followUpAt" timestamp (3) with time zone,
	"reminderSentAt" timestamp (3) with time zone,
	"boardPosition" integer DEFAULT 0 NOT NULL,
	"documentCount" integer DEFAULT 0 NOT NULL,
	"deletedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Note" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Offer" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"baseSalary" bigint NOT NULL,
	"bonus" bigint,
	"equity" text,
	"benefits" text,
	"costOfLivingAdjustment" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"period" text DEFAULT 'yearly' NOT NULL,
	"notes" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text,
	"llmProvider" text,
	"llmModel" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"toolTrace" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Notification" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"readAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PushSubscription" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text DEFAULT 'web' NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text,
	"auth" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "PushSubscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "Education" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"institution" text NOT NULL,
	"degree" text,
	"field" text,
	"startDate" timestamp (3) with time zone NOT NULL,
	"endDate" timestamp (3) with time zone,
	"description" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Skill" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"proficiency" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WorkExperience" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"startDate" timestamp (3) with time zone NOT NULL,
	"endDate" timestamp (3) with time zone,
	"description" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CookieConsent" (
	"id" text PRIMARY KEY NOT NULL,
	"analyticsAccepted" boolean NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"consentedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "BackupEmailVerificationToken" ADD CONSTRAINT "BackupEmailVerificationToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TotpBackupCode" ADD CONSTRAINT "TotpBackupCode_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LlmApiKey" ADD CONSTRAINT "LlmApiKey_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LlmUsageEvent" ADD CONSTRAINT "LlmUsageEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "McpOAuthAccessToken" ADD CONSTRAINT "McpOAuthAccessToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "McpOAuthAuthorizationCode" ADD CONSTRAINT "McpOAuthAuthorizationCode_clientId_McpOAuthClient_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."McpOAuthClient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "McpOAuthAuthorizationCode" ADD CONSTRAINT "McpOAuthAuthorizationCode_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "McpOAuthRefreshToken" ADD CONSTRAINT "McpOAuthRefreshToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ApplicationTag" ADD CONSTRAINT "ApplicationTag_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompanyBriefing" ADD CONSTRAINT "CompanyBriefing_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceDraftId_DocumentDraft_id_fk" FOREIGN KEY ("sourceDraftId") REFERENCES "public"."DocumentDraft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD CONSTRAINT "DocumentDraft_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DocumentDraft" ADD CONSTRAINT "DocumentDraft_sourceDocumentId_Document_id_fk" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."Document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Note" ADD CONSTRAINT "Note_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_applicationId_JobApplication_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."JobApplication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_Conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Education" ADD CONSTRAINT "Education_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "WorkExperience" ADD CONSTRAINT "WorkExperience_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "BackupEmailVerificationToken_userId_idx" ON "BackupEmailVerificationToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "LoginEvent_userId_idx" ON "LoginEvent" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Session_userId_idx" ON "Session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "TotpBackupCode_userId_idx" ON "TotpBackupCode" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "LlmApiKey_userId_idx" ON "LlmApiKey" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "LlmApiKey_userId_provider_key" ON "LlmApiKey" USING btree ("userId","provider");--> statement-breakpoint
CREATE INDEX "LlmUsageEvent_userId_idx" ON "LlmUsageEvent" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "LlmUsageEvent_userId_provider_idx" ON "LlmUsageEvent" USING btree ("userId","provider");--> statement-breakpoint
CREATE INDEX "McpOAuthAccessToken_userId_idx" ON "McpOAuthAccessToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "McpOAuthAccessToken_clientId_idx" ON "McpOAuthAccessToken" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "McpOAuthAccessToken_familyId_idx" ON "McpOAuthAccessToken" USING btree ("familyId");--> statement-breakpoint
CREATE INDEX "McpOAuthAccessToken_expiresAt_idx" ON "McpOAuthAccessToken" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "McpOAuthAuthorizationCode_clientId_idx" ON "McpOAuthAuthorizationCode" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "McpOAuthAuthorizationCode_familyId_idx" ON "McpOAuthAuthorizationCode" USING btree ("familyId");--> statement-breakpoint
CREATE INDEX "McpOAuthAuthorizationCode_userId_idx" ON "McpOAuthAuthorizationCode" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "McpOAuthAuthorizationCode_expiresAt_idx" ON "McpOAuthAuthorizationCode" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "McpOAuthClient_createdAt_idx" ON "McpOAuthClient" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "McpOAuthRefreshToken_familyId_idx" ON "McpOAuthRefreshToken" USING btree ("familyId");--> statement-breakpoint
CREATE INDEX "McpOAuthRefreshToken_userId_idx" ON "McpOAuthRefreshToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "McpOAuthRefreshToken_expiresAt_idx" ON "McpOAuthRefreshToken" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "ShareLink_userId_idx" ON "ShareLink" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ActivityLog_applicationId_idx" ON "ActivityLog" USING btree ("applicationId");--> statement-breakpoint
CREATE UNIQUE INDEX "ApplicationTag_applicationId_name_key" ON "ApplicationTag" USING btree ("applicationId","name");--> statement-breakpoint
CREATE INDEX "ApplicationTag_applicationId_idx" ON "ApplicationTag" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "Contact_applicationId_idx" ON "Contact" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "Document_applicationId_idx" ON "Document" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "DocumentDraft_applicationId_idx" ON "DocumentDraft" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "DocumentDraft_sourceDocumentId_idx" ON "DocumentDraft" USING btree ("sourceDocumentId");--> statement-breakpoint
CREATE INDEX "InterviewRound_applicationId_idx" ON "InterviewRound" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "JobApplication_userId_idx" ON "JobApplication" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "JobApplication_userId_status_idx" ON "JobApplication" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "JobApplication_deletedAt_idx" ON "JobApplication" USING btree ("deletedAt");--> statement-breakpoint
CREATE INDEX "Note_applicationId_idx" ON "Note" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "Offer_applicationId_idx" ON "Offer" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "Conversation_userId_idx" ON "Conversation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Message_conversationId_idx" ON "Message" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "Notification_userId_idx" ON "Notification" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification" USING btree ("userId","readAt");--> statement-breakpoint
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Education_userId_idx" ON "Education" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Skill_userId_idx" ON "Skill" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "WorkExperience_userId_idx" ON "WorkExperience" USING btree ("userId");