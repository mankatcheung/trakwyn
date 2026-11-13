import { describe, expect, it, vi } from 'vitest';
import { UserLLMProviderFactory } from '#src/infrastructure/llm/UserLLMProviderFactory.js';
import { LLM_PROVIDER, AI_FEATURE } from '#src/use-cases/constants.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { IAiAnalytics, AiGenerationEvent } from '#src/use-cases/ports/IAiAnalytics.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import {
  makeLLMProvider,
  makeLlmApiKey,
  makeLlmApiKeyCipher,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeLogger, makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

const usage = { promptTokens: 10, completionTokens: 5 };

function fakeAnalytics() {
  const generation = vi.fn<(e: AiGenerationEvent) => void>();
  const analytics: IAiAnalytics = {
    generation,
    span: vi.fn(),
    feedback: vi.fn(),
    feedbackCleared: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  return { analytics, generation };
}

function setup(platformFactory?: IPlatformLLMProviderFactory) {
  const { analytics, generation } = fakeAnalytics();
  const user = makeUser({
    aiSource: platformFactory ? 'trakwyn' : 'own',
    plan: 'pro',
    planExpiresAt: null,
    defaultLlmProvider: LLM_PROVIDER.OPENAI,
  });
  const factory = new UserLLMProviderFactory({
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
    llmApiKeyRepository: makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI })),
    }),
    llmApiKeyCipher: makeLlmApiKeyCipher(),
    outboundUrlPolicy: makeOutboundUrlPolicy(),
    llmUsageEventRepository: makeLlmUsageEventRepository(),
    logger: makeLogger(),
    generateId: () => 'evt-id',
    aiAnalytics: analytics,
    platformLlmProviderFactory: platformFactory,
  });
  return { factory, generation };
}

describe('UserLLMProviderFactory AI analytics (JEF-567)', () => {
  it('sends no event for a key test (trackUsage: false)', async () => {
    const { factory, generation } = setup();

    const resolution = await factory.resolveForUser('user-1', {
      feature: AI_FEATURE.CHAT,
      trackUsage: false,
    });
    expect(resolution).not.toBeNull();
    // The raw provider is returned without a decorator; with no network it will
    // fail, but never reach analytics.
    await resolution!.provider.complete([]).catch(() => undefined);

    expect(generation).not.toHaveBeenCalled();
  });

  it('each failover leg records its own event, with the feature and tier', async () => {
    const failing = makeLLMProvider('x');
    failing.complete = vi
      .fn()
      .mockRejectedValue(new LlmProviderError('unavailable', { status: 503 }));
    const answering = makeLLMProvider('ok');
    answering.complete = vi.fn().mockResolvedValue({ content: 'ok', usage });
    const platform: IPlatformLLMProviderFactory = {
      isEnabled: () => true,
      isEnabledFor: () => true,
      legs: vi.fn(() => [
        { providerId: 'workersai', model: '@cf/google/gemma-4-26b-a4b-it', provider: failing },
        { providerId: 'workersai', model: '@cf/openai/gpt-oss-120b', provider: answering },
      ]),
    };
    const { factory, generation } = setup(platform);

    const resolution = await factory.resolveForUser('user-1', { feature: AI_FEATURE.CHAT });
    await resolution!.provider.complete([]);

    expect(generation).toHaveBeenCalledTimes(2);
    const [first, second] = generation.mock.calls.map((c) => c[0]);
    expect(first).toMatchObject({
      outcome: 'error',
      errorKind: 'unavailable',
      model: '@cf/google/gemma-4-26b-a4b-it',
    });
    expect(second).toMatchObject({
      outcome: 'ok',
      model: '@cf/openai/gpt-oss-120b',
      source: 'platform',
    });
    for (const e of [first, second]) {
      expect(e!.feature).toBe(AI_FEATURE.CHAT);
      expect(e!.tier).toBeDefined();
    }
  });
});
