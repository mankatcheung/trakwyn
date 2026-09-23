import { asClass, asFunction, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { DrizzleApplicationRepository } from '#src/infrastructure/db/repositories/DrizzleApplicationRepository.js';
import { DrizzleNoteRepository } from '#src/infrastructure/db/repositories/DrizzleNoteRepository.js';
import { DrizzleDocumentRepository } from '#src/infrastructure/db/repositories/DrizzleDocumentRepository.js';
import { DrizzleDocumentDraftRepository } from '#src/infrastructure/db/repositories/DrizzleDocumentDraftRepository.js';
import { DrizzleCompanyBriefingRepository } from '#src/infrastructure/db/repositories/DrizzleCompanyBriefingRepository.js';
import { CachedApplicationRepository } from '#src/infrastructure/db/repositories/CachedApplicationRepository.js';
import { CachedNoteRepository } from '#src/infrastructure/db/repositories/CachedNoteRepository.js';
import { CachedApiTokenRepository } from '#src/infrastructure/db/repositories/CachedApiTokenRepository.js';
import { CachedContactRepository } from '#src/infrastructure/db/repositories/CachedContactRepository.js';
import { CachedNotificationRepository } from '#src/infrastructure/db/repositories/CachedNotificationRepository.js';
import { CachedDocumentRepository } from '#src/infrastructure/db/repositories/CachedDocumentRepository.js';
import { DrizzleInterviewRoundRepository } from '#src/infrastructure/db/repositories/DrizzleInterviewRoundRepository.js';
import { CachedInterviewRoundRepository } from '#src/infrastructure/db/repositories/CachedInterviewRoundRepository.js';
import { CachedUserRepository } from '#src/infrastructure/db/repositories/CachedUserRepository.js';
import { CachedSkillRepository } from '#src/infrastructure/db/repositories/CachedSkillRepository.js';
import { CachedEducationRepository } from '#src/infrastructure/db/repositories/CachedEducationRepository.js';
import { CachedWorkExperienceRepository } from '#src/infrastructure/db/repositories/CachedWorkExperienceRepository.js';
import { DrizzleActivityLogRepository } from '#src/infrastructure/db/repositories/DrizzleActivityLogRepository.js';
import { DrizzlePushSubscriptionRepository } from '#src/infrastructure/db/repositories/DrizzlePushSubscriptionRepository.js';
import { DrizzleContactRepository } from '#src/infrastructure/db/repositories/DrizzleContactRepository.js';
import { DrizzlePasswordResetTokenRepository } from '#src/infrastructure/db/repositories/DrizzlePasswordResetTokenRepository.js';
import { DrizzleLoginEventRepository } from '#src/infrastructure/db/repositories/DrizzleLoginEventRepository.js';
import { DrizzleSecurityEventRepository } from '#src/infrastructure/db/repositories/DrizzleSecurityEventRepository.js';
import { LoggingSecurityEventRepository } from '#src/infrastructure/db/repositories/LoggingSecurityEventRepository.js';
import { DrizzleCookieConsentRepository } from '#src/infrastructure/db/repositories/DrizzleCookieConsentRepository.js';
import { DrizzleSessionRepository } from '#src/infrastructure/db/repositories/DrizzleSessionRepository.js';
import { BlocklistingSessionRepository } from '#src/infrastructure/db/repositories/BlocklistingSessionRepository.js';
import { DrizzleWorkExperienceRepository } from '#src/infrastructure/db/repositories/DrizzleWorkExperienceRepository.js';
import { DrizzleEducationRepository } from '#src/infrastructure/db/repositories/DrizzleEducationRepository.js';
import { DrizzleSkillRepository } from '#src/infrastructure/db/repositories/DrizzleSkillRepository.js';
import { DrizzleMessageRepository } from '#src/infrastructure/db/repositories/DrizzleMessageRepository.js';
import { DrizzleConversationRepository } from '#src/infrastructure/db/repositories/DrizzleConversationRepository.js';
import { DrizzleEmailVerificationTokenRepository } from '#src/infrastructure/db/repositories/DrizzleEmailVerificationTokenRepository.js';
import { DrizzleTotpBackupCodeRepository } from '#src/infrastructure/db/repositories/DrizzleTotpBackupCodeRepository.js';
import { DrizzleBackupEmailVerificationTokenRepository } from '#src/infrastructure/db/repositories/DrizzleBackupEmailVerificationTokenRepository.js';
import { DrizzleOAuthAccountRepository } from '#src/infrastructure/db/repositories/DrizzleOAuthAccountRepository.js';
import { DrizzleApiTokenRepository } from '#src/infrastructure/db/repositories/DrizzleApiTokenRepository.js';
import { DrizzleMcpOAuthTokenRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthTokenRepository.js';
import { CachedMcpOAuthTokenRepository } from '#src/infrastructure/db/repositories/CachedMcpOAuthTokenRepository.js';
import { DrizzleMcpOAuthClientRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthClientRepository.js';
import { DrizzleMcpOAuthAuthorizationCodeRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthAuthorizationCodeRepository.js';
import { DrizzleMcpOAuthRefreshTokenRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthRefreshTokenRepository.js';
import { DrizzleMcpOAuthGrantRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthGrantRepository.js';
import { DrizzleShareLinkRepository } from '#src/infrastructure/db/repositories/DrizzleShareLinkRepository.js';
import { DrizzleNotificationRepository } from '#src/infrastructure/db/repositories/DrizzleNotificationRepository.js';
import { DrizzleLlmApiKeyRepository } from '#src/infrastructure/db/repositories/DrizzleLlmApiKeyRepository.js';
import { DrizzleLlmUsageEventRepository } from '#src/infrastructure/db/repositories/DrizzleLlmUsageEventRepository.js';
import { DrizzleOfferRepository } from '#src/infrastructure/db/repositories/DrizzleOfferRepository.js';

import type { Cradle } from './types.js';

export const repositories = {
  // Raw repositories (used internally by the cached decorators)
  drizzleUserRepository: asClass(DrizzleUserRepository, { lifetime: Lifetime.SINGLETON }),
  drizzleApplicationRepository: asClass(DrizzleApplicationRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleNoteRepository: asClass(DrizzleNoteRepository, { lifetime: Lifetime.SINGLETON }),
  drizzleDocumentRepository: asClass(DrizzleDocumentRepository, { lifetime: Lifetime.SINGLETON }),
  companyBriefingRepository: asClass(DrizzleCompanyBriefingRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  documentDraftRepository: asClass(DrizzleDocumentDraftRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleSkillRepository: asClass(DrizzleSkillRepository, { lifetime: Lifetime.SINGLETON }),
  drizzleEducationRepository: asClass(DrizzleEducationRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleWorkExperienceRepository: asClass(DrizzleWorkExperienceRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleApiTokenRepository: asClass(DrizzleApiTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleMcpOAuthTokenRepository: asClass(DrizzleMcpOAuthTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  mcpOAuthClientRepository: asClass(DrizzleMcpOAuthClientRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  mcpOAuthAuthorizationCodeRepository: asClass(DrizzleMcpOAuthAuthorizationCodeRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  mcpOAuthRefreshTokenRepository: asClass(DrizzleMcpOAuthRefreshTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  mcpOAuthGrantRepository: asClass(DrizzleMcpOAuthGrantRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleNotificationRepository: asClass(DrizzleNotificationRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleContactRepository: asClass(DrizzleContactRepository, {
    lifetime: Lifetime.SINGLETON,
  }),

  // Cached repository decorators (what use-cases consume)
  applicationRepository: asClass(CachedApplicationRepository, { lifetime: Lifetime.SINGLETON }),
  noteRepository: asClass(CachedNoteRepository, { lifetime: Lifetime.SINGLETON }),
  documentRepository: asClass(CachedDocumentRepository, { lifetime: Lifetime.SINGLETON }),
  drizzleInterviewRoundRepository: asClass(DrizzleInterviewRoundRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  interviewRoundRepository: asClass(CachedInterviewRoundRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  userRepository: asClass(CachedUserRepository, { lifetime: Lifetime.SINGLETON }),
  skillRepository: asClass(CachedSkillRepository, { lifetime: Lifetime.SINGLETON }),
  educationRepository: asClass(CachedEducationRepository, { lifetime: Lifetime.SINGLETON }),
  workExperienceRepository: asClass(CachedWorkExperienceRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  apiTokenRepository: asClass(CachedApiTokenRepository, { lifetime: Lifetime.SINGLETON }),
  mcpOAuthTokenRepository: asClass(CachedMcpOAuthTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  shareLinkRepository: asClass(DrizzleShareLinkRepository, { lifetime: Lifetime.SINGLETON }),
  contactRepository: asClass(CachedContactRepository, { lifetime: Lifetime.SINGLETON }),
  notificationRepository: asClass(CachedNotificationRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  activityLogRepository: asClass(DrizzleActivityLogRepository, { lifetime: Lifetime.SINGLETON }),
  pushSubscriptionRepository: asClass(DrizzlePushSubscriptionRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  passwordResetTokenRepository: asClass(DrizzlePasswordResetTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  loginEventRepository: asClass(DrizzleLoginEventRepository, { lifetime: Lifetime.SINGLETON }),
  drizzleSecurityEventRepository: asClass(DrizzleSecurityEventRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  // Logs and counts every security event as it is written (JEF-354) — see
  // LoggingSecurityEventRepository. `asFunction` rather than `asClass`, as
  // with `outboundUrlPolicy`: under proxy injection `metrics` would be
  // resolved as a registration instead of falling back to its default.
  securityEventRepository: asFunction(
    ({ drizzleSecurityEventRepository, logger }: Cradle) =>
      new LoggingSecurityEventRepository({ inner: drizzleSecurityEventRepository, logger }),
    { lifetime: Lifetime.SINGLETON },
  ),
  cookieConsentRepository: asClass(DrizzleCookieConsentRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  messageRepository: asClass(DrizzleMessageRepository, { lifetime: Lifetime.SINGLETON }),
  conversationRepository: asClass(DrizzleConversationRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  llmApiKeyRepository: asClass(DrizzleLlmApiKeyRepository, { lifetime: Lifetime.SINGLETON }),
  llmUsageEventRepository: asClass(DrizzleLlmUsageEventRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  drizzleSessionRepository: asClass(DrizzleSessionRepository, { lifetime: Lifetime.SINGLETON }),
  // Decorates the Drizzle repository so every revocation path also
  // blocklists the affected session ids (JEF-164) — see
  // BlocklistingSessionRepository. Same inner/outer registration shape the
  // Cached*Repository decorators use.
  sessionRepository: asClass(BlocklistingSessionRepository, { lifetime: Lifetime.SINGLETON }),
  emailVerificationTokenRepository: asClass(DrizzleEmailVerificationTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  totpBackupCodeRepository: asClass(DrizzleTotpBackupCodeRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  backupEmailVerificationTokenRepository: asClass(DrizzleBackupEmailVerificationTokenRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  oauthAccountRepository: asClass(DrizzleOAuthAccountRepository, {
    lifetime: Lifetime.SINGLETON,
  }),
  offerRepository: asClass(DrizzleOfferRepository, { lifetime: Lifetime.SINGLETON }),
} satisfies NameAndRegistrationPair<Cradle>;
