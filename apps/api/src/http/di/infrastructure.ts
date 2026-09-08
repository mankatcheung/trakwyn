import { nanoid } from 'nanoid';
import { asClass, asFunction, asValue, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { db } from '#src/infrastructure/db/client.js';

import type { ICache } from '#src/infrastructure/cache/ICache.js';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { RedisCache } from '#src/infrastructure/cache/RedisCache.js';
import { InstrumentedCache } from '#src/infrastructure/cache/InstrumentedCache.js';
import { getRedisClient } from '#src/infrastructure/cache/redisClient.js';
import type { ISessionBlocklist } from '#src/use-cases/ports/ISessionBlocklist.js';
import { MemorySessionBlocklist } from '#src/infrastructure/sessionBlocklist/MemorySessionBlocklist.js';
import { RedisSessionBlocklist } from '#src/infrastructure/sessionBlocklist/RedisSessionBlocklist.js';
import { LocalStorageProvider } from '#src/infrastructure/storage/LocalStorageProvider.js';
import { VercelBlobStorageProvider } from '#src/infrastructure/storage/VercelBlobStorageProvider.js';
import { JwtTokenService } from '#src/infrastructure/auth/JwtTokenService.js';
import { TotpProvider } from '#src/infrastructure/auth/TotpProvider.js';
import { GoogleOAuthProvider } from '#src/infrastructure/auth/GoogleOAuthProvider.js';
import { GitHubOAuthProvider } from '#src/infrastructure/auth/GitHubOAuthProvider.js';
import {
  FakeGoogleOAuthProvider,
  FakeGitHubOAuthProvider,
} from '#src/infrastructure/auth/FakeOAuthProvider.js';
import { OAuthProviderRegistry } from '#src/infrastructure/auth/OAuthProviderRegistry.js';
import { McpOAuthConsentService } from '#src/infrastructure/auth/McpOAuthConsentService.js';
import { OAuthStateService } from '#src/infrastructure/auth/OAuthStateService.js';
import { MobileOAuthHandoffService } from '#src/infrastructure/auth/MobileOAuthHandoffService.js';
import { BrevoEmailService } from '#src/infrastructure/email/BrevoEmailService.js';
import { ConsoleEmailService } from '#src/infrastructure/email/ConsoleEmailService.js';
import { DeviceLabelService } from '#src/infrastructure/device/DeviceLabelService.js';
import { IpLocationService } from '#src/infrastructure/device/IpLocationService.js';
import { WebPushService } from '#src/infrastructure/push/WebPushService.js';
import { ExpoPushService } from '#src/infrastructure/push/ExpoPushService.js';
import { DrizzleTransactionManager } from '#src/infrastructure/db/DrizzleTransactionManager.js';
import { LlmApiKeyCipher } from '#src/infrastructure/llm/LlmApiKeyCipher.js';
import { OutboundUrlPolicy } from '#src/infrastructure/net/OutboundUrlPolicy.js';
import { UserLLMProviderFactory } from '#src/infrastructure/llm/UserLLMProviderFactory.js';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { DocumentTextExtractor } from '#src/infrastructure/documents/DocumentTextExtractor.js';
import { ReactPdfDocumentRenderer } from '#src/infrastructure/pdf/ReactPdfDocumentRenderer.js';
import { FetchJobPostingSourceResolver } from '#src/infrastructure/jobDescription/FetchJobPostingSourceResolver.js';

import {
  EMAIL_PROVIDER,
  ENV,
  OAUTH_PROVIDER_MODE,
  STORAGE_PROVIDER,
} from '#src/infrastructure/config/constants.js';
import type { Cradle } from './types.js';

type StorageProviderConstructor = new () => LocalStorageProvider | VercelBlobStorageProvider;
const StorageProvider: StorageProviderConstructor =
  process.env[ENV.STORAGE_PROVIDER] === STORAGE_PROVIDER.VERCEL_BLOB
    ? VercelBlobStorageProvider
    : LocalStorageProvider;

type EmailServiceConstructor = new () => BrevoEmailService | ConsoleEmailService;
const EmailService: EmailServiceConstructor =
  process.env[ENV.EMAIL_PROVIDER] === EMAIL_PROVIDER.CONSOLE
    ? ConsoleEmailService
    : BrevoEmailService;

const useFakeOAuth = process.env[ENV.OAUTH_PROVIDER_MODE] === OAUTH_PROVIDER_MODE.FAKE;
type GoogleOAuthProviderConstructor = new () => GoogleOAuthProvider | FakeGoogleOAuthProvider;
type GitHubOAuthProviderConstructor = new () => GitHubOAuthProvider | FakeGitHubOAuthProvider;
const GoogleOAuthProviderImpl: GoogleOAuthProviderConstructor = useFakeOAuth
  ? FakeGoogleOAuthProvider
  : GoogleOAuthProvider;
const GitHubOAuthProviderImpl: GitHubOAuthProviderConstructor = useFakeOAuth
  ? FakeGitHubOAuthProvider
  : GitHubOAuthProvider;

function buildCache(): ICache {
  const redis = getRedisClient();
  const inner = redis ? new RedisCache({ redis }) : new MemoryCache();
  // Hit/miss counters are recorded at the port boundary so both
  // implementations are measured identically (JEF-129).
  return new InstrumentedCache({ inner });
}

/**
 * Selected by the same CACHE_PROVIDER toggle as the cache and rate limiter,
 * reusing the one shared Redis client. In-memory is dev/test-only: a
 * per-instance blocklist can't see a revocation that happened on another
 * serverless instance, which is exactly the case this needs to cover in
 * production (JEF-164).
 */
function buildSessionBlocklist(): ISessionBlocklist {
  const redis = getRedisClient();
  return redis ? new RedisSessionBlocklist({ redis }) : new MemorySessionBlocklist();
}

export const infrastructure = {
  db: asValue(db),
  storageProvider: asClass(StorageProvider, { lifetime: Lifetime.SINGLETON }),
  generateId: asValue(() => nanoid()),
  now: asValue(() => new Date()),
  webAppOrigin: asValue(
    process.env[ENV.CORS_ORIGIN]?.split(',')[0]?.trim() ?? 'http://localhost:3000',
  ),
  tokenService: asClass(JwtTokenService, { lifetime: Lifetime.SINGLETON }),
  cache: asValue(buildCache()),
  sessionBlocklist: asValue(buildSessionBlocklist()),
  transactionManager: asClass(DrizzleTransactionManager, { lifetime: Lifetime.SINGLETON }),
  totpProvider: asClass(TotpProvider, { lifetime: Lifetime.SINGLETON }),
  googleOAuthProvider: asClass(GoogleOAuthProviderImpl, { lifetime: Lifetime.SINGLETON }),
  gitHubOAuthProvider: asClass(GitHubOAuthProviderImpl, { lifetime: Lifetime.SINGLETON }),
  oauthProviderRegistry: asClass(OAuthProviderRegistry, { lifetime: Lifetime.SINGLETON }),
  oauthStateService: asClass(OAuthStateService, { lifetime: Lifetime.SINGLETON }),
  mobileOAuthHandoffService: asClass(MobileOAuthHandoffService, { lifetime: Lifetime.SINGLETON }),
  mcpOAuthConsentService: asClass(McpOAuthConsentService, { lifetime: Lifetime.SINGLETON }),
  emailService: asClass(EmailService, { lifetime: Lifetime.SINGLETON }),
  deviceLabeler: asClass(DeviceLabelService, { lifetime: Lifetime.SINGLETON }),
  ipLocationResolver: asClass(IpLocationService, { lifetime: Lifetime.SINGLETON }),
  webPushService: asClass(WebPushService, { lifetime: Lifetime.SINGLETON }),
  expoPushService: asClass(ExpoPushService, { lifetime: Lifetime.SINGLETON }),
  // Where the server may connect on a user's behalf (custom LLM base URLs,
  // job-posting links). Strict in production; see the class for why not
  // elsewhere.
  // asFunction, not asClass: the constructor takes an options object, and
  // Awilix's proxy injection would hand it the cradle instead — resolving
  // `options.strict` as a dependency named "strict".
  outboundUrlPolicy: asFunction(() => new OutboundUrlPolicy(), { lifetime: Lifetime.SINGLETON }),
  llmApiKeyCipher: asClass(LlmApiKeyCipher, { lifetime: Lifetime.SINGLETON }),
  userLlmProviderFactory: asClass(UserLLMProviderFactory, { lifetime: Lifetime.SINGLETON }),
  // Decorates the factory so a key past its monthly token limit is refused
  // before any AI feature can use it (JEF-258) — same inner/outer shape as
  // BlocklistingSessionRepository and the Cached*Repository family, so every
  // call site is covered without having to remember.
  llmProviderFactory: asClass(LimitEnforcingLLMProviderFactory, {
    lifetime: Lifetime.SINGLETON,
  }),
  documentTextExtractor: asClass(DocumentTextExtractor, { lifetime: Lifetime.SINGLETON }),
  pdfRenderer: asClass(ReactPdfDocumentRenderer, { lifetime: Lifetime.SINGLETON }),
  jobPostingSourceResolver: asClass(FetchJobPostingSourceResolver, {
    lifetime: Lifetime.SINGLETON,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
