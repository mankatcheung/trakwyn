import { describe, expect, it, vi } from 'vitest';
import {
  PostHogAiAnalytics,
  type PostHogCaptureClient,
} from '#src/infrastructure/analytics/PostHogAiAnalytics.js';
import { pseudonymousUserId } from '#src/infrastructure/privacy/pseudonymousUserId.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { AiGenerationEvent } from '#src/use-cases/ports/IAiAnalytics.js';

const generation: AiGenerationEvent = {
  userId: 'user-123',
  traceId: 'trace-1',
  feature: 'coverLetter',
  provider: 'workersai',
  model: '@cf/google/gemma-4-26b-a4b-it',
  source: 'platform',
  promptVersion: 'v3',
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 10,
  cacheWriteTokens: 0,
  costMicros: 2500,
  latencyMs: 1500,
  outcome: 'ok',
  errorKind: null,
};

type Capture = PostHogCaptureClient['capture'];

function setup(overrides: { capture?: Capture; shutdown?: PostHogCaptureClient['shutdown'] } = {}) {
  const client = {
    capture: vi.fn<Capture>(overrides.capture),
    shutdown: vi.fn<PostHogCaptureClient['shutdown']>(
      overrides.shutdown ?? (() => Promise.resolve()),
    ),
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

describe('PostHogAiAnalytics', () => {
  it('sends a generation with a pseudonymous id, GeoIP off and no person profile', () => {
    const { analytics, client } = setup();

    analytics.generation(generation);

    const message = client.capture.mock.calls[0]?.[0];
    expect(message.event).toBe('$ai_generation');
    expect(message.distinctId).toBe(pseudonymousUserId('user-123'));
    expect(message.distinctId).not.toContain('user-123');
    expect(message.disableGeoip).toBe(true);
    expect(message.properties.$process_person_profile).toBe(false);
    expect(message.properties.release).toBe('abc123');
    expect(message.properties.$ai_input_tokens).toBe(100);
    expect(message.properties.$ai_latency).toBe(1.5);
    expect(message.properties.$ai_total_cost_usd).toBe(0.0025);
  });

  it('leaves the cost out when the model has no price', () => {
    const { analytics, client } = setup();

    analytics.generation({ ...generation, costMicros: null });

    expect(client.capture.mock.calls[0]?.[0].properties).not.toHaveProperty('$ai_total_cost_usd');
  });

  it('sends spans and feedback with the same privacy settings', () => {
    const { analytics, client } = setup();

    analytics.span({
      userId: 'user-123',
      traceId: 't',
      name: 'chat.tool',
      latencyMs: 20,
      outcome: 'error',
    });
    analytics.feedback({
      userId: 'user-123',
      traceId: null,
      feature: 'chat',
      rating: 'down',
      reason: 'wrong',
      provider: null,
      model: null,
      promptVersion: null,
    });

    for (const [message] of client.capture.mock.calls) {
      expect(message.disableGeoip).toBe(true);
      expect(message.properties.$process_person_profile).toBe(false);
    }
    expect(client.capture.mock.calls[0]?.[0].properties.$ai_is_error).toBe(true);
  });

  it('never puts prompt or output fields in a payload, even if a caller smuggles them in', () => {
    const { analytics, client } = setup();
    const smuggled = {
      ...generation,
      $ai_input: [{ role: 'user', content: 'SECRET_PROMPT' }],
      $ai_output_choices: [{ content: 'SECRET_REPLY' }],
      $ai_output: 'SECRET_REPLY',
      messages: 'SECRET_PROMPT',
    } as AiGenerationEvent;

    analytics.generation(smuggled);
    analytics.span({ ...smuggled, name: 'x', latencyMs: 1, outcome: 'ok' } as never);
    analytics.feedback({ ...smuggled, rating: 'up', reason: null } as never);

    for (const [message] of client.capture.mock.calls) {
      const serialized = JSON.stringify(message);
      expect(message.properties).not.toHaveProperty('$ai_input');
      expect(message.properties).not.toHaveProperty('$ai_output_choices');
      expect(message.properties).not.toHaveProperty('$ai_output');
      expect(serialized).not.toContain('SECRET_PROMPT');
      expect(serialized).not.toContain('SECRET_REPLY');
    }
  });

  it('sends span id, time to first token, tier and reasoning tokens when present, and omits them otherwise (JEF-567)', () => {
    const { analytics, client } = setup();

    analytics.generation({
      ...generation,
      spanId: 'span-1',
      timeToFirstTokenMs: 250,
      tier: 'lite',
      reasoningTokens: 7,
    });
    analytics.generation(generation);

    const [withExtras, without] = client.capture.mock.calls.map((c) => c[0].properties);
    expect(withExtras).toMatchObject({
      $ai_span_id: 'span-1',
      $ai_time_to_first_token: 0.25,
      tier: 'lite',
      reasoning_tokens: 7,
    });
    expect(without).not.toHaveProperty('$ai_span_id');
    expect(without).not.toHaveProperty('$ai_time_to_first_token');
    expect(without).not.toHaveProperty('tier');
    expect(without).not.toHaveProperty('reasoning_tokens');
  });

  it('does not throw when a capture fails, and logs no payload', () => {
    const { analytics, logger } = setup({
      capture: vi.fn(() => {
        throw new Error('network down');
      }),
    });

    expect(() => analytics.generation(generation)).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith('posthog.capture_failed', expect.any(Error), {
      event: '$ai_generation',
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('coverLetter');
  });

  it('flushes on shutdown and does not throw when the flush fails', async () => {
    const ok = setup();
    await ok.analytics.shutdown();
    expect(ok.client.shutdown).toHaveBeenCalledTimes(1);

    const failing = setup({ shutdown: vi.fn().mockRejectedValue(new Error('timeout')) });
    await expect(failing.analytics.shutdown()).resolves.toBeUndefined();
    expect(failing.logger.warn).toHaveBeenCalled();
  });
});
