import { asFunction, Lifetime, type NameAndRegistrationPair, type Resolver } from 'awilix';

import { RateLimiter } from '#src/infrastructure/rateLimit/RateLimiter.js';
import { RedisRateLimiter } from '#src/infrastructure/rateLimit/RedisRateLimiter.js';
import { InstrumentedRateLimiter } from '#src/infrastructure/rateLimit/InstrumentedRateLimiter.js';
import { getRedisClient } from '#src/infrastructure/cache/redisClient.js';
import { RATE_LIMIT, RATE_LIMIT_RELAXED_MAX_ATTEMPTS } from '#src/http/constants.js';
import { ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

import type { Cradle } from './types.js';

/**
 * Selects RedisRateLimiter vs. the in-memory RateLimiter using the same
 * CACHE_PROVIDER toggle RedisCache uses, reusing the same shared Redis
 * client instance (see getRedisClient) rather than opening a second
 * connection. See JEF-160: the in-memory limiter's buckets aren't shared
 * across serverless instances, so it doesn't actually limit anything under
 * normal horizontal scaling.
 *
 * Every limiter is wrapped in `InstrumentedRateLimiter` so a rejection is
 * logged and counted (JEF-350) — here rather than at the call
 * sites, which is what makes the coverage total.
 */
function buildRateLimiter(
  name: string,
  maxAttempts: number,
  windowMs: number,
  logger: Cradle['logger'],
): IRateLimiter {
  const redis = getRedisClient();
  const inner = redis
    ? new RedisRateLimiter({ redis, maxAttempts, windowMs })
    : new RateLimiter(maxAttempts, windowMs);
  return new InstrumentedRateLimiter({ inner, name, logger });
}

/**
 * `asFunction`, not `asValue`: the limiter needs the `logger` the container
 * is given in `buildApp`, so it cannot be constructed at module load. A
 * SINGLETON either way — one set of buckets per process, resolved the first
 * time a use case asks for one.
 */
function limiter(
  name: string,
  policy: { MAX_ATTEMPTS: number; WINDOW_MS: number },
): Resolver<IRateLimiter> {
  return asFunction(
    ({ logger }: Cradle) => buildRateLimiter(name, policy.MAX_ATTEMPTS, policy.WINDOW_MS, logger),
    { lifetime: Lifetime.SINGLETON },
  );
}

/**
 * Like `limiter`, but the policy only bites in production (JEF-400): the
 * per-IP sign-up limit and the global verification-mail budget are shared
 * across everyone, so dev, e2e and the integration suites — which sign up
 * dozens of users from one address — would otherwise exhaust them. Read at
 * resolve time, not module load, so a test can set NODE_ENV first.
 */
function productionOnlyLimiter(
  name: string,
  policy: { MAX_ATTEMPTS: number; WINDOW_MS: number },
): Resolver<IRateLimiter> {
  return asFunction(
    ({ logger }: Cradle) => {
      const enforced = process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;
      const maxAttempts = enforced ? policy.MAX_ATTEMPTS : RATE_LIMIT_RELAXED_MAX_ATTEMPTS;
      return buildRateLimiter(name, maxAttempts, policy.WINDOW_MS, logger);
    },
    { lifetime: Lifetime.SINGLETON },
  );
}

export const rateLimiters = {
  passwordResetRateLimiter: limiter('passwordResetRateLimiter', RATE_LIMIT.PASSWORD_RESET_REQUEST),
  // Per-IP ceilings that every suite trips from one address (JEF-400, JEF-401),
  // so they bite only in production. The failed-login counter does not: it is
  // what triggers the captcha, and a test has to be able to reach it.
  loginRateLimiter: productionOnlyLimiter('loginRateLimiter', RATE_LIMIT.LOGIN),
  loginFailureRateLimiter: limiter('loginFailureRateLimiter', RATE_LIMIT.LOGIN_FAILURE),
  registerRateLimiter: productionOnlyLimiter('registerRateLimiter', RATE_LIMIT.REGISTER),
  registerWithoutCaptchaRateLimiter: productionOnlyLimiter(
    'registerWithoutCaptchaRateLimiter',
    RATE_LIMIT.REGISTER_WITHOUT_CAPTCHA,
  ),
  emailVerificationUserRateLimiter: limiter(
    'emailVerificationUserRateLimiter',
    RATE_LIMIT.EMAIL_VERIFICATION_USER,
  ),
  emailVerificationGlobalRateLimiter: productionOnlyLimiter(
    'emailVerificationGlobalRateLimiter',
    RATE_LIMIT.EMAIL_VERIFICATION_GLOBAL,
  ),
  totpRateLimiter: limiter('totpRateLimiter', RATE_LIMIT.TOTP_VERIFICATION),
  stepUpCodeRateLimiter: limiter('stepUpCodeRateLimiter', RATE_LIMIT.STEP_UP_CODE_SEND),
  accountDeletionRateLimiter: limiter(
    'accountDeletionRateLimiter',
    RATE_LIMIT.ACCOUNT_DELETION_REQUEST,
  ),
  // Per-IP and shared by everyone behind an address, so production only like
  // the sign-up limits (JEF-400): e2e drives the OAuth redirects dozens of times.
  oauthRateLimiter: productionOnlyLimiter('oauthRateLimiter', RATE_LIMIT.OAUTH_REDIRECT),
  documentFileRateLimiter: productionOnlyLimiter(
    'documentFileRateLimiter',
    RATE_LIMIT.DOCUMENT_FILE,
  ),
  chatRateLimiter: limiter('chatRateLimiter', RATE_LIMIT.CHAT_MESSAGE),
  generateResumeRateLimiter: limiter('generateResumeRateLimiter', RATE_LIMIT.GENERATE_RESUME),
  generateCoverLetterRateLimiter: limiter(
    'generateCoverLetterRateLimiter',
    RATE_LIMIT.GENERATE_COVER_LETTER,
  ),
  parseJobDescriptionRateLimiter: limiter(
    'parseJobDescriptionRateLimiter',
    RATE_LIMIT.PARSE_JOB_DESCRIPTION,
  ),
  parseCvRateLimiter: limiter('parseCvRateLimiter', RATE_LIMIT.PARSE_CV),
  computeResumeMatchScoreRateLimiter: limiter(
    'computeResumeMatchScoreRateLimiter',
    RATE_LIMIT.COMPUTE_RESUME_MATCH_SCORE,
  ),
  computeResumeAtsScoreRateLimiter: limiter(
    'computeResumeAtsScoreRateLimiter',
    RATE_LIMIT.COMPUTE_RESUME_ATS_SCORE,
  ),
  generateCompanyBriefingRateLimiter: limiter(
    'generateCompanyBriefingRateLimiter',
    RATE_LIMIT.GENERATE_COMPANY_BRIEFING,
  ),
  generateMockQuestionsRateLimiter: limiter(
    'generateMockQuestionsRateLimiter',
    RATE_LIMIT.GENERATE_MOCK_QUESTIONS,
  ),
  generateMockAnswerRateLimiter: limiter(
    'generateMockAnswerRateLimiter',
    RATE_LIMIT.GENERATE_MOCK_ANSWER,
  ),
  testLlmApiKeyRateLimiter: limiter('testLlmApiKeyRateLimiter', RATE_LIMIT.TEST_LLM_API_KEY),
  updatePasswordRateLimiter: limiter('updatePasswordRateLimiter', RATE_LIMIT.UPDATE_PASSWORD),
  requestEmailChangeRateLimiter: limiter(
    'requestEmailChangeRateLimiter',
    RATE_LIMIT.REQUEST_EMAIL_CHANGE,
  ),
  requestAddBackupEmailRateLimiter: limiter(
    'requestAddBackupEmailRateLimiter',
    RATE_LIMIT.REQUEST_ADD_BACKUP_EMAIL,
  ),
  removeBackupEmailRateLimiter: limiter(
    'removeBackupEmailRateLimiter',
    RATE_LIMIT.REMOVE_BACKUP_EMAIL,
  ),
  backupEmailRecoveryRateLimiter: limiter(
    'backupEmailRecoveryRateLimiter',
    RATE_LIMIT.BACKUP_EMAIL_RECOVERY,
  ),
  mcpOAuthRegistrationRateLimiter: limiter(
    'mcpOAuthRegistrationRateLimiter',
    RATE_LIMIT.MCP_OAUTH_REGISTRATION,
  ),
  mcpOAuthAuthorizationRateLimiter: limiter(
    'mcpOAuthAuthorizationRateLimiter',
    RATE_LIMIT.MCP_OAUTH_AUTHORIZATION,
  ),
  mcpOAuthTokenRateLimiter: limiter('mcpOAuthTokenRateLimiter', RATE_LIMIT.MCP_OAUTH_TOKEN),
  mcpOAuthRevocationRateLimiter: limiter(
    'mcpOAuthRevocationRateLimiter',
    RATE_LIMIT.MCP_OAUTH_REVOCATION,
  ),
  mcpToolCallReadRateLimiter: limiter('mcpToolCallReadRateLimiter', RATE_LIMIT.MCP_TOOL_CALL_READ),
  mcpToolCallWriteRateLimiter: limiter(
    'mcpToolCallWriteRateLimiter',
    RATE_LIMIT.MCP_TOOL_CALL_WRITE,
  ),
} satisfies NameAndRegistrationPair<Cradle>;
