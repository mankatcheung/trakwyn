import { describe, it, expect, vi, type Mock } from 'vitest';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { CreditRefundingLLMProvider } from '#src/infrastructure/llm/CreditRefundingLLMProvider.js';
import { AiCreditsExhaustedError, LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { AI_FEATURE, LLM_USAGE_SOURCE, type LlmUsageSource } from '#src/use-cases/constants.js';
import {
  makeLlmApiKey,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeAiCreditService } from '#src/__tests__/helpers/mocks/plans.js';

function build(source: LlmUsageSource, chargeImpl?: () => Promise<unknown>) {
  const provider = {
    complete: vi.fn().mockRejectedValue(new LlmProviderError('unavailable', { status: 503 })),
    completeWithToolsStream: vi.fn(),
  };
  const refund = vi.fn().mockResolvedValue(undefined);
  const aiCreditService = makeAiCreditService({
    charge: vi.fn(chargeImpl ?? (async () => ({ refund }))) as never,
  });
  const inner = {
    forUser: vi.fn(),
    resolveForUser: vi
      .fn()
      .mockResolvedValue({ provider, providerId: 'openai', fellBackFrom: null, source }),
    fromCredentials: vi.fn(),
  };
  const factory = new LimitEnforcingLLMProviderFactory({
    userLlmProviderFactory: inner,
    userRepository: makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ defaultLlmProvider: 'openai' })),
    }),
    llmApiKeyRepository: makeLlmApiKeyRepository({
      findAllByUserId: vi.fn().mockResolvedValue([makeLlmApiKey({ provider: 'openai' })]),
    }),
    llmUsageEventRepository: makeLlmUsageEventRepository({
      summarizeByUserId: vi.fn().mockResolvedValue([]),
    }),
    now: () => new Date('2026-03-15T12:00:00.000Z'),
    aiCreditService,
  });
  return { factory, aiCreditService, provider, refund };
}

describe('LimitEnforcingLLMProviderFactory hosted AI credits (JEF-447)', () => {
  it('charges the feature once when the call runs on the platform key', async () => {
    const { factory, aiCreditService } = build(LLM_USAGE_SOURCE.PLATFORM);

    await factory.resolveForUser('user-1', { feature: AI_FEATURE.COVER_LETTER });

    expect(aiCreditService.charge).toHaveBeenCalledTimes(1);
    expect(aiCreditService.charge).toHaveBeenCalledWith('user-1', AI_FEATURE.COVER_LETTER);
  });

  it('never charges a call on the user’s own key', async () => {
    const { factory, aiCreditService, provider } = build(LLM_USAGE_SOURCE.BYOK);

    const resolution = await factory.resolveForUser('user-1', { feature: AI_FEATURE.CHAT });

    expect(aiCreditService.charge).not.toHaveBeenCalled();
    expect(resolution?.provider).toBe(provider);
  });

  it('never charges a key test, even if it resolved on the platform', async () => {
    const { factory, aiCreditService } = build(LLM_USAGE_SOURCE.PLATFORM);

    await factory.resolveForUser('user-1', { feature: AI_FEATURE.KEY_TEST, trackUsage: false });

    expect(aiCreditService.charge).not.toHaveBeenCalled();
  });

  it('hands back the provider unwrapped when the feature weighs nothing', async () => {
    const { factory, provider } = build(LLM_USAGE_SOURCE.PLATFORM, async () => null);

    const resolution = await factory.resolveForUser('user-1', { feature: AI_FEATURE.KEY_TEST });

    expect(resolution?.provider).toBe(provider);
  });

  it('refunds when the platform provider fails before any output', async () => {
    const { factory, refund } = build(LLM_USAGE_SOURCE.PLATFORM);

    const resolution = await factory.resolveForUser('user-1', { feature: AI_FEATURE.CHAT });
    expect(resolution?.provider).toBeInstanceOf(CreditRefundingLLMProvider);
    await expect(resolution!.provider.complete([])).rejects.toBeInstanceOf(LlmProviderError);

    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('refuses with AI_CREDITS_EXHAUSTED and resolves no provider', async () => {
    const { factory } = build(LLM_USAGE_SOURCE.PLATFORM, async () => {
      throw new AiCreditsExhaustedError(30, new Date('2026-04-01T00:00:00.000Z'));
    });

    await expect(factory.forUser('user-1', { feature: AI_FEATURE.CHAT })).rejects.toBeInstanceOf(
      AiCreditsExhaustedError,
    );
  });

  it('charges nothing when nothing resolves', async () => {
    const { factory, aiCreditService } = build(LLM_USAGE_SOURCE.PLATFORM);
    vi.mocked(
      (
        factory as unknown as {
          deps: { userLlmProviderFactory: { resolveForUser: () => unknown } };
        }
      ).deps.userLlmProviderFactory.resolveForUser,
    ).mockResolvedValue(null);

    expect(await factory.resolveForUser('user-1', { feature: AI_FEATURE.CHAT })).toBeNull();
    expect(aiCreditService.charge).not.toHaveBeenCalled();
  });

  it('sends a Pro overflow on a mid-tier resolution back through as lite', async () => {
    const refund = vi.fn();
    const { factory } = build(LLM_USAGE_SOURCE.PLATFORM, async () => ({ refund, overflow: true }));
    const inner = (
      factory as unknown as { deps: { userLlmProviderFactory: { resolveForUser: Mock } } }
    ).deps.userLlmProviderFactory;
    const liteProvider = { complete: vi.fn(), completeWithToolsStream: vi.fn() };
    inner.resolveForUser
      .mockResolvedValueOnce({
        provider: {},
        providerId: 'googleai',
        fellBackFrom: null,
        source: LLM_USAGE_SOURCE.PLATFORM,
        tier: 'mid',
        plan: 'pro',
      })
      .mockResolvedValueOnce({
        provider: liteProvider,
        providerId: 'googleai',
        fellBackFrom: null,
        source: LLM_USAGE_SOURCE.PLATFORM,
        tier: 'lite',
        plan: 'pro',
      });

    const resolution = await factory.resolveForUser('user-1', { feature: AI_FEATURE.RESUME });

    expect(inner.resolveForUser).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({ feature: AI_FEATURE.RESUME, tier: 'lite' }),
      expect.anything(),
    );
    expect(resolution?.tier).toBe('lite');
    expect(resolution?.provider).toBeInstanceOf(CreditRefundingLLMProvider);
  });

  it('does not resolve twice when the overflow is already lite', async () => {
    const { factory } = build(LLM_USAGE_SOURCE.PLATFORM, async () => ({
      refund: vi.fn(),
      overflow: true,
    }));
    const inner = (
      factory as unknown as { deps: { userLlmProviderFactory: { resolveForUser: Mock } } }
    ).deps.userLlmProviderFactory;
    inner.resolveForUser.mockResolvedValue({
      provider: {},
      providerId: 'googleai',
      fellBackFrom: null,
      source: LLM_USAGE_SOURCE.PLATFORM,
      tier: 'lite',
      plan: 'pro',
    });

    await factory.resolveForUser('user-1', { feature: AI_FEATURE.CHAT });

    expect(inner.resolveForUser).toHaveBeenCalledTimes(1);
  });
});
