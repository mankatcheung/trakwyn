import { asFunction, Lifetime, type NameAndRegistrationPair, type Resolver } from 'awilix';

import { RateLimiter } from '#src/infrastructure/rateLimit/RateLimiter.js';
import { RedisRateLimiter } from '#src/infrastructure/rateLimit/RedisRateLimiter.js';
import { InstrumentedRateLimiter } from '#src/infrastructure/rateLimit/InstrumentedRateLimiter.js';
import { getRedisClient } from '#src/infrastructure/cache/redisClient.js';
import { RATE_LIMIT } from '#src/http/constants.js';
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
 * logged and counted (JEF-350) — here rather than at the nineteen call
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

export const rateLimiters = {
  passwordResetRateLimiter: limiter('passwordResetRateLimiter', RATE_LIMIT.PASSWORD_RESET_REQUEST),
  totpRateLimiter: limiter('totpRateLimiter', RATE_LIMIT.TOTP_VERIFICATION),
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
  computeResumeMatchScoreRateLimiter: limiter(
    'computeResumeMatchScoreRateLimiter',
    RATE_LIMIT.COMPUTE_RESUME_MATCH_SCORE,
  ),
  generateCompanyBriefingRateLimiter: limiter(
    'generateCompanyBriefingRateLimiter',
    RATE_LIMIT.GENERATE_COMPANY_BRIEFING,
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
} satisfies NameAndRegistrationPair<Cradle>;
