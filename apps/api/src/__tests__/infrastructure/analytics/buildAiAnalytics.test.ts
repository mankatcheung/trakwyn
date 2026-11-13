import { describe, expect, it } from 'vitest';
import { buildAiAnalytics } from '#src/infrastructure/analytics/buildAiAnalytics.js';
import { NoopAiAnalytics } from '#src/infrastructure/analytics/NoopAiAnalytics.js';
import { PostHogAiAnalytics } from '#src/infrastructure/analytics/PostHogAiAnalytics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

describe('buildAiAnalytics', () => {
  it('is a no-op in test and dev, even with a key', () => {
    for (const NODE_ENV of ['test', 'development', undefined]) {
      const analytics = buildAiAnalytics(makeLogger(), { NODE_ENV, POSTHOG_API_KEY: 'phc_x' });
      expect(analytics).toBeInstanceOf(NoopAiAnalytics);
    }
  });

  it('is a no-op in production without a key', () => {
    expect(buildAiAnalytics(makeLogger(), { NODE_ENV: 'production' })).toBeInstanceOf(
      NoopAiAnalytics,
    );
    expect(
      buildAiAnalytics(makeLogger(), { NODE_ENV: 'production', POSTHOG_API_KEY: '' }),
    ).toBeInstanceOf(NoopAiAnalytics);
  });

  it('selects PostHog in production with a key, and says so', async () => {
    const logger = makeLogger();

    const analytics = buildAiAnalytics(logger, {
      NODE_ENV: 'production',
      POSTHOG_API_KEY: 'phc_x',
    });

    expect(analytics).toBeInstanceOf(PostHogAiAnalytics);
    expect(logger.info).toHaveBeenCalledWith(
      'AI analytics: PostHog adapter selected',
      expect.objectContaining({ event: 'ai_analytics.selected' }),
    );
    await analytics.shutdown();
  });

  it('the no-op adapter accepts every call', async () => {
    const analytics = new NoopAiAnalytics();
    expect(() => analytics.generation()).not.toThrow();
    expect(() => analytics.span()).not.toThrow();
    expect(() => analytics.feedback()).not.toThrow();
    await expect(analytics.shutdown()).resolves.toBeUndefined();
  });
});
