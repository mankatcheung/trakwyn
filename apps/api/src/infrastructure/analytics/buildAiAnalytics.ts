import { ENV, POSTHOG } from '#src/infrastructure/config/constants.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';
import { NoopAiAnalytics } from './NoopAiAnalytics.js';
import { PostHogAiAnalytics } from './PostHogAiAnalytics.js';

/**
 * PostHog only in production with a key, like Axiom: a key in a dev `.env`
 * must not send local traffic into the production project (JEF-566).
 */
export function buildAiAnalytics(logger: ILogger, env = process.env): IAiAnalytics {
  const apiKey = env[ENV.POSTHOG_API_KEY];
  if (env.NODE_ENV !== 'production' || !apiKey) {
    return new NoopAiAnalytics();
  }
  logger.info('AI analytics: PostHog adapter selected', { event: 'ai_analytics.selected' });
  return new PostHogAiAnalytics({
    apiKey,
    host: env[ENV.POSTHOG_HOST] || POSTHOG.DEFAULT_HOST,
    release: env[ENV.APP_RELEASE] || 'dev',
    logger,
  });
}
