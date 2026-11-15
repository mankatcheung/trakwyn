import { describe, expect, it, vi } from 'vitest';
import {
  PostHogAiAnalytics,
  type PostHogCaptureClient,
} from '#src/infrastructure/analytics/PostHogAiAnalytics.js';
import { pseudonymousUserId } from '#src/infrastructure/privacy/pseudonymousUserId.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

function setup(capture: PostHogCaptureClient['capture'] = () => {}) {
  const client = {
    capture: vi.fn<PostHogCaptureClient['capture']>(capture),
    shutdown: vi.fn<PostHogCaptureClient['shutdown']>(() => Promise.resolve()),
  };
  const logger = makeLogger();
  const analytics = new PostHogAiAnalytics({
    apiKey: 'phc_test',
    host: 'https://eu.i.posthog.com',
    release: 'abc123',
    logger,
    client,
  });
  return { analytics, client, logger };
}

describe('PostHogAiAnalytics.interviewReached (JEF-598)', () => {
  it('sends the prompt version and model under a pseudonymous id, with no person profile', () => {
    const { analytics, client } = setup();

    analytics.interviewReached({
      userId: 'user-123',
      provider: 'workersai',
      model: 'gpt-oss-120b',
      promptVersion: 6,
      source: 'platform',
      tier: 'standard',
    });

    expect(client.capture).toHaveBeenCalledWith({
      distinctId: pseudonymousUserId('user-123'),
      event: 'application_interview_reached',
      disableGeoip: true,
      properties: {
        feature: 'resume',
        $ai_provider: 'workersai',
        $ai_model: 'gpt-oss-120b',
        prompt_version: 6,
        source: 'platform',
        tier: 'standard',
        $process_person_profile: false,
        release: 'abc123',
      },
    });
  });

  it('sends nothing but those fields, even if the caller hands over more', () => {
    const { analytics, client } = setup();

    analytics.interviewReached({
      userId: 'user-123',
      provider: 'byok',
      model: null,
      promptVersion: null,
      source: 'byok',
      tier: null,
      // Not part of the event type: a caller smuggling an id or text in must not reach PostHog.
      applicationId: 'app-1',
      draftId: 'draft-1',
      text: 'My resume text',
    } as never);

    const [message] = client.capture.mock.calls[0]!;
    const sent = JSON.stringify(message);
    expect(sent).not.toContain('app-1');
    expect(sent).not.toContain('draft-1');
    expect(sent).not.toContain('My resume text');
    expect(sent).not.toContain('user-123');
  });

  it('never throws when PostHog does', () => {
    const { analytics, logger } = setup(() => {
      throw new Error('network');
    });

    expect(() =>
      analytics.interviewReached({
        userId: 'user-123',
        provider: 'workersai',
        model: 'm',
        promptVersion: 1,
        source: 'platform',
        tier: null,
      }),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('posthog.capture_failed', expect.any(Error), {
      event: 'application_interview_reached',
    });
  });
});
